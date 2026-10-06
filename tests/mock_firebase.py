"""測試用：模擬 Firebase Realtime Database（REST＋SSE）與登入（匿名、Email＋密碼）。
沒帶 ?auth= 的請求：測試用直接讀寫（班級代碼 16 碼以上）。
有帶 ?auth=：照 database.rules.json 的規則。tok-<uid>＝匿名；tokp-<uid>＝老師帳號（Email＋密碼）。"""
import json, threading, queue, sys, uuid
from urllib.parse import urlparse, parse_qs
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

DATA = {}
SUBS = []  # [path_parts, queue, uid, legacy, prov]
USERS = {}  # email → {uid, pw}
LOCK = threading.Lock()


def parts(path):
    p = urlparse(path).path
    if p.endswith(".json"):
        p = p[:-5]
    return [x for x in p.split("/") if x]


def get_node(ps):
    n = DATA
    for k in ps:
        if not isinstance(n, dict) or k not in n:
            return None
        n = n[k]
    return n


def set_node(ps, val):
    n = DATA
    for k in ps[:-1]:
        n = n.setdefault(k, {})
    if val is None:
        n.pop(ps[-1], None)
    else:
        n[ps[-1]] = val


# ───── 規則（對照 database.rules.json） ─────
def owner(c):
    return get_node(["classes", c, "owner"])


def is_admin(c, uid, prov):
    """後台的老師：建立者，而且是用老師帳號（Email＋密碼）登入"""
    return bool(uid) and prov == "password" and owner(c) == uid


def mem(c, uid):
    m = get_node(["classes", c, "members", uid]) if uid else None
    return m if isinstance(m, dict) else {}


def can_read(ps, uid, legacy, prov):
    if len(ps) == 2 and ps[0] == "teachers":
        return legacy or (bool(uid) and ps[1] == uid)
    if len(ps) == 2 and ps[0] == "codes":
        return bool(uid) or legacy
    if ps and ps[0] == "recs":
        if legacy:
            return True
        return len(ps) >= 3 and bool(uid) and (is_admin(ps[1], uid, prov) or mem(ps[1], uid).get("sid") == ps[2])
    if not (len(ps) >= 2 and ps[0] == "classes" and len(ps[1]) >= 16):
        return False
    if legacy:
        return True
    c = ps[1]
    if is_admin(c, uid, prov):
        return True  # 老師可以讀整個後台
    if len(ps) < 3:
        return False
    sec = ps[2]
    if sec in ("owner", "open", "legacy"):
        return bool(uid)
    if sec == "members" and len(ps) >= 4 and ps[3] == uid:
        return True
    if sec in ("students", "a", "s", "live", "hw") and len(ps) >= 4:
        return bool(uid) and mem(c, uid).get("sid") == ps[3]
    return False


def can_write(ps, uid, val, legacy, prov):
    if legacy and ps and ps[0] in ("codes", "recs", "teachers"):
        return True  # 測試用：沒帶 auth 直接改
    if ps and ps[0] == "teachers":
        if len(ps) != 2 or not uid or ps[1] != uid or prov != "password":
            return False
        return val is None or (isinstance(val, dict) and isinstance(val.get("c"), str) and len(val["c"]) >= 16 and "at" in val and owner(val["c"]) == uid)
    if ps and ps[0] == "recs":
        if len(ps) < 3 or not uid:
            return False
        if is_admin(ps[1], uid, prov):
            return True
        m = mem(ps[1], uid)
        return len(ps) == 4 and m.get("sid") == ps[2] and m.get("role") == "student" and (val is None or (isinstance(val, dict) and "d" in val and "ts" in val))
    if len(ps) == 2 and ps[0] == "codes":
        if not uid or len(ps[1]) != 6:
            return False
        old = get_node(ps)
        if val is not None:
            if not (isinstance(val, dict) and {"c", "s", "exp"} <= set(val)):
                return False
            return is_admin(val["c"], uid, prov) and (old is None or old.get("c") == val["c"])
        return isinstance(old, dict) and is_admin(old.get("c", ""), uid, prov)
    if not (len(ps) >= 2 and ps[0] == "classes" and len(ps[1]) >= 16):
        return False
    if legacy:
        return True
    if len(ps) < 3:
        return False
    c, sec = ps[1], ps[2]
    adm = is_admin(c, uid, prov)
    if sec == "owner":
        if not uid or prov != "password":
            return False
        if val is None:  # 空的後台（沒有成員、沒有學生）才能刪 owner：測試清理用
            return get_node(ps) == uid and not get_node(["classes", c, "members"]) and not get_node(["classes", c, "students"])
        return get_node(ps) is None and val == uid
    if sec == "tkey":
        return adm and val is None  # 老師連結已停用：只能刪掉
    if sec in ("open", "legacy", "blocked", "hw"):
        return adm
    if sec == "students":  # 規則寫在 students/$sid：整個 students 不能一次刪
        return adm and len(ps) >= 4
    if sec == "members":
        if len(ps) < 4:
            return False
        if adm:
            return True
        # 自己加入：名單上還沒有、沒被移除過、開放加入中＋學生存在；不能用老師身分加入
        if not (len(ps) == 4 and ps[3] == uid and get_node(ps) is None and isinstance(val, dict) and "role" in val and "at" in val):
            return False
        if get_node(["classes", c, "blocked", uid]) is not None or val["role"] == "teacher":
            return False
        return get_node(["classes", c, "open"]) is True and get_node(["classes", c, "students", str(val.get("sid"))]) is not None
    if sec in ("a", "s", "live"):
        if adm:
            return True
        if len(ps) < 5:
            return False
        m = mem(c, uid)
        if m.get("sid") != ps[3]:
            return False
        return sec == "live" or (val is not None and m.get("role") == "student")
    return False


STU_KEYS = {"name", "at", "code", "codeExp", "units"}
MEM_KEYS = {"role", "sid", "name", "dev", "pid", "at"}


def valid(ps, val):
    """對照 database.rules.json 的 .validate（只檢查有寫到的部分）"""
    if val is None or len(ps) < 3 or ps[0] != "classes":
        return True
    sec, rest = ps[2], ps[3:]
    units_ok = lambda u: isinstance(u, dict) and all(isinstance(v, bool) for v in u.values())
    if sec == "students":
        if len(rest) == 1:
            return isinstance(val, dict) and set(val) <= STU_KEYS and units_ok(val.get("units", {}))
        if len(rest) == 2:
            return rest[1] in STU_KEYS and (rest[1] != "units" or units_ok(val))
        if len(rest) == 3:
            return rest[1] == "units" and isinstance(val, bool)
    if sec == "members":
        if len(rest) == 1:
            return isinstance(val, dict) and set(val) <= MEM_KEYS and val.get("role") in ("student", "parent", "teacher") and "at" in val
        if len(rest) == 2:
            return rest[1] in MEM_KEYS
    if sec in ("a", "s"):
        need = {"q", "r", "ts", "d"} if sec == "a" else {"k", "ts", "d"}
        ok = lambda v: isinstance(v, dict) and need <= set(v) and (sec != "a" or (isinstance(v["q"], str) and len(v["q"]) < 24))
        if len(rest) == 2:
            return ok(val)
        if len(rest) == 1:
            return isinstance(val, dict) and all(ok(v) for v in val.values())
    return True


def notify(ps, event, data):
    for sp, q, uid, legacy, prov in list(SUBS):
        if ps[: len(sp)] == sp:
            rel = "/" + "/".join(ps[len(sp):])
            q.put((event, {"path": rel, "data": data}))
        elif sp[: len(ps)] == ps:
            q.put(("put", {"path": "/", "data": get_node(sp)}))
    # 權限可能改變了：讀不到的串流要收到 cancel
    for sp, q, uid, legacy, prov in list(SUBS):
        if not can_read(sp, uid, legacy, prov):
            q.put(("cancel", "Permission denied"))


def tokens(uid, prov):
    p = "p" if prov == "password" else ""
    return {"idToken": f"tok{p}-{uid}", "refreshToken": f"rt{p}-{uid}", "expiresIn": "3600", "localId": uid}


class H(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, PUT, PATCH, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")

    def log_message(self, *a):
        pass

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def raw(self):
        n = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(n) if n else b""

    def body(self):
        return json.loads(self.raw() or b"null")

    def reply(self, obj, code=200):
        b = json.dumps(obj).encode()
        self.send_response(code)
        self.cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def err(self, msg):
        return self.reply({"error": {"code": 400, "message": msg}}, 400)

    def who(self):
        q = parse_qs(urlparse(self.path).query)
        t = (q.get("auth") or [""])[0]
        if not t:
            return None, True, None
        if t.startswith("tokp-"):
            return t[5:], False, "password"
        return (t[4:] if t.startswith("tok-") else None), False, "anonymous"

    def do_POST(self):
        p = urlparse(self.path).path
        if p.endswith("/v1/token"):
            form = parse_qs(self.raw().decode())
            rt = (form.get("refresh_token") or [""])[0]
            if rt.startswith("rtp-"):
                uid, prov = rt[4:], "password"
            elif rt.startswith("rt-"):
                uid, prov = rt[3:], "anonymous"
            else:
                return self.reply({"error": "INVALID_REFRESH_TOKEN"}, 400)
            t = tokens(uid, prov)
            return self.reply({"id_token": t["idToken"], "refresh_token": t["refreshToken"], "expires_in": "3600", "user_id": uid})
        b = self.body() or {}
        email, pw = (b.get("email") or "").lower(), b.get("password") or ""
        with LOCK:
            if p.endswith("accounts:signUp"):
                if not email:
                    return self.reply(tokens(uuid.uuid4().hex[:20], "anonymous"))
                if email in USERS:
                    return self.err("EMAIL_EXISTS")
                if len(pw) < 6:
                    return self.err("WEAK_PASSWORD : Password should be at least 6 characters")
                uid = uuid.uuid4().hex[:20]
                USERS[email] = {"uid": uid, "pw": pw}
                return self.reply({**tokens(uid, "password"), "email": email})
            if p.endswith("accounts:signInWithPassword"):
                u = USERS.get(email)
                if not u or u["pw"] != pw:
                    return self.err("INVALID_LOGIN_CREDENTIALS")
                return self.reply({**tokens(u["uid"], "password"), "email": email})
            if p.endswith("accounts:update"):  # 匿名身分升級成帳號：身分（uid）不變
                t = b.get("idToken") or ""
                uid = t.split("-", 1)[1] if "-" in t else ""
                if not uid:
                    return self.err("INVALID_ID_TOKEN")
                if email in USERS:
                    return self.err("EMAIL_EXISTS")
                if len(pw) < 6:
                    return self.err("WEAK_PASSWORD : Password should be at least 6 characters")
                USERS[email] = {"uid": uid, "pw": pw}
                return self.reply({**tokens(uid, "password"), "email": email})
            if p.endswith("accounts:sendOobCode"):
                return self.reply({"email": email})
        return self.reply({"error": "not found"}, 404)

    def do_GET(self):
        ps = parts(self.path)
        uid, legacy, prov = self.who()
        if not can_read(ps, uid, legacy, prov):
            return self.reply({"error": "Permission denied"}, 401)
        if "text/event-stream" in (self.headers.get("Accept") or ""):
            q = queue.Queue()
            sub = [ps, q, uid, legacy, prov]
            with LOCK:
                SUBS.append(sub)
                first = get_node(ps)
            self.send_response(200)
            self.cors()
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            try:
                self.wfile.write(f"event: put\ndata: {json.dumps({'path': '/', 'data': first})}\n\n".encode())
                self.wfile.flush()
                while True:
                    try:
                        ev, d = q.get(timeout=15)
                        self.wfile.write(f"event: {ev}\ndata: {json.dumps(d)}\n\n".encode())
                        self.wfile.flush()
                        if ev == "cancel":
                            break
                    except queue.Empty:
                        self.wfile.write(b"event: keep-alive\ndata: null\n\n")
                        self.wfile.flush()
            except Exception:
                pass
            finally:
                with LOCK:
                    SUBS[:] = [s for s in SUBS if s[1] is not q]
            return
        with LOCK:
            self.reply(get_node(ps))

    def write(self, method):
        ps = parts(self.path)
        uid, legacy, prov = self.who()
        v = None if method == "DELETE" else self.body()
        with LOCK:
            if method == "PATCH":
                ok = all(can_write(ps + k.split("/"), uid, val, legacy, prov) and (legacy or valid(ps + k.split("/"), val)) for k, val in (v or {}).items())
            else:
                ok = can_write(ps, uid, v, legacy, prov) and (legacy or valid(ps, v))
            if not ok:
                return self.reply({"error": "Permission denied"}, 401)
            if method == "PATCH":
                for k, val in v.items():
                    set_node(ps + k.split("/"), val)
                notify(ps, "patch", v)
            else:
                set_node(ps, v)
                notify(ps, "put", v)
        self.reply(v)

    def do_PUT(self):
        self.write("PUT")

    def do_PATCH(self):
        self.write("PATCH")

    def do_DELETE(self):
        self.write("DELETE")


port = int(sys.argv[1]) if len(sys.argv) > 1 else 5190
ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
