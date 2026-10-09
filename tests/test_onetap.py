"""點一下就加入：學生（有以前的紀錄→自動上傳；沒有→提醒換開法）、家長（直接到即時作答）、再點一次、貼上連結"""
import time
from playwright.sync_api import sync_playwright
from synchelp import *

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge")
    T, code = make_teacher(b)
    amy = add_student(T, "Amy")
    # 學生：早上已經做過題目（同一個瀏覽器）→ 在 LINE 點一下
    S = page(b, 390, 844, "S")
    answer_one(S)
    S.goto(link(code, "student", amy))
    check(wait_until(lambda: "同步上去" in txt(S, "#toast")), "student one-tap: backfill toast")
    check(S.locator(".sheet-wrap").count() == 0, "student: no extra sheet")
    T.goto(URL + "#/student/" + amy)
    check(wait_until(lambda: T.locator(".live-row").count() >= 1), "teacher got student's earlier answer")
    # 學生用「不同的開法」（沒有紀錄）
    S2 = page(b, 390, 844, "S2", seed=DBSEED)
    S2.goto(link(code, "student", amy))
    check(wait_until(lambda: "第一次使用的話" in txt(S2, ".sheet")), "student without records gets a gentle note (how to bring old records)")
    # 家長：點一下 → 直接看學習進度（2.21：不是一串紅色 ✕ 的即時作答），沒有學生的歡迎畫面
    P = page(b, 390, 844, "P", seed=DBSEED)
    P.goto(link(code, "parent", amy))
    check(wait_until(lambda: P.evaluate("location.hash") == "#/live/home"), "parent lands on 學習進度")
    check(P.locator(".welcome").count() == 0, "parent: no welcome sheet")
    P.click('.tabbar a[href="#/live"]')
    check(wait_until(lambda: P.locator(".live-row").count() >= 1), "parent sees answers in 即時作答")
    # 再點一次同一個連結（從 LINE）：不能卡在空白的「載入中」
    P.goto(link(code, "parent", amy))
    check(wait_until(lambda: P.evaluate("location.hash") == "#/live/home" and P.locator(".parent-prog").count() == 1, 15), "tapping the same parent link again opens 學習進度 (no blank 載入中)")
    P2 = P.context.new_page()  # 從 LINE 再點一次＝重新打開頁面（這時還沒連上）
    P2.goto(link(code, "parent", amy))
    check(wait_until(lambda: P2.evaluate("location.hash") == "#/live/home" and P2.locator(".parent-prog").count() == 1, 15), "reopening the parent link in a fresh page opens 學習進度 (no blank 載入中)")
    P2.close()
    check(sync_of(P).get("role") == "parent", "parent role saved")
    P.goto(link(code, "parent", amy))
    check(wait_until(lambda: "已經加入了" in txt(P, "#toast")), "re-tap says already joined")
    # 老師平板點到學生連結：不會把老師後台換掉
    T.goto(link(code, "student", amy))
    check(wait_until(lambda: "請傳給對方" in txt(T, "#toast")), "teacher tapping student link is ignored")
    check(sync_of(T).get("owner") is True, "teacher still owner")
    # 貼上連結（設定頁）
    Q = page(b, 390, 844, "Q")
    Q.goto(URL + "#/settings")
    Q.fill("#f-pair", "請點 " + link(code, "parent", amy) + " 加入")
    Q.dispatch_event("#f-pair", "change")
    ok = wait_until(lambda: st(Q) == "member" and sync_of(Q).get("role") == "parent")
    check(ok, "pasted parent link joins")
    ok or print("DEBUG", st(Q), sync_of(Q), Q.evaluate("location.hash"), txt(Q, "#toast") if Q.locator("#toast").count() else "-", Q.locator(".sheet").count() and txt(Q, ".sheet").replace("\n", " | "))
    b.close()
report()
