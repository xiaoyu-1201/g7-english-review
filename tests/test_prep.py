"""2.22 課前備課卡＋學生卡的「需要關心」＋講義筆記本外觀
① 學生頁第三個分頁「備課」：這 7 天、建議上課講的 3 點（錯題對到的重點＋學生寫錯的答案，點了看那一題）、建議作業（派作業視窗預先勾好）、家長多久沒看
② 學生卡：3 天以上沒練、家長還沒看過 → 小標籤，點了到備課
③ 外觀：<html data-skin="notebook">；g7review:skin=old 可以切回舊的"""
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
    P = page(b, 390, 844, "P")
    P.goto(link(code, "parent", amy))
    wait_until(lambda: st(P) == "member")
    time.sleep(1.5)
    P.context.close()  # 家長頁面開著會一直回報上線時間，蓋掉下面改的「10 天前」
    time.sleep(1.5)  # 關掉時可能還會送一次「離開」的上線狀態：等它到了再改
    # 練習資料：六天前（中午，測試跨午夜也不會變成 5 或 7 天）錯了 u2b 兩題、u2c 一題（5 天以上沒練才標）
    lt = time.localtime()
    noon = int(time.mktime((lt.tm_year, lt.tm_mon, lt.tm_mday, 12, 0, 0, 0, 0, -1)) * 1000)
    old = noon - 6 * 86400000
    att = lambda q, m, t, r, a: {"q": q, "m": m, "r": r, "t": [], "a": a, "h": 0, "c": 0, "x": "p", "ts": t, "d": "sdev"}
    rows = [att("u2b-03", "u2b", old, "bad", "This"), att("u2b-07", "u2b", old + 60000, "bad", "is"), att("u2c-02", "u2c", old + 120000, "bad", "babys"), att("u2b-01", "u2b", old + 180000, "ok", "x")]
    http("PATCH", f"/classes/{code}/a/{amy}.json", {f"{a['ts']}-{a['q']}-sdev": a for a in rows})
    # 家長的上線時間：改成 10 天前（測「家長多久沒看」）
    live = http("GET", f"/classes/{code}/live/{amy}.json")[1] or {}
    for k, v in live.items():
        if v.get("role") == "parent":
            http("PATCH", f"/classes/{code}/live/{amy}/{k}.json", {"ts": int(time.time() * 1000) - 10 * 86400000, "view": "away"})
    # ② 學生卡
    T.goto(URL + "#/students")
    check(wait_until(lambda: "天沒練" in txt(T, f'[data-card="{amy}"]'), 15), f"student card flags 'N 天沒練': {txt(T, f'[data-card=\"{amy}\"] .sc-flags')}")
    check("家長" in txt(T, f'[data-card="{amy}"] .sc-flags'), "student card flags the parent has not looked for a while")
    T.screenshot(path=str(OUT / "prep-1-cards.png"))
    T.click(f'[data-card="{amy}"] .sc-flags')
    check(wait_until(lambda: T.evaluate("location.hash") == f"#/student/{amy}/prep"), "tapping the flags opens 備課")
    # ① 備課分頁
    T.wait_for_selector(".stu-prep")
    pg = txt(T, ".stu-prep")
    check("已經 6 天沒練習" in pg, "prep: shows calendar days without practice")
    check(T.locator(".stu-prep .prep-pt").count() >= 2, f"prep: up to 3 points to teach ({T.locator('.stu-prep .prep-pt').count()})")
    first = txt(T, ".stu-prep .prep-pt")
    check("近遠" in first and "寫成：" in first, f"prep: first point = the concept + what the student wrote: {first[:80]}")
    check(T.locator(".stu-prep .prep-pt mark").count() >= 2, "prep: the notes line is highlighted")
    T.click(".stu-prep .prep-ans")
    check(wait_until(lambda: T.locator(".sheet .review-slot").count() == 1), "prep: tapping the wrong answer opens the full attempt")
    T.keyboard.press("Escape")
    time.sleep(0.4)
    check("家長最近一次打開 App" in pg and "超過一週沒看" in pg, "prep: parent last seen + nudge to send the weekly summary")
    check("錯題本 2" in first.replace("\xa0", " "), "prep: each point says how many questions it covers")
    check(T.locator(".stu-prep .prep-pt").count() == 2, "prep: one point per rule line; a question is counted once (u2b rule, u2c ③)")
    check("[[" not in pg and "]]" not in pg, "prep: highlighted lines have no raw [[word]] markup")
    # 開放下一課 → 已開放・復原 → 復原
    nxt = T.locator("[data-opennext]")
    if nxt.count():
        u = nxt.inner_text().replace("開放", "").strip()
        on = lambda: {k for k, v in (http("GET", f"/classes/{code}/students/{amy}/units.json")[1] or {}).items() if v}
        after_u = T.evaluate("(u) => { const U = window.__app.UNITS; return U[U.indexOf(u) + 1] || '' }", u)
        nxt.click()
        nxt.click(force=True)  # 連按只開一課
        check(wait_until(lambda: T.locator("[data-undoopen]").count() == 1), "open next unit → shows 已開放＋復原")
        check(u in on() and after_u not in on(), f"opened exactly one unit ({u}, not {after_u}): {sorted(on())}")
        T.click("[data-undoopen]")
        check(wait_until(lambda: (http("GET", f"/classes/{code}/students/{amy}/units.json")[1] or {}).get(u) is False), "復原 closes the unit again")
        check(wait_until(lambda: T.locator("[data-opennext]").count() == 1), "after 復原 the open-next button is back")
    T.screenshot(path=str(OUT / "prep-2-tab.png"), full_page=True)
    T.click("[data-prephw]")
    T.wait_for_selector(".sheet .hp-card")
    picked = T.evaluate("[...document.querySelectorAll('.sheet .hp-card.on, .sheet .hp-card[aria-pressed=\"true\"], .sheet [data-k].on')].length")
    check(picked >= 1, f"派這份作業 opens the homework sheet with items already picked ({picked})")
    T.keyboard.press("Escape")
    time.sleep(0.4)
    # ③ 外觀
    check(T.evaluate("document.documentElement.dataset.skin") == "notebook", "notebook skin is on by default")
    check(T.evaluate("!!document.querySelector('link[href*=\"LXGW+WenKai\"]')"), "handwriting heading font is linked")
    T.evaluate("localStorage.setItem('g7review:skin', 'old')")
    T.reload()
    T.wait_for_selector(".stu-prep")
    check(T.evaluate("document.documentElement.dataset.skin") == "old", "g7review:skin=old switches back to the old look")
    b.close()
report()
