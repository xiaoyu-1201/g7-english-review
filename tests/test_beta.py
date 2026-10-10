"""2.22.1 試用新功能：只有老師帳號的裝置看得到開關；學生、家長看不到，就算改了裝置上的紀錄也打不開"""
import time
from playwright.sync_api import sync_playwright
from synchelp import *

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge")
    T, code = make_teacher(b)
    amy = add_student(T, "Amy")
    # 老師：設定頁有「試用新功能」，打開關掉都記得；畫筆試寫頁的連結
    T.goto(URL + "#/settings")
    T.wait_for_selector(".beta-sec")
    check("試用新功能" in txt(T, ".beta-sec") and T.locator(".beta-sec .new-tag").count() == 1, "teacher sees the trial section, marked 新")
    check(T.locator('.beta-sec a[href="pen-test.html"]').count() == 1, "trial list links to the pen try-out page")
    # 現在的功能都還在試寫頁：開關沒有作用 → 先不放，只放連結和說明
    check(T.locator('[data-seg="beta"]').count() == 0 and "試寫頁" in txt(T, ".beta-sec"), "no on/off switch while every trial feature is still on the try-out page")
    check(T.evaluate("window.__app.teacherDevice()"), "teacher device is recognised")
    check(not T.evaluate("window.__app.beta('pen')"), "the pen is not switched on inside the App yet")
    for name, w, h in (("phone", 390, 844), ("ipad", 820, 1180), ("pc", 1440, 900)):
        T.set_viewport_size({"width": w, "height": h})
        T.wait_for_timeout(300)
        T.locator(".beta-sec").scroll_into_view_if_needed()
        T.screenshot(path=str(OUT / f"beta-{name}.png"))
    T.set_viewport_size({"width": 390, "height": 844})
    # 老師把 iPad 切成學生模式借學生：開關、試用功能都不能出現
    T.evaluate(f"localStorage.setItem('g7review:active', '{amy}')")
    T.goto(URL + "#/settings")
    T.reload()
    T.wait_for_selector(".page")
    time.sleep(0.6)
    check(T.locator(".beta-sec").count() == 0 and not T.evaluate("window.__app.teacherDevice()"), "student mode on the teacher's iPad: no trial section")
    T.evaluate("localStorage.removeItem('g7review:active')")
    T.reload()
    T.wait_for_selector(".beta-sec")
    check(T.locator(".beta-sec").count() == 1, "back to teacher: the trial section is there again")
    # 學生、家長：設定頁沒有這一項；硬把紀錄改成 on 也不算
    A = page(b, 390, 844, "A")
    A.goto(link(code, "student", amy))
    wait_until(lambda: st(A) == "member")
    P = page(b, 390, 844, "P")
    P.goto(link(code, "parent", amy))
    wait_until(lambda: st(P) == "member")
    for pg, who in ((A, "student"), (P, "parent")):
        pg.goto(URL + "#/settings")
        pg.wait_for_selector(".page")
        time.sleep(0.5)
        if pg.locator(".sheet-wrap").count():
            pg.keyboard.press("Escape")
        check(pg.locator(".beta-sec").count() == 0 and "試用新功能" not in txt(pg, ".page"), f"{who} does not see the trial section")
        pg.evaluate("localStorage.setItem('g7review:beta', 'on')")
        pg.reload()
        pg.wait_for_selector(".page")
        time.sleep(0.5)
        check(pg.locator(".beta-sec").count() == 0, f"{who}: forcing the setting on this device still shows nothing")
        check(not pg.evaluate("window.__app.teacherDevice()"), f"{who}: device is not treated as a teacher device")
        # 假裝是老師（改裝置上的身分紀錄，但沒有真的老師帳號）也不行
        pg.evaluate("() => { const a = JSON.parse(localStorage.getItem('g7review:auth') || '{}'); a.email = 'fake@example.com'; localStorage.setItem('g7review:auth', JSON.stringify(a)) }")
        pg.reload()
        pg.wait_for_selector(".page")
        check(not pg.evaluate("window.__app.teacherDevice()") and pg.locator(".beta-sec").count() == 0, f"{who}: a faked teacher e-mail alone is not enough")
    # 試用中的功能不會跳「新功能」視窗給學生（NEWS 最新版還是 2.22）
    check(A.evaluate("window.__app.VERSION").startswith("2.22.1"), "version is 2.22.1")
    b.close()
report()
