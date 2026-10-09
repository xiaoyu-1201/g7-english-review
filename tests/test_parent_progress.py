"""2.16 家長的「學習進度」（10/9 老師：家長也要看得到，但要非常清楚、容易操作）＋自動更新
家長頁上方：即時作答／學習進度；學習進度一頁看完（每一課會了幾題、各項成績），不用點進去；
成員管理顯示每台裝置的 App 版本；自動更新後跳出「已自動更新」"""
import time
from playwright.sync_api import sync_playwright
from synchelp import *

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge")
    T, code = make_teacher(b)
    amy = add_student(T, "Amy")
    A = page(b, 390, 844, "A")
    A.goto(link(code, "student", amy))
    wait_until(lambda: st(A) == "member")
    answer_one(A, "u2b")
    now = int(time.time() * 1000)
    sess = {
        f"{now - 5400000}-exam-sdev": {"k": "exam", "m": "exam", "title": "模擬段考（第一次段考）", "ex": "e1", "s": 88, "n": 30, "ok": 26, "care": 1, "bad": 3, "stars": 2, "ts": now - 5400000, "dur": 900000, "d": "sdev"},
        f"{now - 1800000}-speak-sdev": {"k": "speak", "m": "speak", "title": "口說練習（句子跟讀）", "s": 92, "n": 8, "weak": ["thirteen"], "ts": now - 1800000, "d": "sdev"},
    }
    http("PATCH", f"/classes/{code}/s/{amy}.json", sess)
    # 家長加入
    P = page(b, 390, 844, "P")
    P.goto(link(code, "parent", amy))
    wait_until(lambda: st(P) == "member")
    P.goto(URL + "#/live")
    P.wait_for_selector(".live-page .stu-seg")
    n_hist = P.evaluate("history.length")
    P.click('.stu-seg [data-tab="#/live/home"]')
    P.wait_for_selector(".parent-prog")
    check(P.evaluate("location.hash") == "#/live/home" and P.evaluate("history.length") == n_hist, "parent switches to 學習進度 without adding history")
    check(wait_until(lambda: P.locator(".parent-prog .pp-unit").count() == 5), f"one progress row per opened unit ({P.locator('.parent-prog .pp-unit').count()})")
    check(wait_until(lambda: "88 分" in txt(P, ".parent-prog")), "exam score is shown")
    check("最近一次 92 分" in txt(P, ".parent-prog") and "thirteen" in txt(P, ".parent-prog"), "speaking: last score and words to practise")
    page_txt = txt(P, ".parent-prog")
    check("精熟" not in page_txt and "單元" not in page_txt, "plain wording for parents (no 精熟／單元)")
    btns = P.evaluate("[...document.querySelectorAll('.parent-prog button')].map((b) => b.textContent.trim())")
    check(len(btns) <= 3, f"nothing to dig into: only back + the two tabs ({btns})")
    ow = P.evaluate("document.documentElement.scrollWidth - window.innerWidth")
    check(ow <= 1, f"no horizontal overflow on phone ({ow}px)")
    P.screenshot(path=str(OUT / "pp-parent.png"), full_page=True)
    # 即時：Amy 開始做 → 家長的「現在」那一列更新
    A.goto(URL)
    A.wait_for_selector(".home")
    A.click('.mod[data-mod="u2c"]')
    A.wait_for_selector(".t-learn, .qcard")
    check(wait_until(lambda: "正在做" in txt(P, ".parent-prog .pp-card")), f"live line updates: {txt(P, '.parent-prog .pp-card')[:40]}")
    A.locator("[data-act=close]").click()
    # 回即時作答
    P.click('.stu-seg [data-tab="#/live"]')
    P.wait_for_selector(".live-page .live-dev")
    check("即時作答" in txt(P, ".stu-seg .on"), "parent switches back to 即時作答")
    # 老師：成員管理看得到每台裝置的版本
    T.goto(URL + "#/manage")
    T.wait_for_selector(".manage-page")
    check(wait_until(lambda: T.locator(".mg-ver.ok").count() >= 2), f"manage page shows each device's app version ({T.locator('.mg-ver').all_inner_texts()})")
    T.screenshot(path=str(OUT / "pp-manage.png"), full_page=True)
    # 自動更新完：跳出提示
    P.evaluate("sessionStorage.setItem('g7review:updated', '1')")
    P.reload()
    check(wait_until(lambda: "已自動更新" in (P.locator("#toast").inner_text() if P.locator("#toast").count() else "")), "after an automatic update a toast says so")
    b.close()
report()
