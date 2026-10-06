"""第一次進網站：「你是誰」點一下 → 學生直接開始；家長：貼連結或輸入代碼；老師：#/teacher 建立老師帳號"""
import time
from playwright.sync_api import sync_playwright
from synchelp import *

role_of = lambda pg: pg.evaluate("JSON.parse(localStorage.getItem('g7review:v1') || '{}').profile?.role")


def fresh(b, w, h, name, dark=False):
    c = b.new_context(viewport={"width": w, "height": h}, has_touch=True, color_scheme="dark" if dark else "light")
    c.add_init_script(DBSEED)
    pg = c.new_page()
    pg.on("pageerror", lambda e: errors.append(f"{name} pageerror: {e}"))
    return pg


with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge")
    # 老師（iPad）：歡迎畫面沒有老師按鈕 → 設定 → 開始使用老師後台
    T = fresh(b, 820, 1180, "T")
    T.goto(URL)
    T.wait_for_selector(".role-pick")
    time.sleep(0.5)
    T.screenshot(path=str(OUT / "a0-welcome-ipad.png"))
    check(T.locator('[data-role="teacher"]').count() == 0, "welcome has no teacher button")
    check(T.locator(".welcome [data-code]").count() == 1, "welcome offers code entry")
    T.keyboard.press("Escape")
    time.sleep(0.4)
    T.goto(URL + "#/settings")
    T.wait_for_selector("#sync-sec")
    check(T.locator('[data-x="newpair"]').count() == 0, "settings has no teacher entry")
    teacher_login(T, f"w{time.time_ns()}@example.com", signup=True)
    check(st(T) == "owner", "teacher backend created after sign-up")
    check(role_of(T) == "teacher", "teacher role saved")
    time.sleep(0.4)
    code = sync_of(T)["code"]
    amy = add_student(T, "Amy")
    T.goto(URL)
    T.reload()
    T.wait_for_selector(".home")
    time.sleep(0.6)
    check(T.locator(".role-pick").count() == 0, "welcome not shown again")
    check(wait_until(lambda: T.locator(".stu-card .stu-row").count() == 1), "teacher home shows students card")
    # 學生（手機）
    S = fresh(b, 390, 844, "S")
    S.goto(URL)
    S.wait_for_selector(".role-pick")
    time.sleep(0.5)
    S.screenshot(path=str(OUT / "a1-welcome-phone.png"))
    S.click('[data-role="student"]')
    time.sleep(0.5)
    check(S.locator(".sheet-wrap").count() == 0 and role_of(S) == "student", "student: one tap and done")
    # 家長（手機、深色）：選家長 → 貼連結 → 即時作答
    P = fresh(b, 390, 844, "P", dark=True)
    P.goto(URL)
    P.wait_for_selector(".role-pick")
    P.click('[data-role="parent"]')
    P.wait_for_selector("#pp-link")
    time.sleep(0.4)
    P.screenshot(path=str(OUT / "a2-parent-start-dark.png"))
    P.fill("#pp-link", link(code, "parent", amy).replace(URL, "https://xiaoyu-1201.github.io/g7-english-review/"))
    P.dispatch_event("#pp-link", "change")
    check(wait_until(lambda: P.evaluate("location.hash") == "#/live" and st(P) == "member"), "parent joined and on live page")
    check(role_of(P) == "parent", "parent role saved")
    # 設定裡可以改身分
    S.goto(URL + "#/settings")
    S.click('[data-seg="role"] button[data-v="parent"]')
    check(role_of(S) == "parent", "settings changes role")
    b.close()
report()
