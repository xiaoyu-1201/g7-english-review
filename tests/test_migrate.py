"""2.0 → 2.1 升級：舊班級只有一個學生、紀錄沒分學生 → 老師平板打開後自動搬家；舊裝置不用重新點連結"""
import time, json
from playwright.sync_api import sync_playwright
from synchelp import *

CODE = "oldclass2abcdefghjkm"
now = int(time.time() * 1000)
att = lambda q, d, t: {"q": q, "m": "u2b", "r": "ok", "t": [], "a": "x", "h": 0, "c": 0, "x": "p", "ts": t, "d": d}
k = lambda a: f"{a['ts']}-{a['q']}-{a['d']}"
a1, a2 = att("u2b-02", "p1", now - 50000), att("u2b-03", "tab", now - 40000)
http("PUT", f"/classes/{CODE}.json", {
    "owner": "tuid", "open": True,
    "members": {
        "suid": {"role": "student", "name": "Amy", "dev": "iPhone", "pid": "p1", "at": now - 90000},
        "puid": {"role": "parent", "name": "", "dev": "iPhone", "pid": "p2", "at": now - 80000},
        "tpuid": {"role": "teacher", "name": "", "dev": "iPhone", "pid": "p3", "at": now - 70000},
    },
    "a": {k(a1): a1, k(a2): a2},
    "s": {f"{now}-m:u2b-p1": {"k": "m:u2b", "m": "u2b", "s": 100, "ts": now - 30000, "d": "p1"}},
    "live": {"p1": {"view": "home", "ts": now - 20000, "role": "student", "name": "Amy"}},
})
auth = lambda u: f"localStorage.setItem('g7review:auth', JSON.stringify({{uid:'{u}', rt:'rt-{u}', it:'tok-{u}', exp:{now + 3600000}}}));"
store = lambda d: f"if (!localStorage.getItem('g7review:v1')) localStorage.setItem('g7review:v1', {json.dumps(json.dumps(d))});"

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge")
    # 1.9 的學生裝置（昨天點過舊連結、2.0 期間沒打開過），比老師平板先打開新版
    a0 = att("u2b-04", "e1", now - 60000)
    E = page(b, 390, 844, "E", seed=DBSEED + store({"seen": {"intro": 1}, "profile": {"id": "e1", "name": "Amy"}, "attempts": [a0], "syncQ": [["a", a0]], "sync": {"code": CODE, "role": "student", "at": now - 95000}}))
    E.goto(URL)
    check(wait_until(lambda: st(E) == "wait"), "student before teacher -> wait (not invalid)")
    E.goto(URL + "#/settings")
    check(wait_until(lambda: "正在更新" in txt(E, "#sync-sec")), "student settings says 正在更新")
    answer_one(E)
    check(E.evaluate("window.__app.S.syncQ.length") >= 2, "answers kept in queue while waiting")
    # 舊的老師平板（1.9 建立配對碼：sync 存在主紀錄裡、沒有 owner 欄位）
    T = page(b, 820, 1180, "T", seed=DBSEED + auth("tuid") + store({"seen": {"intro": 1}, "profile": {"id": "tab", "name": ""}, "attempts": [a2], "sync": {"code": CODE, "role": "teacher", "at": now - 100000}}))
    T.goto(URL)
    check(wait_until(lambda: st(T) == "owner"), "old tablet becomes owner")
    check(wait_until(lambda: len((http("GET", f"/classes/{CODE}/students.json")[1] or {})) == 1, 12), "migration created one student")
    D = http("GET", f"/classes/{CODE}.json")[1]
    sid = list(D["students"])[0]
    check(D["students"][sid]["name"] == "Amy", "student named from old member")
    check(D.get("legacy") == sid, "legacy sid set")
    check(wait_until(lambda: set((http("GET", f"/classes/{CODE}/a.json")[1] or {})) == {sid}), "flat answers moved under student")
    check(len(http("GET", f"/classes/{CODE}/a/{sid}.json")[1]) == 2, "both answers kept")
    check(list(http("GET", f"/classes/{CODE}/s.json")[1]) == [sid], "sessions moved")
    M = http("GET", f"/classes/{CODE}/members.json")[1]
    check(M["suid"].get("sid") == sid and M["puid"].get("sid") == sid, "old members assigned to student")
    check(M["tpuid"].get("admin") is True, "old teacher phone keeps access")
    check(bool(D.get("tkey")), "teacher key created")
    check(sync_of(T).get("code") == CODE, "sync moved to its own storage key")
    # 1 分鐘後自動重試（測試直接叫）→ 用 legacy 加入，等待期間的作答補傳
    E.evaluate("window.__app.Sync.start()")
    check(wait_until(lambda: st(E) == "member"), "waiting student joins after teacher upgraded")
    check(wait_until(lambda: E.evaluate("window.__app.S.syncQ.length") == 0), "queued answers uploaded")
    check(wait_until(lambda: len(http("GET", f"/classes/{CODE}/a/{sid}.json")[1]) == 4), "student's waiting answers saved under student")
    T.goto(URL + "#/students")
    check(wait_until(lambda: T.locator(".stu-row").count() == 1), "teacher sees Amy")
    T.click(".stu-row")
    check(wait_until(lambda: T.locator(".live-row").count() >= 2), "teacher sees Amy's answers")
    # 舊的學生手機（2.0 已加入）：不用重新點連結
    S = page(b, 390, 844, "S", seed=DBSEED + auth("suid") + store({"seen": {"intro": 1}, "profile": {"id": "p1", "name": "Amy"}, "attempts": [a1], "sync": {"code": CODE, "role": "student", "at": now - 90000, "member": True}}))
    S.goto(URL)
    check(wait_until(lambda: st(S) == "member"), "old student device continues")
    check(sync_of(S).get("sid") == sid, "student device learned its student")
    check(wait_until(lambda: S.evaluate("window.__app.S.attempts.length") == 4), "student got in-class + other device answers")
    answer_one(S)
    check(wait_until(lambda: len(http("GET", f"/classes/{CODE}/a/{sid}.json")[1]) == 5), "new answer saved under student")
    # 舊的家長手機
    P = page(b, 390, 844, "P", seed=DBSEED + auth("puid") + store({"seen": {"intro": 1}, "profile": {"id": "p2"}, "sync": {"code": CODE, "role": "parent", "at": now - 80000, "member": True}}))
    P.goto(URL + "#/live")
    check(wait_until(lambda: P.locator(".live-row").count() == 5), "old parent sees Amy's answers")
    # 1.9 的連結、從來沒加入過的裝置：用 legacy 自動加入
    O = page(b, 390, 844, "O", seed=DBSEED + store({"seen": {"intro": 1}, "profile": {"id": "p9"}, "sync": {"code": CODE, "role": "parent", "at": now}}))
    O.goto(URL + "#/live")
    check(wait_until(lambda: st(O) == "member"), "never-joined old device joins via legacy")
    check(wait_until(lambda: O.locator(".live-row").count() == 5), "it sees Amy's answers")
    b.close()
report()
