"""實際情況：舊班級雲端只有老師平板的上線狀態（學生還沒配對成功）。
老師平板打開 2.1 → 建立「學生」＋legacy → 學生在同一個瀏覽器用舊連結（貼到設定）或代碼加入 → 早上的作答補傳"""
import time, json
from playwright.sync_api import sync_playwright
from synchelp import *

CODE = "oldclass9abcdefghjkm"
now = int(time.time() * 1000)
http("PUT", f"/classes/{CODE}.json", {"live": {"tabpid": {"view": "away", "ts": now - 50000, "role": "teacher", "dev": "老師平板"}}})
store = lambda d: f"if (!localStorage.getItem('g7review:v1')) localStorage.setItem('g7review:v1', {json.dumps(json.dumps(d))});"
att = lambda q, t: {"q": q, "m": "u2b", "r": "ok", "t": [], "a": "x", "h": 0, "c": 0, "x": "p", "ts": t, "d": "kid"}
morning = [att("u2b-02", now - 9000000), att("u2b-03", now - 8900000), att("u2b-04", now - 8800000)]

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge")
    T = page(b, 820, 1180, "T", seed=DBSEED + store({"seen": {"intro": 1}, "profile": {"id": "tabpid"}, "sync": {"code": CODE, "role": "teacher", "at": now - 100000}}))
    T.goto(URL + "#/students")
    check(wait_until(lambda: st(T) == "owner"), "old tablet becomes owner")
    check(wait_until(lambda: T.locator(".stu-row").count() == 1, 12), "migration created a student for old links")
    D = http("GET", f"/classes/{CODE}.json")[1]
    sid = list(D["students"])[0]
    check(D.get("legacy") == sid and not D.get("live"), "legacy set, old presence cleared")
    # 學生：同一個瀏覽器（早上做了 3 題、從來沒配對）→ 設定 → 貼上舊連結 → 選學生 → 加入
    K = page(b, 390, 844, "K", seed=DBSEED + store({"seen": {"intro": 1}, "profile": {"id": "kid", "name": ""}, "attempts": morning}))
    K.goto(URL + "#/settings")
    K.fill("#f-pair", f"https://xiaoyu-1201.github.io/g7-english-review/#/pair/{CODE}")
    K.dispatch_event("#f-pair", "change")
    K.wait_for_selector("#pair-role")
    K.click('#pair-role [data-r="student"]')
    K.click(".sheet [data-ok]")
    check(wait_until(lambda: st(K) == "member"), "old link joins the student")
    check(wait_until(lambda: len(http("GET", f"/classes/{CODE}/a/{sid}.json")[1] or {}) == 3), "morning answers uploaded")
    T.goto(URL + "#/student/" + sid)
    check(wait_until(lambda: T.locator(".live-row").count() == 3), "teacher sees the 3 morning answers")
    # 另一種方式：代碼（同一個學生的另一台裝置）
    T.click('[data-share="student"]')
    wait_until(lambda: len(txt(T, ".sheet .code-big").replace(" ", "")) == 6)
    c6 = txt(T, ".sheet .code-big")
    K2 = page(b, 390, 844, "K2", seed=DBSEED + store({"seen": {"intro": 1}, "profile": {"id": "kid2"}, "attempts": [{**att("u2b-05", now - 7000000), "d": "kid2"}]}))
    K2.goto(URL + "#/settings")
    K2.click('[data-x="code"]')
    K2.fill("#cs-code", c6)
    K2.click(".sheet [data-ok]")
    check(wait_until(lambda: "同步上去" in txt(K2, "#toast")), "code join shows upload toast")
    check(wait_until(lambda: len(http("GET", f"/classes/{CODE}/a/{sid}.json")[1] or {}) == 4), "code device answers uploaded")
    b.close()
report()
