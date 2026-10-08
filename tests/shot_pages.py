"""手機寬度截圖各主要頁面（排版檢查用，不是測試）：.\\tests\\run_tests.ps1 -Tests shot_pages.py"""
import time
from playwright.sync_api import sync_playwright
from synchelp import *

SHOTS = OUT / "pages"
SHOTS.mkdir(exist_ok=True)

def shot(pg, name, full=False):
    time.sleep(0.5)
    pg.screenshot(path=str(SHOTS / f"{name}.png"), full_page=full)
    ow = pg.evaluate("document.documentElement.scrollWidth - window.innerWidth")
    print(name, "overflow", ow)

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge")
    T, code = make_teacher(b, w=390, h=844)
    amy = add_student(T, "Amy")
    add_student(T, "Ben")
    A = page(b, 390, 844, "A")
    A.goto(link(code, "student", amy))
    wait_until(lambda: st(A) == "member")
    answer_one(A, "u2b")
    # 學生端
    for h, sel, name in [("#/", ".home", "s-home"), ("#/exam", ".exam-intro", "s-exam"), ("#/book", ".page", "s-book"), ("#/stats", ".page", "s-stats"), ("#/settings", ".page", "s-settings")]:
        A.goto(URL + h)
        A.wait_for_selector(sel)
        shot(A, name, full=True)
    A.goto(URL)
    A.wait_for_selector(".home")
    A.click('.mod[data-mod="u1b"]')
    A.wait_for_selector(".qcard")
    shot(A, "s-run")
    A.click("[data-act=close]")
    A.wait_for_selector(".home")
    A.click("[data-plan=L1]")
    time.sleep(0.4)
    shot(A, "s-plan-sheet")
    A.keyboard.press("Escape")
    # 老師端（手機寬）
    for h, sel, name in [("#/students", ".stu-page", "t-students"), (f"#/student/{amy}", ".stu-detail", "t-student"), (f"#/watch/{amy}", ".watch-page", "t-watch"), ("#/manage", ".page", "t-manage"), ("#/settings", ".page", "t-settings")]:
        T.goto(URL + h)
        T.wait_for_selector(sel)
        shot(T, name, full=True)
    T.goto(URL + "#/students")
    T.wait_for_selector(".sc")
    T.click(f'.sc[data-card="{amy}"] [data-act="hw"]')
    time.sleep(0.6)
    shot(T, "t-hw-sheet")
    T.keyboard.press("Escape")
    time.sleep(0.3)
    T.click(f'.sc[data-card="{amy}"] [data-act="units"]')
    time.sleep(0.6)
    shot(T, "t-units-sheet")
    T.keyboard.press("Escape")
    T.goto(URL + "#/teacher")
    time.sleep(0.6)
    shot(T, "t-teacher-page", full=True)
    # 新裝置的歡迎畫面
    N = page(b, 390, 844, "N", seed="")
    N.goto(URL)
    time.sleep(0.8)
    shot(N, "welcome", full=True)
    b.close()
print("ERRORS", errors)
