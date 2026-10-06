"""派作業：老師派 → 學生首頁出現 → 做完自動打勾 → 老師收到通知 → 家長看得到；自動挑；舊題的考點與選項解析"""
import time
from playwright.sync_api import sync_playwright
from synchelp import *


def do_module(pg, mid):
    """照標準答案把一個單元做完（只處理觀念卡和選擇題）"""
    pg.wait_for_selector(".qcard")
    for _ in range(40):
        if pg.locator(".summary").count():
            return True
        card = pg.locator(".qcard").first
        if card.count() == 0:
            time.sleep(0.2)
            continue
        if pg.locator(".qcard.done").count():
            pg.click("[data-act=check]")
            time.sleep(0.2)
            continue
        a = pg.evaluate("window.__app.ITEM[document.querySelector('.qcard').dataset.id].a")
        pg.click(f'.qcard .opt[data-i="{a}"]')
        pg.click("[data-act=check]")
        time.sleep(0.2)
        if pg.locator(".t-learn").count() == 0 and pg.locator(".qcard.done").count():
            pg.click("[data-act=check]")
        time.sleep(0.2)
    return pg.locator(".summary").count() > 0


with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge")
    T, code = make_teacher(b)
    amy = add_student(T, "Amy")
    A = page(b, 390, 844, "Amy")
    A.goto(link(code, "student", amy))
    wait_until(lambda: st(A) == "member")
    PA = page(b, 390, 844, "PA", seed=DBSEED)
    PA.goto(link(code, "parent", amy))
    wait_until(lambda: st(PA) == "member")
    # 舊題目也有考點＋選項解析
    A.goto(URL)
    A.wait_for_selector(".home")
    A.click('[data-mod="s2"]')
    A.wait_for_selector(".qcard")
    while A.locator(".t-learn").count():
        a = A.evaluate("window.__app.ITEM[document.querySelector('.qcard').dataset.id].a")
        A.click(f'.qcard .opt[data-i="{a}"]')
        A.click("[data-act=check]")
        time.sleep(0.2)
    qid = A.evaluate("document.querySelector('.qcard').dataset.id")
    if A.locator(".t-mcq").count():
        a = A.evaluate("window.__app.ITEM[document.querySelector('.qcard').dataset.id].a")
        n = A.locator(".qcard .opt").count()
        A.click(f'.qcard .opt[data-i="{(a + 1) % n}"]')
        A.click("[data-act=check]")
        check(A.locator(".fb-kp").count() == 1, f"old question {qid} shows 考點")
        check(A.locator(".fb-why li").count() >= 2, f"old question {qid} shows 選項解析")
    A.click("[data-act=close]")
    # 老師派作業：自動挑（還沒有錯題時挑還沒做的單元）＋手動選
    T.goto(URL + "#/student/" + amy)
    T.wait_for_selector("[data-assign]")
    T.click("[data-assign]")
    T.wait_for_selector(".hw-pick")
    T.click("[data-auto]")
    check(T.locator(".hw-pick.on").count() >= 1, "auto pick selects something")
    check(len(txt(T, ".hw-auto-why")) > 5, "auto pick explains why")
    for key in T.eval_on_selector_all(".hw-pick.on", "els => els.map(e => e.dataset.t)"):
        T.click(f'.hw-pick[data-t="{key}"]')
    T.click('.hw-pick[data-t="mod:k1"]')
    T.click('.hw-pick[data-t="book"]')
    T.fill("#hw-note", "情境題要先看答句")
    time.sleep(0.2)
    T.screenshot(path=str(OUT / "f1-assign.png"))
    T.click(".sheet [data-ok]")
    check(wait_until(lambda: "已派給" in txt(T, "#toast")), "assigned toast")
    check(wait_until(lambda: T.locator(".hw-card .hw-task").count() == 2), "teacher sees assignment with 2 tasks")
    # 學生首頁：作業卡（錯題本是空的 → 已算完成）
    A.goto(URL)
    A.reload()
    check(wait_until(lambda: A.locator(".hw-card .hw-task").count() == 2, 12), "student home shows homework")
    check("情境題要先看答句" in txt(A, ".hw-card"), "note shown to student")
    check(wait_until(lambda: "0／2" in txt(A, ".hw-card")), "book has a wrong answer, so 0/2")
    time.sleep(0.3)
    A.screenshot(path=str(OUT / "f2-student-hw.png"))
    # 家長也看得到（唯讀）
    PA.goto(URL + "#/live")
    PA.reload()
    check(wait_until(lambda: PA.locator(".hw-card .hw-task").count() == 2, 12), "parent sees homework")
    check(PA.locator(".hw-card button.hw-task").count() == 0, "parent view is read-only")
    # 學生點作業 → 做完 k1 → 自動打勾、恭喜；老師收到通知
    A.click('.hw-card [data-hw*="k1"]')
    check(do_module(A, "k1"), "student finished assigned module")
    A.goto(URL)
    A.wait_for_selector(".home")
    check(wait_until(lambda: "1／2" in txt(A, ".hw-card")), "module task checked off (1/2)")
    A.click('.hw-card [data-hw*="book"]')
    check(do_module(A, "book"), "student finished 錯題本 review")
    A.goto(URL)
    A.wait_for_selector(".home")
    check(wait_until(lambda: "全部完成" in txt(A, ".hw-card")), "student homework all done")
    check(wait_until(lambda: "作業完成" in txt(A, "#toast")), "student gets celebration")
    check(wait_until(lambda: "完成作業" in txt(T, "#toast"), 12), "teacher notified of completion")
    check(wait_until(lambda: "全部完成" in txt(T, ".hw-card")), "teacher page shows done")
    T.goto(URL + "#/students")
    check(wait_until(lambda: T.locator(".stu-row").count() == 1), "student list ok")
    time.sleep(0.3)
    T.goto(URL + "#/student/" + amy)
    T.wait_for_selector(".hw-card")
    time.sleep(0.3)
    T.screenshot(path=str(OUT / "f3-teacher-hw.png"))
    # 刪除作業
    T.click("[data-delhw]")
    T.click(".sheet [data-ok]")
    check(wait_until(lambda: T.locator(".hw-card .hw-item").count() == 0), "homework deleted")
    # 學生不能派作業給自己
    stok = tok_of(A)
    check(http("PUT", f"/classes/{code}/hw/{amy}/x.json?auth={stok}", {"title": "x", "tasks": [], "at": 1})[0] == 401, "student cannot write homework")
    b.close()
report()
