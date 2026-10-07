"""直接用 REST 驗證資料庫規則（2.9：老師要用 Email 帳號）：誰能讀、誰能寫；測完把測試後台、代碼、帳號全部刪掉。
用法：python test_rules.py               → 模擬資料庫（127.0.0.1:5190）
      python test_rules.py real          → 真的 Firebase（要先貼好新規則）"""
import sys, json, time, random, string, urllib.request

REAL = len(sys.argv) > 1 and sys.argv[1] == "real"
DB = "https://g7-english-review-default-rtdb.asia-southeast1.firebasedatabase.app" if REAL else "http://127.0.0.1:5190"
AUTH = "https://identitytoolkit.googleapis.com" if REAL else DB
KEY = "AIzaSyBnoANfTAai_y9C4yyBUKxZwOXByBEbTT4" if REAL else "testkey"
fails, users = [], []
A = "abcdefghjkmnpqrstuvwxyz23456789"
rnd = lambda n: "".join(random.choice(A) for _ in range(n))


def call(method, url, body=None, form=False):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method=method, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read().decode() or "null")
    except urllib.error.HTTPError as e:
        return e.code, None


def user(email=None):
    body = {"returnSecureToken": True, **({"email": email, "password": "Rt-" + rnd(12)} if email else {})}
    s, j = call("POST", f"{AUTH}/v1/accounts:signUp?key={KEY}", body)
    assert s == 200, s
    users.append(j["idToken"])
    return j["idToken"], j["localId"]


def db(method, path, tok, body=None):
    return call(method, f"{DB}/{path}.json?auth={tok}", body)[0]


def expect(ok, status, msg):
    good = (status == 200) == ok
    print("OK  " if good else "FAIL", msg, status, flush=True)
    if not good:
        fails.append(msg)


C = "classes/rt" + rnd(18)
now = int(time.time() * 1000)
amy, ben, k6 = rnd(10), rnd(10), rnd(6)
T, tu = user(f"rules{rnd(10)}@example.com")  # 老師帳號（Email＋密碼）
S1, s1u = user()
P1, p1u = user()
S2, s2u = user()
X, xu = user()
code = C.split("/")[1]
try:
    expect(False, db("PUT", f"classes/rx{rnd(18)}/owner", X, xu), "anonymous cannot create a backend")
    expect(True, db("PUT", f"{C}/owner", T, tu), "teacher account claims owner")
    expect(False, db("PUT", f"{C}/owner", X, xu), "stranger cannot take owner")
    expect(True, db("PUT", f"teachers/{tu}", T, {"c": code, "at": now}), "teacher maps account to backend")
    expect(False, db("PUT", f"teachers/{xu}", X, {"c": code, "at": now}), "anonymous cannot map to someone else's backend")
    expect(False, db("GET", f"teachers/{tu}", X), "cannot read another teacher's mapping")
    expect(True, db("PUT", f"{C}/open", T, True), "owner opens")
    expect(False, db("PUT", f"{C}/tkey", T, rnd(20)), "teacher key can no longer be set")
    expect(True, db("PUT", f"{C}/students/{amy}", T, {"name": "Amy", "at": now}), "owner adds Amy")
    expect(True, db("PUT", f"{C}/students/{ben}", T, {"name": "Ben", "at": now}), "owner adds Ben")
    expect(False, db("PUT", f"{C}/students/{amy}/x", T, 1), "unknown student field rejected")
    expect(True, db("PUT", f"codes/{k6}", T, {"c": C.split("/")[1], "s": amy, "exp": now + 86400000}), "owner creates code")
    expect(False, db("PUT", f"codes/{k6}", X, {"c": "otherclass" + rnd(10), "s": "x", "exp": now}), "stranger cannot overwrite code")
    expect(True, db("GET", f"codes/{k6}", X), "anyone signed-in can look up a code")
    m = lambda role, sid=None, **kw: {"role": role, "name": "", "dev": "test", "pid": rnd(8), "at": now, **({"sid": sid} if sid else {}), **kw}
    expect(True, db("PUT", f"{C}/members/{s1u}", S1, m("student", amy)), "Amy joins")
    expect(True, db("PUT", f"{C}/members/{p1u}", P1, m("parent", amy)), "Amy parent joins")
    expect(True, db("PUT", f"{C}/members/{s2u}", S2, m("student", ben)), "Ben joins")
    expect(False, db("PUT", f"{C}/members/{xu}", X, m("student", "nosuchsid1")), "join with unknown student rejected")
    expect(False, db("PUT", f"{C}/members/{xu}", X, m("student", amy, admin=True)), "self-admin rejected")
    expect(False, db("PUT", f"{C}/members/{xu}", X, m("teacher")), "cannot join as teacher")
    expect(False, db("PUT", f"{C}/members/{s1u}", X, m("student", amy)), "cannot write someone else's membership")
    expect(True, db("PUT", f"{C}/students/{amy}/units", T, {"Starter": True, "Unit 1": False}), "teacher sets open units")
    expect(False, db("PUT", f"{C}/students/{amy}/units/Unit%201", S1, True), "student cannot open units")
    expect(False, db("PUT", f"{C}/students/{amy}/units", T, {"Starter": "yes"}), "units must be true/false")
    expect(False, db("PUT", f"{C}/members/{s1u}/admin", S1, True), "student cannot self-promote")
    att = {"q": "u2b-02", "m": "u2b", "r": "ok", "t": [], "a": "x", "h": 0, "c": 0, "x": "p", "ts": now, "d": "p"}
    expect(True, db("PATCH", f"{C}/a/{amy}", S1, {"k1": att}), "Amy writes her answer")
    expect(False, db("PATCH", f"{C}/a/{amy}", P1, {"k2": att}), "parent cannot write answers")
    expect(False, db("PATCH", f"{C}/a/{amy}", S2, {"k3": att}), "Ben cannot write into Amy")
    expect(False, db("PATCH", f"{C}/a/{amy}", S1, {"k4": {"q": "x"}}), "malformed answer rejected")
    expect(True, db("PUT", f"{C}/live/{amy}/p1", P1, {"ts": now}), "parent can write presence")
    expect(True, db("GET", f"{C}/a/{amy}", P1), "Amy parent reads Amy")
    expect(True, db("GET", f"{C}/students/{amy}", P1), "Amy parent reads Amy's name")
    expect(False, db("GET", f"{C}/a/{ben}", P1), "Amy parent cannot read Ben")
    expect(False, db("GET", f"{C}/students/{ben}", P1), "Amy parent cannot read Ben's name")
    expect(False, db("GET", f"{C}/a/{amy}", S2), "Ben cannot read Amy")
    expect(False, db("GET", f"{C}/members", S1), "student cannot list members")
    expect(False, db("GET", C, P1), "parent cannot read whole class")
    expect(False, db("GET", f"{C}/a/{amy}", X), "stranger cannot read")
    expect(True, db("GET", C, T), "teacher account reads whole backend")
    # 作業：只有管理裝置能派；學生、家長只看得到自己的
    hwb = {"title": "t", "tasks": [{"k": "exam"}], "at": now}
    expect(True, db("PUT", f"{C}/hw/{amy}/h1", T, hwb), "teacher assigns homework")
    expect(False, db("PUT", f"{C}/hw/{amy}/h2", S1, hwb), "student cannot assign homework")
    expect(True, db("GET", f"{C}/hw/{amy}", P1), "parent reads own child's homework")
    expect(False, db("GET", f"{C}/hw/{ben}", P1), "parent cannot read other child's homework")
    # 已刪除清單：只有老師能寫；學生、家長讀得到自己孩子的
    expect(True, db("PATCH", C, T, {f"a/{amy}/k1": None, f"del/{amy}/a/k1": now}), "teacher deletes an answer (multi-path)")
    expect(False, db("PUT", f"{C}/del/{amy}/a/k9", S1, now), "student cannot write deleted list")
    expect(True, db("GET", f"{C}/del/{amy}", P1), "parent reads own child's deleted list")
    expect(False, db("GET", f"{C}/del/{ben}", P1), "parent cannot read other child's deleted list")
    # 錄音：學生寫自己的、家長讀自己孩子的、別人讀不到
    R = f"recs/{C.split('/')[1]}"
    rec = {"d": "data:audio/mp4;base64,AAAA", "ts": now}
    expect(True, db("PUT", f"{R}/{amy}/s1", S1, rec), "student uploads recording")
    expect(False, db("PUT", f"{R}/{amy}/s2", P1, rec), "parent cannot upload recording")
    expect(True, db("GET", f"{R}/{amy}", P1), "parent reads child's recordings")
    expect(False, db("GET", f"{R}/{amy}", S2), "other student cannot read recordings")
    expect(True, db("GET", f"{R}/{amy}", T), "teacher reads recordings")
    expect(True, db("DELETE", f"{R}/{amy}", T), "cleanup: recordings")
    # 暫停加入
    expect(True, db("PUT", f"{C}/open", T, False), "teacher closes joining")
    expect(False, db("PUT", f"{C}/members/{xu}", X, m("parent", amy)), "closed: new parent rejected")
    expect(True, db("PUT", f"{C}/open", T, True), "reopen")
    # 移除 Ben
    expect(True, db("PUT", f"{C}/blocked/{s2u}", T, {"at": now}), "block Ben device")
    expect(True, db("DELETE", f"{C}/members/{s2u}", T), "remove Ben device")
    expect(False, db("GET", f"{C}/a/{ben}", S2), "removed device cannot read")
    expect(False, db("PUT", f"{C}/members/{s2u}", S2, m("student", ben)), "blocked device cannot rejoin")
    expect(False, db("DELETE", f"{C}/owner", T), "owner cannot drop ownership while class has data")
finally:
    # 清理：代碼、資料、名單、學生，最後 owner；匿名帳號全部刪掉
    paths = [f"codes/{k6}", f"teachers/{tu}"] + [f"{C}/{k}" for k in ("a", "s", "live", "hw", "del", "blocked", "open")]
    paths += [f"{C}/members/{u}" for u in (s1u, p1u)] + [f"{C}/students/{s}" for s in (amy, ben)]
    for path in paths:
        expect(True, db("DELETE", path, T), "cleanup: " + path.split("/")[-1])
    expect(True, db("DELETE", f"{C}/owner", T), "cleanup: owner removed")
    expect(True, 200 if call("GET", f"{DB}/codes/{k6}.json?auth={X}")[1] is None else 0, "cleanup: code gone")
    for t in users:
        call("POST", f"{AUTH}/v1/accounts:delete?key={KEY}", {"idToken": t})
print("FAILS", fails)
