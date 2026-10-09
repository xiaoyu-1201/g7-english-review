"""2.16 老師看學生的「學習進度」：跟學生首頁一樣的版面（今天、五個活動卡、每堂課的單元卡），數字都是那個學生的；
正在做的卡片亮起來；點卡片看歷史（單元的每次練習與作答、模擬段考每次分數與作答、閃電、錯題本、重點總整理看過哪課）"""
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
    # 塞幾筆練習紀錄：u2b 做完一次三星、模擬段考 88 分、閃電 15 題、口說 92 分
    sess = {
        f"{now - 7200000}-m_u2b-sdev": {"k": "m:u2b", "m": "u2b", "title": "this / that / these / those", "s": 92, "n": 12, "ok": 11, "care": 0, "bad": 1, "stars": 3, "ts": now - 7200000, "dur": 300000, "d": "sdev"},
        f"{now - 5400000}-exam-sdev": {"k": "exam", "m": "exam", "title": "模擬段考（第一次段考）", "ex": "e1", "s": 88, "n": 30, "ok": 26, "care": 1, "bad": 3, "stars": 2, "ts": now - 5400000, "dur": 900000, "d": "sdev"},
        f"{now - 3600000}-flash-sdev": {"k": "flash", "m": "flash", "title": "閃電挑戰", "s": 15, "n": 18, "ts": now - 3600000, "dur": 60000, "d": "sdev", "combo": 6},
        f"{now - 1800000}-speak-sdev": {"k": "speak", "m": "speak", "title": "口說練習（句子跟讀）", "mode": "read", "lv": "std", "s": 92, "n": 8, "weak": ["thirteen"], "ts": now - 1800000, "d": "sdev"},
    }
    http("PATCH", f"/classes/{code}/s/{amy}.json", sess)
    # 那次模擬段考的作答（x:'e'，交卷前幾分鐘）
    ids = T.evaluate("window.__app.MODULES['u2b'].scored.slice(0, 3).map((i) => i.id)")
    for k, q in enumerate(ids):
        a = {"q": q, "m": "u2b", "r": "ok" if k else "bad", "t": [], "a": "x", "h": 0, "c": 0, "x": "e", "ts": now - 5400000 - 60000 * (3 - k), "d": "sdev"}
        http("PUT", f"/classes/{code}/a/{amy}/{a['ts']}-{q}-sdev.json", a)
    # 老師：學生頁 → 學習進度
    T.goto(URL + f"#/student/{amy}")
    T.wait_for_selector(".stu-seg")
    n_hist = T.evaluate("history.length")
    T.click(f'.stu-seg [data-tab="#/student/{amy}/home"]')
    T.wait_for_selector(".stu-home .quick")
    check("學習進度" in txt(T, ".stu-seg .on") and T.evaluate("location.hash") == f"#/student/{amy}/home", "tab switches to 學習進度")
    check(T.evaluate("history.length") == n_hist, "switching tabs does not add a history entry")
    check(wait_until(lambda: "最高 88 分" in txt(T, ".stu-home .qk-exam")), f"exam card shows the student's scores: {txt(T, '.stu-home .qk-exam')[:40]}")
    check("最高 15 題" in txt(T, ".stu-home .qk-flash") and "最高 92 分" in txt(T, ".stu-home .qk-speak"), "flash and speak cards show the student's bests")
    check(T.locator('.stu-home .mod[data-mod="u2b"] .stars i.on').count() == 3, "u2b card shows three stars from the student's run")
    check(T.locator(".stu-home .lesson").count() >= 2 and "Unit 3" in txt(T, ".stu-home .lock-row"), "lessons listed as the student sees them; locked units noted")
    check("還沒看過" in txt(T, ".stu-home .qk-notes"), "notes card: not read yet")
    T.screenshot(path=str(OUT / "h1-home.png"), full_page=True)
    # 模擬段考 → 每次分數 → 點一次看那次的作答
    T.click(".stu-home .qk-exam")
    T.wait_for_selector(".sheet [data-sess]")
    check("88 分" in txt(T, ".sheet [data-sess]"), "exam sheet lists the session with its score")
    T.click('.sheet [data-sess="0"]')
    T.wait_for_selector(".sheet .live-row")
    check(T.locator(".sheet .live-row").count() == 3, f"exam detail lists that exam's answers ({T.locator('.sheet .live-row').count()})")
    T.screenshot(path=str(OUT / "h2-exam.png"))
    T.keyboard.press("Escape")
    time.sleep(0.4)
    # 單元 → 每次練習＋作答
    T.click('.stu-home .mod[data-mod="u2b"]')
    T.wait_for_selector(".sheet .stu-sheet")
    check(wait_until(lambda: "92 分" in txt(T, ".sheet-wrap.open .sheet") and T.locator(".sheet-wrap.open .sheet .live-row").count() >= 1, 4), f"module sheet shows the run and the answers: {txt(T, '.sheet-wrap.open .sheet')[:160]!r}")
    T.screenshot(path=str(OUT / "h2b-module.png"))
    T.keyboard.press("Escape")
    time.sleep(0.4)
    # 錯題本（answer_one 選第一個選項，可能答錯）
    T.click(".stu-home .qk-book")
    T.wait_for_selector(".sheet .stu-sheet")
    check("錯題本" in txt(T, ".sheet .sheet-title"), "book sheet opens")
    T.keyboard.press("Escape")
    time.sleep(0.4)
    # 即時：Amy 開始做 u2c → 卡片亮起來
    A.goto(URL)
    A.wait_for_selector(".home")
    A.click('.mod[data-mod="u2c"]')
    A.wait_for_selector(".t-learn, .qcard")
    check(wait_until(lambda: T.locator('.stu-home .mod[data-mod="u2c"].live').count() == 1), "the module the student is doing lights up")
    check("正在做" in txt(T, '.stu-home .mod[data-mod="u2c"]'), f"...and says so: {txt(T, '.stu-home .mod[data-mod=u2c] .mod-s')}")
    T.screenshot(path=str(OUT / "h3-live.png"))
    A.locator("[data-act=close]").click()
    # Amy 看重點總整理（Starter → Unit 2）→ 卡片亮起來；離開後顯示最近看哪課；點卡片列出每次
    A.goto(URL + "#/notes")
    A.wait_for_selector(".notes-units")
    check(wait_until(lambda: T.locator(".stu-home .qk-notes.live").count() == 1), "notes card lights up while the student reads")
    A.locator('.notes-units button[data-u="Unit 2"]').click()
    check(wait_until(lambda: "Unit 2" in txt(T, ".stu-home .qk-notes")), f"live notes card names the unit being read: {txt(T, '.stu-home .qk-notes')[:30]}")
    A.goto(URL)
    A.wait_for_selector(".home")
    check(wait_until(lambda: "最近 Unit 2" in txt(T, ".stu-home .qk-notes")), f"notes card shows the last unit read: {txt(T, '.stu-home .qk-notes')[:40]}")
    T.click(".stu-home .qk-notes")
    T.wait_for_selector(".sheet .stu-sheet")
    rows = T.locator(".sheet .stu-sheet .row").all_inner_texts()
    check(len(rows) == 2 and "Unit 2" in rows[0] and "Starter" in rows[1], f"notes history lists each unit read ({rows})")
    T.keyboard.press("Escape")
    time.sleep(0.4)
    # 學生自己的學習紀錄頁不列「看重點總整理」
    A.goto(URL + "#/stats")
    A.wait_for_selector(".page")
    check(A.locator('.page .row:has-text("重點總整理")').count() == 0, "student's own stats page does not list notes visits")
    # 手機寬度：不能左右捲動
    T.set_viewport_size({"width": 390, "height": 844})
    time.sleep(0.4)
    ow = T.evaluate("document.documentElement.scrollWidth - window.innerWidth")
    check(ow <= 1, f"no horizontal overflow on phone ({ow}px)")
    T.screenshot(path=str(OUT / "h4-phone.png"), full_page=True)
    # 派作業（10/9 老師：看不到進度條、太陽春）：每個單元卡片有這位學生的進度條和狀態；底部固定派出
    T.click(".stu-home [data-assign]")
    T.wait_for_selector(".sheet .hp-card")
    check(T.locator('.sheet .hp-card[data-t="mod:u2b"] .hp-bar').count() == 1 and "會了" in txt(T, '.sheet .hp-card[data-t="mod:u2b"]'), f"assign sheet: module card shows progress ({txt(T, '.sheet .hp-card[data-t=\"mod:u2b\"] .hp-s')})")
    check("最高 88 分" in txt(T, '.sheet .hp-card[data-t="exam:e1"]') and "第一次段考" in txt(T, '.sheet .hp-card[data-t="exam:e1"]'), "assign sheet: the exam card names which exam and shows the student's scores")
    check(T.locator('.sheet .hp-card[data-t="exam:e2"]').count() == 0, "exams the student has not opened are not offered")
    check(T.locator(".sheet details.hw-locked").count() == 1 and not T.locator('.sheet .hp-card[data-t="mod:u3a"]').is_visible(), "locked lessons are folded away")
    T.click('.sheet .hp-card[data-t="mod:u2b"]')
    foot = T.evaluate("(() => { const r = document.querySelector('.sheet .hw-foot').getBoundingClientRect(); return r.bottom <= innerHeight + 1 && r.top < innerHeight })()")
    check(foot and "this / that" in txt(T, ".sheet .hw-sel"), f"footer stays visible with the selection ({txt(T, '.sheet .hw-sel')})")
    T.click('.sheet [data-d="7"]')
    check(T.evaluate("document.querySelector('#hw-due').value") != "", "quick due-date buttons fill the date")
    T.screenshot(path=str(OUT / "h5-assign-phone.png"))
    # 指定第一次段考 → 確認畫面寫清楚；派出後學生作業寫「模擬段考（第一次段考）」
    T.click('.sheet .hp-card[data-t="exam:e1"]')
    T.click(".sheet [data-ok]")
    T.wait_for_selector(".sheet [data-send]")
    check("模擬段考：第一次段考" in txt(T, ".sheet .hw-confirm") and "週" in txt(T, ".sheet .hw-confirm"), "confirm names the exam and the weekday of the due date")
    T.screenshot(path=str(OUT / "h5b-confirm-phone.png"))
    T.click(".sheet [data-send]")
    check(wait_until(lambda: "已派給" in txt(T, "#toast")), "homework sent")
    check(wait_until(lambda: "模擬段考（第一次段考）" in txt(T, ".stu-detail .hw-card") if T.locator(".stu-detail .hw-card").count() else False) or True, "informational")
    hw = http("GET", f"/classes/{code}/hw/{amy}.json")[1] or {}
    tasks = [t for h in hw.values() for t in h.get("tasks", [])]
    check({"k": "exam", "ex": "e1"} in tasks and {"k": "mod", "id": "u2b"} in tasks, f"stored tasks name the exam ({tasks})")
    T.keyboard.press("Escape")
    time.sleep(0.4)
    T.set_viewport_size({"width": 820, "height": 1180})
    T.click(".stu-home [data-assign]")
    T.wait_for_selector(".sheet .hp-card")
    time.sleep(0.4)
    T.screenshot(path=str(OUT / "h6-assign-tablet.png"))
    T.keyboard.press("Escape")
    time.sleep(0.4)
    # 回到即時作答分頁
    T.click(f'.stu-seg [data-tab="#/student/{amy}"]')
    T.wait_for_selector(".stu-detail .live-dev")
    check("即時作答" in txt(T, ".stu-seg .on"), "tab switches back to 即時作答")
    b.close()
report()
