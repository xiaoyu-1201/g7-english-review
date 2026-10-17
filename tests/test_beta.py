"""2.22.1 試用新功能（2.28 起畫筆已正式上線，目前沒有試用中的功能）：
設定頁不再出現「試用新功能」；老師裝置的判斷還在（之後再加試用功能會用到）；學生、家長就算改裝置上的紀錄也打不開"""
import time
from playwright.sync_api import sync_playwright
from synchelp import *

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge")
    T, code = make_teacher(b)
    amy = add_student(T, "Amy")
    T.goto(URL + "#/settings")
    T.wait_for_selector(".page")
    time.sleep(0.4)
    check(T.locator(".beta-sec").count() == 0 and "試用新功能" not in txt(T, ".page"), "no trial section while there is no trial feature (pen is live)")
    check(T.locator('a[href="pen-test.html"]').count() == 0, "no link to the old pen try-out page")
    check(T.evaluate("window.__app.teacherDevice()"), "teacher device is still recognised")
    check(not T.evaluate("window.__app.beta('pen')"), "beta('pen') is off (the pen is a normal feature now)")
    check(T.locator(".pen-fab").count() == 1, "pen button exists in the App")
    # 學生、家長：硬把紀錄改成 on 也沒有東西
    A = page(b, 390, 844, "A")
    A.goto(link(code, "student", amy))
    wait_until(lambda: st(A) == "member")
    for pg, who in ((A, "student"),):
        pg.evaluate("localStorage.setItem('g7review:beta', 'on')")
        pg.goto(URL + "#/settings")
        pg.reload()
        pg.wait_for_selector(".page")
        time.sleep(0.5)
        check(pg.locator(".beta-sec").count() == 0 and not pg.evaluate("window.__app.teacherDevice()"), f"{who}: nothing shows even with the device flag on")
    check(A.evaluate("window.__app.VERSION") >= "2.28", "version is 2.28 or later")
    b.close()
report()
