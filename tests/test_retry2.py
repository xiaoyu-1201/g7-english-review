"""答錯後「再試一次」：練習中、上一題回顧、模擬段考檢討；分數照第一次、再試答對不算錯題本畢業；老師的課堂檢視跟著更新"""
import time
from playwright.sync_api import sync_playwright
from synchelp import *

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge")
    T, code = make_teacher(b)
    amy = add_student(T, "Amy")
    A = page(b, 390, 844, "Amy")
    A.goto(link(code, "student", amy))
    wait_until(lambda: st(A) == "member")
    T.goto(URL + "#/watch/" + amy)
    # s2：觀念、觀念、選擇題 → 故意答錯
    A.goto(URL)
    A.wait_for_selector(".home")
    A.click('[data-mod="s2"]')
    for _ in range(2):
        A.wait_for_selector(".t-learn")
        A.click('.opt[data-i="0"]')
        A.click("[data-act=check]")
    A.wait_for_selector(".t-mcq")
    right = A.evaluate("window.__app.ITEM[document.querySelector('.qcard').dataset.id].a")
    wrong = (right + 1) % 3
    A.click(f'.opt[data-i="{wrong}"]')
    A.click("[data-act=check]")
    check(A.locator('[data-act="retry"]').count() == 1, "wrong answer offers 再試一次")
    check(wait_until(lambda: T.locator(".watch-q.bad").count() == 1), "teacher watch shows wrong")
    A.click('[data-act="retry"]')
    check(A.locator(".qcard.done").count() == 0 and A.locator('[data-act="hint"]').count() == 1, "retry shows fresh question with hint")
    check(wait_until(lambda: "正在作答" in txt(T, ".wq-h")), "teacher watch back to 正在作答")
    A.click(f'.opt[data-i="{right}"]')
    A.click("[data-act=check]")
    check(A.locator('[data-act="retry"]').count() == 0, "correct retry: no more 再試一次")
    check(wait_until(lambda: T.locator(".watch-q.ok").count() == 1), "teacher watch shows retry correct")
    qid = A.evaluate("document.querySelector('.qcard').dataset.id")
    res = A.evaluate("Object.values(window.__app.S.progress).find(p => p.ids.includes('%s')).res['%s']" % (qid, qid))
    check(res == "bad", "score keeps first attempt (bad)")
    xs = A.evaluate("window.__app.S.attempts.filter(a => a.q === '%s').map(a => a.x)" % qid)
    check(xs == ["p", "r"], f"retry recorded as x=r ({xs})")
    # 上一題回顧：下一題（填空）故意答錯、不重試，到下一題再按上一題 → 有「再試一次」→ 視窗裡作答
    A.click("[data-act=check]")  # 繼續到下一題（填空）
    A.wait_for_selector(".t-fill")
    for el in A.locator(".qcard .blank").all():
        el.fill("zzz")
    A.click("[data-act=check]")
    A.wait_for_selector('[data-act="retry"]')
    A.click("[data-act=check]")  # 不重試，繼續
    time.sleep(0.4)
    A.wait_for_selector('[data-act="back"]')
    A.click('[data-act="back"]')
    A.wait_for_selector(".run.reviewing")
    check("只能看" not in txt(A, ".run-count"), "review tag no longer says 只能看")
    check(A.locator('[data-act="retry"]').count() == 1, "review of wrong question offers 再試一次")
    A.click('[data-act="retry"]')
    A.wait_for_selector(".sheet .qcard")
    check("再試一次" in txt(A, ".sheet-title"), "retry sheet opens in practice mode")
    ans = A.evaluate("window.__app.ITEM[document.querySelector('.sheet .qcard').dataset.id].ans.map(a => a[0])")
    for i, v in enumerate(ans):
        A.locator(f'.sheet .blank[data-b="{i}"]').fill(v)
    A.click(".sheet [data-check]")
    check(wait_until(lambda: A.locator(".sheet .qcard.done").count() == 1), "retry in sheet graded")
    A.keyboard.press("Escape")
    # 這個介面不再出現「這台」
    for h in ("#/settings", "#/stats", "#/"):
        A.goto(URL + h)
        time.sleep(0.5)
        check("這台" not in A.locator("body").inner_text(), f"no 這台 on student {h}")
    for h in ("#/settings", "#/students", "#/student/" + amy, "#/manage"):
        T.goto(URL + h)
        time.sleep(0.6)
        check("這台" not in T.locator("body").inner_text(), f"no 這台 on teacher {h}")
    T.goto(URL + "#/student/" + amy)
    T.wait_for_selector("[data-class]")
    check("學生模式" in txt(T, "[data-class]"), "feature named 學生模式")
    b.close()
report()
