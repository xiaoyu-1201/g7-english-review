"""學生「先做題、之後才加入」：加入時把以前的作答全部補傳，老師看得到"""
import time
from playwright.sync_api import sync_playwright
from synchelp import *

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge")
    St = page(b, 390, 844, "S")
    # 學生早上先做 Unit 2（還沒連結）
    St.goto(URL)
    St.wait_for_selector(".home")
    items = St.evaluate("() => window.__app.MODULES.u2c.items")
    St.click('[data-mod="u2c"]')
    for it in items:
        St.wait_for_selector(".qcard")
        card = St.locator(".qcard").first
        if it["t"] in ("learn", "mcq"):
            card.locator(f'.opt[data-i="{it["a"]}"]').click()
        elif it["t"] == "fill":
            for bi, ans in enumerate(it["ans"]):
                card.locator(f'.blank[data-b="{bi}"]').fill(ans[0])
        elif it["t"] == "spot":
            card.locator(f'.tok[data-i="{it["bad"]}"]').click()
            card.locator(".spot-in").fill(it["acc"][0])
        elif it["t"] == "sort":
            for i, (text, bb) in enumerate(it["chips"]):
                card.locator(f'.sort-pool .sort-chip[data-c="{i}"]').click()
                card.locator(f'.bin[data-bin="{bb}"]').click()
        St.click("[data-act=check]")
        if it["t"] != "learn":
            St.click("[data-act=check]")
    St.wait_for_selector(".summary")
    n_before = St.evaluate("window.__app.S.attempts.length")
    check(n_before >= 10, f"student did {n_before} answers before joining")
    # 下午老師新增學生，給代碼；學生在同一個 App 的設定輸入代碼
    T, code = make_teacher(b)
    amy = add_student(T, "Amy")
    T.goto(URL + "#/student/" + amy)
    T.click('[data-share="student"]')
    wait_until(lambda: len(txt(T, ".sheet .code-big").replace(" ", "")) == 6)
    c6 = txt(T, ".sheet .code-big")
    T.keyboard.press("Escape")
    St.goto(URL + "#/settings")
    St.click('[data-x="code"]')
    St.fill("#cs-code", c6)
    St.click(".sheet [data-ok]")
    check(wait_until(lambda: "同步上去" in txt(St, "#toast")), "student sees upload toast")
    T.goto(URL + "#/student/" + amy)
    check(wait_until(lambda: T.locator(".live-row").count() == n_before), f"teacher received all {n_before} morning answers")
    check(wait_until(lambda: T.evaluate(f"window.__app.Sync.sessionsOf('{amy}').length") >= 1), "teacher received session summary")
    St.goto(URL + "#/settings")
    St.wait_for_selector("#sync-sec")
    check(wait_until(lambda: "紀錄都已上傳" in txt(St, "#sync-sec")), "settings says all uploaded")
    b.close()
report()
