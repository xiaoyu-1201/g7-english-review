"""2.25 花園外觀：預設是花園；設定 → 外觀 可以切到講義再切回來（不用重新整理）；
對答案時，錯的選項變紅、對的變綠（不能被花園的白底／紫色「選到」蓋掉）；圖片 A/B/C/D 題不排 2×2；列印不印插畫"""
import time
from playwright.sync_api import sync_playwright
from synchelp import *

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge")
    P = page(b, 390, 844, "skin")
    P.goto(URL)
    P.wait_for_selector(".home")
    check(P.evaluate("document.documentElement.dataset.skin") == "garden", "garden is the default skin")
    check(P.evaluate("getComputedStyle(document.body, '::before').backgroundImage.includes('bg-garden')"), "garden background picture is behind the page")
    check(P.locator(".sticky .st-ic").count() == 4, "the four number tiles have icons")
    # 2.25 主畫面圖示（小芽）：manifest 和 apple-touch-icon 都指到 v3，圖抓得到
    mf = P.evaluate("fetch(document.querySelector('link[rel=manifest]').href).then(r => r.json())")
    check(all("-v2.png" in i["src"] for i in mf["icons"]) and mf["display"] == "standalone", "manifest icons are set")
    for src in [i["src"] for i in mf["icons"]] + [P.get_attribute("link[rel=apple-touch-icon]", "href")]:
        check(P.evaluate(f"fetch({src!r}).then(r => r.ok)"), f"icon loads: {src}")
    # 不認得的值 → 花園
    P.evaluate("localStorage.setItem('g7review:skin', 'Garden')")
    P.reload()
    P.wait_for_selector(".home")
    check(P.evaluate("document.documentElement.dataset.skin") == "garden", "unknown saved skin falls back to garden")
    # 設定 → 外觀
    P.goto(URL + "#/settings")
    P.wait_for_selector('[data-seg="skin"]')
    check("on" in (P.get_attribute('[data-seg="skin"] [data-v="garden"]', "class") or ""), "settings: 花園 is selected")
    P.click('[data-seg="skin"] [data-v="notebook"]')
    time.sleep(0.4)
    check(P.evaluate("document.documentElement.dataset.skin") == "notebook", "settings: switch to 講義")
    check(P.evaluate("localStorage.getItem('g7review:skin')") == "notebook", "the choice is saved on this device")
    check(P.evaluate("!!document.querySelector('link[href*=\"LXGW+WenKai\"]')"), "講義 font is loaded after switching")
    check(P.evaluate("getComputedStyle(document.body, '::before').backgroundImage") in ("none", ""), "no garden picture in 講義")
    check("on" in (P.get_attribute('[data-seg="skin"] [data-v="notebook"]', "class") or ""), "settings redraws with 講義 selected")
    P.click('[data-seg="skin"] [data-v="garden"]')
    time.sleep(0.4)
    check(P.evaluate("document.documentElement.dataset.skin") == "garden", "settings: switch back to 花園")
    # 對答案的顏色
    P.goto(URL)
    P.wait_for_selector(".home")
    P.locator(".mod[data-mod]").nth(1).click()
    for _ in range(8):
        if P.locator(".t-mcq").count() or P.locator(".run .opts .opt").count():
            break
        time.sleep(0.5)
    P.wait_for_selector(".run .opts .opt")
    saw2 = False
    # 找一個錯的選項：每題都點第一個，答錯就停；答對就換下一題再試
    found = False
    for _ in range(30):
        if P.locator(".run-card .opt.bad").count():
            found = True
            break
        en = P.locator(".run-card .opts .opt:enabled")
        if en.count():
            saw2 = saw2 or P.locator(".run-card .opts.grid2").count() > 0
            en.first.click()
            P.click("[data-act=check]")
        elif P.locator(".run-card input:enabled, .run-card textarea:enabled").count() and not P.locator("[data-act=check]:enabled").count():
            P.locator(".run-card input:enabled, .run-card textarea:enabled").first.fill("x")  # 填空、寫句子：隨便填，交出去換下一題
        elif P.locator("[data-act=next]:enabled").count():
            P.click("[data-act=next]")
        elif P.locator("[data-act=check]:enabled").count():
            P.click("[data-act=check]")
        time.sleep(0.7)
    check(found, "got a wrong answer to look at")
    check(saw2, "short options are 2×2 in garden")
    if found:
        bad = P.evaluate("getComputedStyle(document.querySelector('.opt.bad')).backgroundColor")
        ok = P.evaluate("getComputedStyle(document.querySelector('.opt.ok, .opt.miss')).backgroundColor")
        check(bad not in ("rgb(255, 255, 255)", "rgb(241, 234, 255)"), f"wrong option is red, not white/purple ({bad})")
        check(ok != "rgb(255, 255, 255)", f"right option is green ({ok})")
        P.screenshot(path=str(OUT / "skin-feedback.png"))
    # 列印：不印插畫
    P.emulate_media(media="print")
    check(P.evaluate("getComputedStyle(document.body, '::before').display") == "none", "print: no background picture")
    P.emulate_media(media="screen")
    b.close()
report()
