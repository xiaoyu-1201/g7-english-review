"""2.28 畫筆放進 App：重點總整理的重點卡、練習的題目卡可以用 Apple Pencil（CDP 模擬 pointerType pen＋壓力）寫、畫螢光筆、擦、復原；
筆在選項上畫不會變成選了它、手指點選項照常；重新整理筆跡還在；手機寬工具列不超出畫面；設定頁沒有「試用新功能」了"""
import math, time
from playwright.sync_api import sync_playwright
from synchelp import *

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge")
    ctx = b.new_context(viewport={"width": 820, "height": 1180}, device_scale_factor=2, has_touch=True)
    pg = ctx.new_page()
    pg.add_init_script(SEED)
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL + "#/notes")
    pg.wait_for_selector(".note.pen-target[data-ink]")
    cdp = ctx.new_cdp_session(pg)

    def pen(points, kind="pen"):
        x, y, f = points[0]
        cdp.send("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x, "y": y, "pointerType": kind})
        cdp.send("Input.dispatchMouseEvent", {"type": "mousePressed", "x": x, "y": y, "button": "left", "clickCount": 1, "force": f, "pointerType": kind})
        for x, y, f in points[1:]:
            cdp.send("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x, "y": y, "button": "left", "buttons": 1, "force": f, "pointerType": kind})
        x, y, f = points[-1]
        cdp.send("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": x, "y": y, "button": "left", "clickCount": 1, "pointerType": kind})
        time.sleep(0.15)

    def box(sel):
        pg.locator(sel).first.scroll_into_view_if_needed()
        time.sleep(0.2)
        return pg.locator(sel).first.bounding_box()

    check(pg.locator(".pen-fab").is_visible(), "pen button shows on a page with cards")
    first = pg.locator(".note.pen-target[data-ink]").first
    key = first.get_attribute("data-ink")
    sel = f'.note[data-ink="{key}"]'
    # Apple Pencil 直接寫（不用先按筆）：工具列自己出現
    bx = box(sel)
    pen([(bx["x"] + 20 + t * 3, bx["y"] + 60 + math.sin(t / 8) * 10, 0.3 + 0.5 * math.sin(t / 60 * math.pi)) for t in range(60)])
    check(pg.locator(".pen-bar").is_visible(), "writing with the pencil opens the toolbar")
    check(pg.locator(f"{sel} .ink.pen path").count() == 1, "one black stroke on the first card")
    # 螢光筆
    pg.click('[data-tool="hl"]')
    pen([(bx["x"] + 20 + i * 5, bx["y"] + 100, 0.5) for i in range(40)])
    check(pg.locator(f"{sel} .ink.hl path").count() == 1, "highlighter stroke on its own layer")
    # 復原
    pg.click("[data-undo]")
    check(pg.locator(f"{sel} .ink.hl path").count() == 0, "undo removes the highlighter stroke")
    # 橡皮擦：擦掉黑筆
    pg.click('[data-tool="eraser"]')
    pen([(bx["x"] + 20 + t * 3, bx["y"] + 60 + math.sin(t / 8) * 10, 0.5) for t in range(0, 60, 6)])
    check(pg.locator(f"{sel} .ink.pen path").count() == 0, "eraser removes the black stroke")
    pg.click('[data-tool="black"]')
    pen([(bx["x"] + 30 + i * 4, bx["y"] + 70 + (i % 7), 0.6) for i in range(40)])
    saved = pg.evaluate("JSON.parse(localStorage.getItem('g7review:ink') || '{}')")
    check(key in saved and len(saved[key]) == 1, "stroke saved to localStorage under the card key")
    # 重新整理：還在
    pg.reload()
    pg.wait_for_selector(f"{sel} .ink path")
    check(pg.locator(f"{sel} .ink.pen path").count() == 1, "stroke is still there after reload")
    # 題目卡：筆在選項上畫不會選到；手指點照常
    pg.goto(URL + "#/")
    pg.wait_for_selector(".home")
    pg.locator(".mod[data-mod]").nth(1).click()
    pg.wait_for_selector(".qcard.pen-target")
    for _ in range(8):
        if pg.locator(".t-mcq .opt").count():
            break
        if pg.locator(".t-learn").count():
            pg.click('.opt[data-i="0"]'); pg.click("[data-act=check]"); time.sleep(0.4)
            if pg.locator("[data-act=next]").count():
                pg.click("[data-act=next]"); time.sleep(0.4)
        else:
            break
    oc = box(".t-mcq .opt >> nth=1")
    pen([(oc["x"] + 60 + i * 3, oc["y"] + oc["height"] - 10 - (i % 4), 0.6) for i in range(30)])
    time.sleep(0.3)
    check(pg.locator(".opt.sel").count() == 0, "a pen stroke across an option does not select it")
    check(pg.locator(".qcard .ink.pen path").count() == 1, "stroke drawn on the question card")
    time.sleep(0.8)  # 筆剛離開螢幕 0.6 秒內，手掌碰到卡片不算（手指要等一下）
    pg.touchscreen.tap(oc["x"] + 40, oc["y"] + oc["height"] / 2)
    time.sleep(0.4)
    check(pg.locator(".opt.sel").count() == 1, "a finger tap still selects the option")
    # 手機寬：工具列不超出
    pg.set_viewport_size({"width": 390, "height": 844})
    time.sleep(0.4)
    if not pg.locator(".pen-bar").is_visible():
        pg.click(".pen-fab")
    bb = pg.locator(".pen-bar").bounding_box()
    check(bb and bb["x"] >= 0 and bb["x"] + bb["width"] <= 390, f"toolbar fits on a phone ({bb})")
    check(pg.evaluate("document.documentElement.scrollWidth") <= 390, "no horizontal scroll")
    pg.screenshot(path=str(OUT / "pen-run-phone.png"))
    # 設定：沒有「試用新功能」了（畫筆已正式上線）
    pg.goto(URL + "#/settings")
    pg.wait_for_selector(".page")
    check("試用新功能" not in txt(pg, ".page"), "no beta section any more")
    check(not errs, f"no JS errors ({errs})")
    b.close()
report()
