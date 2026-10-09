"""2.15 老師看學生：正在做哪一課（Unit｜單元・第幾題）、今天做到哪一塊、作答依日期收合、徽章、
課堂檢視看得到今天全部作答（依單元分組）、只看錯的、檢討一題一題看、學生頁「更早的作答」"""
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
    # 學生在 u2b 做題（做一題後停在第二題）
    answer_one(A, "u2b")
    # 老師：學生頁
    T.goto(URL + f"#/student/{amy}")
    T.wait_for_selector(".stu-detail")
    check(wait_until(lambda: "Unit 2｜" in txt(T, ".live-dev .ld-who span") and "第 " in txt(T, ".live-dev .ld-who span")), f"live line names the unit and module: {txt(T, '.live-dev .ld-who span')[:40]}")
    check(wait_until(lambda: T.locator(".today-mods .chip").count() >= 1 and "Unit 2｜" in txt(T, ".today-mods")), f"today's modules strip: {txt(T, '.today-mods')[:40]}")
    check(T.locator("details.feed-day").count() >= 1 and T.locator("details.feed-day[open]").count() == 1 and "今天" in txt(T, "details.feed-day summary"), "feed grouped by day, today open")
    check(T.locator(".badges-card").count() == 1 and "徽章" in txt(T, ".badges-card summary"), "badges card on the student page")
    T.screenshot(path=str(OUT / "v1-student.png"), full_page=True)
    # 全形問號（iPad 中文鍵盤）要算對（10/9 老師：學生寫 Is Sophie a nurse？ 被判錯）
    r = T.evaluate("window.__app.checkText('Is Sophie a nurse？', ['Is Sophie a nurse?']).r")
    r2 = T.evaluate("window.__app.checkText('Ｉｓ Sophie a nurse?', ['Is Sophie a nurse?']).r")
    r3 = T.evaluate("window.__app.checkText('Hi，I\\'m Zac。', ['Hi, I\\'m Zac.']).r")
    check(r == "ok" and r2 == "ok" and r3 == "ok", f"full-width punctuation and letters are accepted ({r}, {r2}, {r3})")
    # 今天再塞 12 題（4 題錯）＋ 90 題更早的作答（老師 10/9：課堂檢視只看得到最後 10 題，沒辦法檢討）
    ids = T.evaluate("window.__app.MODULES['u2b'].scored.slice(0, 12).map((i) => i.id)")
    now = int(time.time() * 1000)
    att = lambda q, t, r: {"q": q, "m": "u2b", "r": r, "t": [], "a": "x", "h": 0, "c": 0, "x": "p", "ts": t, "d": "sdev"}
    for k, q in enumerate(ids):
        a = att(q, now - (13 - k) * 60000, "bad" if k % 3 == 0 else "ok")
        http("PUT", f"/classes/{code}/a/{amy}/{a['ts']}-{q}-sdev.json", a)
    old = {}
    for k in range(90):  # 3、4、5 天前各 30 題
        t = now - (3 + k // 30) * 86400000 - k * 1000
        q = ids[k % len(ids)]
        old[f"{t}-{q}-sdev"] = att(q, t, "ok" if k % 4 else "bad")
    http("PATCH", f"/classes/{code}/a/{amy}.json", old)
    T.goto(URL + f"#/watch/{amy}")
    T.wait_for_selector(".watch-page")
    check(wait_until(lambda: T.locator(".watch-page .live-row").count() >= 13), f"watch page lists all of today's answers ({T.locator('.watch-page .live-row').count()})")
    check("Unit 2｜" in txt(T, ".watch-page details.feed-day summary"), f"today's answers are grouped by unit: {txt(T, '.watch-page details.feed-day summary')[:40]}")
    nbad = T.evaluate(f"window.__app.Sync.attemptsOf('{amy}').filter((a) => a.ts >= {now - 20 * 60000} && a.r !== 'ok').length")
    T.click('.watch-page [data-only="1"]')
    T.wait_for_selector('.watch-page [data-only="1"].on')
    rows = T.locator(".watch-page .live-row").count()
    check(rows == nbad and T.locator(".watch-page .lr-r.ok").count() == 0, f"only-wrong filter shows {rows} rows (expected {nbad})")
    T.screenshot(path=str(OUT / "v2-watch-wrong.png"), full_page=True)
    T.click(".watch-page [data-review]")
    T.wait_for_selector(".sheet .rr-pos")
    check(txt(T, ".sheet .rr-pos").startswith("第 1／") and T.locator(".sheet .fb-ans.you").count() == 1, f"review sheet steps through the wrong answers: {txt(T, '.sheet .rr-pos')[:30]}")
    T.click('.sheet [data-rr="1"]')
    check(wait_until(lambda: txt(T, ".sheet .rr-pos").startswith("第 2／")), "next wrong answer")
    T.screenshot(path=str(OUT / "v3-review.png"))
    T.keyboard.press("Escape")
    time.sleep(0.4)
    T.click('.watch-page [data-only="0"]')
    T.wait_for_selector('.watch-page [data-only="0"].on')
    # 學生頁：最新 80 題＋「更早的作答」
    T.goto(URL + f"#/student/{amy}")
    T.wait_for_selector(".stu-detail [data-feedmore]")
    n1 = T.locator(".stu-detail .live-row").count()
    check(n1 == 80 and "還有" in txt(T, ".stu-detail [data-feedmore]"), f"student page shows the latest 80 with a load-more button ({n1})")
    T.click(".stu-detail [data-feedmore]")
    check(wait_until(lambda: T.locator(".stu-detail .live-row").count() > 80), f"load more shows the earlier answers ({T.locator('.stu-detail .live-row').count()})")
    # 課堂檢視的標題也有課名（學生正在做題時，從學生頁點過去）
    A.goto(URL)
    A.wait_for_selector(".home")
    A.click('.mod[data-mod="u2c"]')
    A.wait_for_selector(".qcard")
    T.click('[data-go="#/watch/' + amy + '"]')
    T.wait_for_selector(".watch-page")
    check(wait_until(lambda: "Unit 2｜" in txt(T, ".watch-page .lg-sub")), f"watch header names the unit: {txt(T, '.watch-page .lg-sub')[:40]}")
    A.locator("[data-act=close]").click()
    # 學生的重點總整理只有開放的課（老師 10/9 問：還沒開放其他課，重點總整理怎麼全部都有）
    A.goto(URL + "#/notes")
    A.wait_for_selector(".notes-units")
    units = A.evaluate("[...document.querySelectorAll('.notes-units button')].map((b) => b.dataset.u)")
    check("Unit 3" not in units and "Unit 1" in units, f"student's notes list only opened units {units}")
    # 老師自己的紀錄頁徽章還是原本的
    T.goto(URL + "#/stats")
    T.wait_for_selector(".page")
    check(T.locator(".badges").count() == 1, "teacher's own stats still show badges")
    b.close()
report()
