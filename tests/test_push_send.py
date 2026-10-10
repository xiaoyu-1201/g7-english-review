"""2.23 每天晚上的通知（tools/push/send.mjs）：誰在什麼時間收到什麼、一天只發一次、失效的訂閱刪掉、
老師沒開放時學生家長不發、測試通知、dry 不發不寫、執行紀錄不印名字和代碼。
用模擬資料庫（5190）＋假的推播服務（5192，收到的通知用訂閱的私鑰解開來看）"""
import json, os, random, shutil, string, subprocess, threading, time, pathlib
from datetime import datetime, timedelta, timezone
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from synchelp import check, http, report, DB

HERE = pathlib.Path(__file__).parent
SEND = HERE.parent / "tools" / "push" / "send.mjs"
NODE = shutil.which("node") or r"C:\Program Files\nodejs\node.exe"
OUTF = HERE / ".cache" / "push_out.json"
OUTF.parent.mkdir(exist_ok=True)
TW = timezone(timedelta(hours=8))
ms = lambda *a: int(datetime(*a, tzinfo=TW).timestamp() * 1000)

# ── 假的推播服務：記下收到的通知；/gone/ 回 410（訂閱失效） ──
GOT = []


class P(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        GOT.append({"path": self.path, "h": dict(self.headers), "body": self.rfile.read(n)})
        code = 410 if self.path.startswith("/gone/") else 500 if self.path.startswith("/err/") else 201
        self.send_response(code)
        self.send_header("Content-Length", "0")
        self.end_headers()


srv = ThreadingHTTPServer(("127.0.0.1", 5192), P)
threading.Thread(target=srv.serve_forever, daemon=True).start()


def node(*args):
    return json.loads(subprocess.run([NODE, str(HERE / "push_helper.mjs"), *args], capture_output=True, text=True, encoding="utf-8", check=True).stdout)


VAPID = node("vapid")
KEYS = node("keys", "10")
C = "".join(random.choice(string.ascii_lowercase + string.digits) for _ in range(20))
SUN = (2026, 10, 11)  # 星期日
NOW0 = ms(*SUN, 19, 40)


def sub(i, path, role, sid=None):
    k = KEYS[i]
    r = {"e": f"http://127.0.0.1:5192{path}", "p": k["pub"], "a": k["auth"], "role": role, "at": NOW0}
    if sid:
        r["sid"] = sid
    return r


EP = {}  # 通知位址 → 那個訂閱的金鑰（解密用）
SUBS = {
    ("S1", "d1"): (0, "/ep/s1", "student", "amy"),
    ("S2", "d1"): (1, "/ep/s2", "student", "ben"),
    ("P1", "d1"): (2, "/ep/p1", "parent", "amy"),
    ("T1", "d1"): (3, "/ep/t1", "teacher", None),
    ("T1", "d2"): (4, "/ep/t2", "teacher", None),
    ("X9", "d1"): (5, "/ep/x9", "student", "amy"),  # 不在名單上（被移除了）
    ("S1", "d2"): (6, "/gone/s1b", "student", "amy"),  # 推播服務說已經失效（410）
    ("P1", "d9"): (7, "/ep/p9", "student", "amy"),  # 家長的身分卻說自己是學生
}
for (uid, dev), (i, path, role, sid) in SUBS.items():
    http("PUT", f"/push/{C}/{uid}/{dev}.json", sub(i, path, role, sid))
    EP[path] = KEYS[i]
http("PUT", f"/push/{C}/S1/d3.json", {**sub(8, "/x", "student", "amy"), "e": "https://evil.example.com/x"})  # 不是推播服務的網址
http("PUT", f"/push/{C}/P1/dBad.json", {**sub(2, "/ep/pbad", "parent", "amy"), "p": "BAD"})  # 金鑰長度不對
http("PUT", f"/push/{C}/T1/dOld.json", {**sub(3, "/ep/t1", "teacher"), "at": NOW0 - 500000})  # 同一支手機的舊紀錄（同一個推播位址）
http("PUT", f"/push/{C}/T1/d3.json", {**sub(3, "/ep/t3", "teacher"), "k": "OLDKEYOLDKEYOLDK"})  # 換金鑰之前訂的
http("PUT", f"/push/{C}/P1/d5.json", sub(9, "/err/p5", "parent", "amy"))  # 推播服務回 500（下一輪要重試）
EP["/err/p5"] = KEYS[9]
for n in range(7):  # 同一個身分 7 台：最多留 5 台（舊金鑰，所以不會發）
    http("PUT", f"/push/{C}/S3/c{n}.json", {**sub(1, f"/ep/c{n}", "student", "ben"), "k": "OLDKEYOLDKEYOLDK", "at": NOW0 - (n + 1) * 1000})

# ── 班級資料：Amy 還沒練、作業（2 項）明天晚上 12 點到期；Ben 今天 18:00 做了 3 題、作業做完 ──
t18 = ms(*SUN, 18, 0)
cls = {
    "owner": "T1",
    "notify": True,
    "students": {"amy": {"name": "Amy", "at": NOW0 - 20 * 86400000}, "ben": {"name": "Ben", "at": NOW0 - 20 * 86400000}},
    "members": {"S1": {"role": "student", "sid": "amy", "at": 1}, "S2": {"role": "student", "sid": "ben", "at": 1}, "P1": {"role": "parent", "sid": "amy", "at": 1}, "S3": {"role": "student", "sid": "ben", "at": 1}},
    "hw": {
        "amy": {"h1": {"title": "Unit 1 練習", "tasks": [{"k": "mod", "id": "u1a"}, {"k": "exam"}], "at": NOW0 - 2 * 86400000, "due": ms(2026, 10, 12, 23, 59)}},
        "ben": {"h2": {"title": "Unit 1", "tasks": [{"k": "mod", "id": "u1a"}], "at": NOW0 - 86400000}},
    },
    "a": {"ben": {f"{t18 + i}-u1a-{i}-x": {"q": f"u1a-{i}", "r": "ok", "ts": t18 + i, "d": "x"} for i in range(3)}},
    "s": {"ben": {f"{t18 + 9}-m_u1a-x": {"k": "m:u1a", "ts": t18 + 9, "d": "x", "s": 100, "n": 3}}},
}
http("PUT", f"/classes/{C}.json", cls)
http("PUT", "/pushlog/2026-09-01.json", {"x": 1})  # 很舊的發送紀錄：要被清掉


def run(mode, now, label, code=0):
    env = {**os.environ, "MODE": mode, "DB": DB, "NOW": str(now), "PUSH_ALLOW_LOCAL": "1", "VAPID_PRIVATE": VAPID["priv"], "PUSH_OUT": str(OUTF)}
    env.pop("FIREBASE_SA", None)
    n0 = len(GOT)
    if OUTF.exists():
        OUTF.unlink()
    r = subprocess.run([NODE, str(SEND)], env=env, capture_output=True, text=True, encoding="utf-8", timeout=60)
    check(r.returncode == code, f"[{label}] send.mjs exits {code} ({r.stderr.strip()[:120]})")
    log = r.stdout + r.stderr
    check(not any(w in log for w in ("Amy", "Ben", C, "127.0.0.1", "evil")), f"[{label}] log has only counts (no names, class code, addresses)")
    time.sleep(0.2)
    new = GOT[n0:]
    out = json.loads(OUTF.read_text("utf-8")) if OUTF.exists() else {"out": json.loads(r.stdout.strip().splitlines()[-1]), "list": []}
    return new, out


def opened(got):
    """解開收到的通知 → {位址: 內容}"""
    tmp = HERE / ".cache" / "push_dec.json"
    tmp.write_text(json.dumps([{"body": __import__("base64").b64encode(g["body"]).decode(), "priv": EP[g["path"]]["priv"], "auth": EP[g["path"]]["auth"]} for g in got]), "utf-8")
    res = node("decrypt", str(tmp))
    return {g["path"]: (json.loads(t) if not t.startswith("ERR") else t) for g, t in zip(got, res)}


# ① 星期日 19:40：學生的時間到了（家長 20:00、老師 21:00 還沒到）
got, out = run("run", NOW0, "Sun 19:40")
paths = sorted(g["path"] for g in got)
check(paths == ["/ep/s1", "/gone/s1b"], f"only Amy's devices get the 19:30 reminder (Ben practiced today) ({paths})")
msg = opened([g for g in got if g["path"] == "/ep/s1"])["/ep/s1"]
check(msg.get("title") == "作業快到期了" and "還剩 2 項" in msg.get("body", "") and "明天晚上 12 點前要完成" in msg["body"], f"Amy: homework due tomorrow ({msg})")
check(msg.get("url") == "./#/" and msg.get("tag") == "daily-student", "tap opens the home page; tag daily-student")
h = next(g["h"] for g in got if g["path"] == "/ep/s1")
hl = {k.lower(): v for k, v in h.items()}
check(hl.get("content-encoding") == "aes128gcm" and hl.get("ttl") == "7200" and hl.get("authorization", "").startswith("vapid t=") and hl["authorization"].endswith("k=" + VAPID["pub"]), "headers: aes128gcm, TTL 2h, VAPID with our public key")
p = lambda path: http("GET", f"/push/{C}/{path}.json")[1]
check(not p("X9") and not p("S1/d2") and not p("S1/d3") and not p("P1/d9") and not p("P1/dBad"), "removed member / 410 / non-push URL / wrong role / bad key length → subscription deleted")  # 模擬資料庫刪完會留下空的 {}
check(not p("T1/dOld") and p("T1/d1"), "same phone saved twice (same endpoint) → only the newest kept")
check(len(p("S3") or {}) == 5 and p("S3/c0") and not p("S3/c6"), f"one identity keeps at most 5 devices (newest) ({sorted(p('S3') or {})})")
check(p("S1/d1") is not None and p("T1/d1") is not None and p("P1/d1") is not None, "good subscriptions kept")
check((http("GET", f"/pushlog/2026-10-11/{C}/S1/d1.json")[1] or {}).get("student") == NOW0, "pushlog marks Amy's phone as sent today")
check((http("GET", f"/pushlog/2026-10-11/{C}/S2/d1.json")[1] or {}).get("student") == 0, "Ben (nothing to send) is marked 0 → not recomputed every round")
check(http("GET", f"/classes/{C}/notifyRun.json")[1] == NOW0, "notifyRun written (teacher's app knows the schedule is alive)")
check(http("GET", "/pushlog/2026-09-01.json")[1] is None, "old pushlog days pruned")

# ② 19:55 再跑一次：今天已經發過，不重複
got, out = run("run", ms(*SUN, 19, 55), "Sun 19:55")
check(not got, f"no duplicates in the same evening ({[g['path'] for g in got]})")

# ③ 21:10：家長（週日 20:00）＋老師（21:00）
got, out = run("run", ms(*SUN, 21, 10), "Sun 21:10")
paths = sorted(g["path"] for g in got)
check(paths == ["/ep/p1", "/ep/t1", "/ep/t2", "/err/p5"], f"parent + both teacher devices (+ the parent device whose push service fails) ({paths})")
check(out["out"]["金鑰舊了"] >= 1, "subscription made with an old key is skipped (not sent)")
check(http("GET", f"/pushlog/2026-10-11/{C}/P1/d5.json")[1] in (None, {}), "push service said 500 → mark removed so the next round retries")
m = opened(got)
pm, tm = m.get("/ep/p1", {}), m.get("/ep/t1", {})
check(pm.get("title") == "Amy這週的英文練習" and "這週還沒有練習紀錄" in pm.get("body", "") and "作業「Unit 1 練習」完成 0／2" in pm["body"] and pm.get("url") == "./#/live/home", f"parent weekly summary ({pm})")
check(tm.get("title") == "今天 1 位學生有練習" and "Ben 3 題" in tm.get("body", "") and "Ben的作業做完了" in tm["body"] and tm.get("url") == "./#/students", f"teacher summary ({tm})")
check(m.get("/ep/t2") == tm, "both teacher devices get the same summary")
got, out = run("run", ms(*SUN, 21, 20), "Sun 21:20", code=1)  # 這一輪只有失敗的那台：全部失敗 → exit 1（GitHub 會寄信）
check([g["path"] for g in got] == ["/err/p5"], f"teacher/parent not sent twice; only the failed one is retried ({[g['path'] for g in got]})")

# ④ 星期一：老師把「學生、家長也可以開通知」關掉 → 學生不發（老師照常）
http("PUT", f"/classes/{C}/notify.json", False)
got, out = run("run", ms(2026, 10, 12, 19, 40), "Mon 19:40 notify off")
check(not got and out["out"]["不用發"] >= 2, f"notify off: students/parents get nothing ({[g['path'] for g in got]})")
http("PUT", f"/classes/{C}/notify.json", True)
got, out = run("run", ms(2026, 10, 12, 19, 45), "Mon 19:45")
m = opened(got)
check(sorted(m) == ["/ep/s1", "/ep/s2"] and "今天晚上 12 點前要完成" in m["/ep/s1"].get("body", ""), f"Monday: Amy reminded, due tonight ({m.get('/ep/s1')})")
check(m.get("/ep/s2", {}).get("title") == "今天還沒練英文", f"Monday: Ben (no homework, didn't practice today) gets the gentle reminder ({m.get('/ep/s2')})")
# 星期一 21:10：今天沒人練、也沒有第 5／7／14 天沒練的 → 老師不收（沒事不吵）
got, out = run("run", ms(2026, 10, 12, 21, 10), "Mon 21:10")
check(not got, f"teacher gets nothing on a quiet day ({[g['path'] for g in got]})")
# 22:40 太晚：什麼都不發
got, out = run("run", ms(2026, 10, 12, 22, 40), "Mon 22:40")
check(not got and "沒有要發" in out["out"]["要發"], "after 22:30 nothing is sent")

# ⑤ 測試通知：不管時間，馬上發給老師的兩台
got, out = run("test", ms(2026, 10, 13, 15, 0), "test")
m = opened(got)
check(sorted(m) == ["/ep/t1", "/ep/t2"] and all(x.get("title") == "測試通知" for x in m.values()), f"test mode → teacher devices only ({sorted(m)})")
check(http("GET", f"/pushlog/2026-10-13.json")[1] is None, "test mode does not write pushlog")

# ⑥ dry：算出要發幾則，但不發、不改資料庫
before = http("GET", f"/push/{C}.json")[1]
got, out = run("dry", ms(2026, 10, 13, 15, 0), "dry")
check(not got and out["out"]["已發"] >= 3 and len(out["list"]) == out["out"]["已發"], f"dry: counts only, nothing sent ({out['out']})")
check(http("GET", f"/push/{C}.json")[1] == before, "dry: database untouched")

# 清掉
http("DELETE", f"/push/{C}.json")
http("DELETE", f"/classes/{C}.json")
http("DELETE", "/pushlog.json")
srv.shutdown()
report()
