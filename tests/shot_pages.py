"""各主要頁面截圖（排版檢查、設計審查用，不是測試）：.\\tests\\run_tests.ps1 -Tests shot_pages.py
手機 390×844（全部）＋平板 820×1180、1180×820＋電腦 1440×900（最常用的幾頁）；資料：一個學生做過一些題目、考過模擬段考、練過口說
截圖存在 tests/shots/pages/<名稱>.png"""
import os, time
from playwright.sync_api import sync_playwright
from synchelp import *

SHOTS = OUT / "pages"
SHOTS.mkdir(exist_ok=True)
TAG = os.environ.get("SHOT_TAG", "")  # 例如 before／after：檔名前面加上（$env:SHOT_TAG = 'before'）


def shot(pg, name, full=True):
    time.sleep(0.6)
    pg.screenshot(path=str(SHOTS / f"{TAG + '-' if TAG else ''}{name}.png"), full_page=full)
    ow = pg.evaluate("document.documentElement.scrollWidth - window.innerWidth")
    print(name, "overflow", ow, flush=True)


with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge")
    T, code = make_teacher(b, w=390, h=844)
    amy = add_student(T, "Amy")
    add_student(T, "Ben")
    A = page(b, 390, 844, "A")
    A.goto(link(code, "student", amy))
    wait_until(lambda: st(A) == "member")
    answer_one(A, "u2b")
    # 資料：這週 u2b、u1c 做了一些（有錯有對）、上週錯過；模擬段考 72 → 88；口說 92；閃電 15
    now = int(time.time() * 1000)
    att = lambda q, m, t, r: {"q": q, "m": m, "r": r, "t": ["plural"] if r != "ok" else [], "a": "x", "h": 0, "c": 0, "x": "p", "ts": t, "d": "sdev"}
    rows = []
    for k in range(1, 10):
        rows.append(att(f"u2b-0{k}", "u2b", now - 3600000 + k * 60000, "ok" if k % 3 else "bad"))
    for k in range(1, 8):
        rows.append(att(f"u1c-0{k}", "u1c", now - 2 * 86400000 + k * 60000, "ok" if k % 4 else "bad"))
    rows.append(att("u2b-01", "u2b", now - 9 * 86400000, "bad"))
    http("PATCH", f"/classes/{code}/a/{amy}.json", {f"{a['ts']}-{a['q']}-sdev": a for a in rows})
    ss = [
        {"k": "m:u2b", "m": "u2b", "title": "this / that / these / those", "s": 78, "n": 12, "ok": 9, "care": 1, "bad": 2, "stars": 2, "ts": now - 1800000, "dur": 400000, "d": "sdev"},
        {"k": "exam", "m": "exam", "title": "模擬段考（第一次段考）", "ex": "e1", "s": 72, "n": 30, "ok": 20, "ts": now - 8 * 86400000, "dur": 1500000, "d": "sdev"},
        {"k": "exam", "m": "exam", "title": "模擬段考（第一次段考）", "ex": "e1", "s": 88, "n": 30, "ok": 26, "ts": now - 7200000, "dur": 1500000, "d": "sdev"},
        {"k": "speak", "m": "speak", "title": "口說練習（句子跟讀）", "s": 92, "n": 8, "weak": ["thirteen"], "ts": now - 600000, "d": "sdev"},
        {"k": "flash", "m": "flash", "title": "閃電挑戰", "s": 15, "n": 18, "ts": now - 900000, "d": "sdev"},
    ]
    http("PATCH", f"/classes/{code}/s/{amy}.json", {f"{s['ts']}-{s['k'].replace(':', '_')}-sdev": s for s in ss})
    # 學生端（手機）
    for h, sel, name in [("#/", ".home", "s-home"), ("#/notes", ".notes-page", "s-notes"), ("#/speak", ".page", "s-speak"), ("#/exam", ".exam-intro", "s-exam"), ("#/book", ".page", "s-book"), ("#/stats", ".page", "s-stats"), ("#/settings", ".page", "s-settings")]:
        A.goto(URL + h)
        A.wait_for_selector(sel)
        shot(A, name)
    A.goto(URL)
    A.wait_for_selector(".home")
    A.click('.mod[data-mod="u1b"]')
    A.wait_for_selector(".qcard")
    shot(A, "s-run-learn", full=False)
    A.click("[data-act=close]")
    A.wait_for_selector(".home")
    # 家長（手機）
    P = page(b, 390, 844, "P")
    P.goto(link(code, "parent", amy))
    wait_until(lambda: st(P) == "member")
    P.goto(URL + "#/live")
    P.wait_for_selector(".live-page .live-dev")
    shot(P, "p-live")
    P.goto(URL + "#/live/home")
    P.wait_for_selector(".parent-prog")
    shot(P, "p-progress")
    # 老師端（手機）
    for h, sel, name in [("#/students", ".stu-page", "t-students"), (f"#/student/{amy}", ".stu-detail", "t-student"), (f"#/student/{amy}/home", ".stu-home", "t-stuhome"), ("#/manage", ".page", "t-manage")]:
        T.goto(URL + h)
        T.wait_for_selector(sel)
        shot(T, name)
    # 課堂檢視：學生正在做題
    A.click('.mod[data-mod="u2c"]')
    A.wait_for_selector(".qcard, .t-learn")
    T.goto(URL + f"#/watch/{amy}")
    T.wait_for_selector(".watch-page")
    time.sleep(1.5)
    shot(T, "t-watch")
    A.locator("[data-act=close]").click()
    T.goto(URL + f"#/student/{amy}")
    T.wait_for_selector("[data-assign]")
    T.click("[data-assign]")
    T.wait_for_selector(".sheet .hp-card")
    shot(T, "t-assign-sheet", full=False)
    T.keyboard.press("Escape")
    time.sleep(0.4)
    # 平板（直、橫）＋電腦（10/9 老師：iPhone、iPad、電腦三種版型都要看）
    for dev, w, h in [("tab", 820, 1180), ("land", 1180, 820), ("pc", 1440, 900)]:
        for pg, items in [
            (A, [("#/", ".home", "s-home"), ("#/notes/Unit 2", ".notes-page", "s-notes"), ("#/notes/mine", ".notes-page", "s-notes-mine"), ("#/book", ".page", "s-book")]),
            (T, [("#/students", ".stu-page", "t-students"), (f"#/student/{amy}", ".stu-detail", "t-student"), (f"#/student/{amy}/home", ".stu-home", "t-stuhome")]),
            (P, [("#/live/home", ".parent-prog", "p-progress")]),
        ]:
            pg.set_viewport_size({"width": w, "height": h})
            for hh, sel, name in items:
                pg.goto(URL + hh)
                pg.wait_for_selector(sel)
                time.sleep(0.3)
                shot(pg, f"{dev}-{name}")    # 新裝置的歡迎畫面
    N = page(b, 390, 844, "N", seed="")
    N.goto(URL)
    time.sleep(0.8)
    shot(N, "welcome", full=False)
    b.close()
print("ERRORS", errors)
