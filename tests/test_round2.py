"""第二輪：今天的任務、先說答案、錯因自評、徽章、鍵盤、大字"""
import pathlib, time
from playwright.sync_api import sync_playwright
SEED = "if (!localStorage.getItem('g7review:v1')) localStorage.setItem('g7review:v1', JSON.stringify({seen:{intro:1}}))"

URL = "http://127.0.0.1:5181/"
OUT = pathlib.Path(__file__).parent / "shots"
errors, notes = [], []
with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge")
    ctx = b.new_context(viewport={"width": 820, "height": 1180}, has_touch=True)
    ctx.add_init_script(SEED)
    pg = ctx.new_page()
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
    pg.goto(URL)
    pg.evaluate("localStorage.clear()")
    pg.goto(URL + "#/settings")
    pg.wait_for_selector("#f-exam")
    pg.fill("#f-exam", "2026-10-15")
    pg.click('[data-seg="oral"] button[data-v="on"]')
    time.sleep(0.3)
    pg.screenshot(path=str(OUT / "50-settings.png"), full_page=True)
    pg.goto(URL + "#/")
    pg.wait_for_selector(".plan-card")
    time.sleep(0.8)
    pg.screenshot(path=str(OUT / "51-home-plan.png"))
    notes.append(("plan", pg.locator(".plan-card").inner_text()[:300]))
    # 先說答案：s2 的第一題選擇題
    pg.click('[data-mod="s2"]')
    for _ in range(2):
        pg.wait_for_selector(".t-learn")
        pg.keyboard.press("3")  # 鍵盤選第 3 個
        time.sleep(0.2)
        pg.keyboard.press("Enter")
    pg.wait_for_selector(".t-mcq")
    time.sleep(0.5)
    pg.screenshot(path=str(OUT / "52-oral-cover.png"))
    notes.append(("covered", pg.locator(".opts-wrap.covered").count()))
    pg.keyboard.press("2")  # 遮住時不能選
    notes.append(("sel while covered", pg.locator(".opt.sel").count()))
    pg.click(".cover-btn")
    pg.keyboard.press("2")
    notes.append(("sel after uncover", pg.locator(".opt.sel").count()))
    pg.keyboard.press("Enter")
    time.sleep(0.6)
    if pg.locator(".why-me").count():
        pg.click('.why-me [data-w="rush"]')
        notes.append(("why picked", pg.locator(".why-me .pick.on").inner_text()))
    pg.screenshot(path=str(OUT / "53-why-me.png"), full_page=True)
    pg.keyboard.press("Enter")
    pg.wait_for_selector(".qcard")
    notes.append(("advanced to", pg.locator(".qcard").first.get_attribute("data-id")))
    # 做完 s1 全部答對 → 起步徽章
    pg.goto(URL + "#/settings")
    pg.click('[data-seg="oral"] button[data-v="off"]')
    pg.click('[data-seg="size"] button[data-v="lg"]')
    mods = pg.evaluate("() => window.__app.MODULES.s1.items")
    pg.goto(URL + "#/")
    pg.click('[data-mod="s1"]')
    for it in mods:
        pg.wait_for_selector(".qcard")
        card = pg.locator(".qcard").first
        t = it["t"]
        if t in ("learn", "mcq"):
            card.locator(f'.opt[data-i="{it["a"]}"]').click()
        elif t == "multi":
            for i in it["a"]:
                card.locator(f'.opt[data-i="{i}"]').click()
        elif t == "fill":
            for bi, ans in enumerate(it["ans"]):
                card.locator(f'.blank[data-b="{bi}"]').fill(ans[0])
        elif t == "write":
            card.locator(".write-in").fill(it["acc"][0])
        elif t == "spot":
            card.locator(f'.tok[data-i="{it["bad"]}"]').click()
            card.locator(".spot-in").fill(it["acc"][0])
        elif t == "sort":
            for i, (text, bb) in enumerate(it["chips"]):
                card.locator(f'.sort-pool .sort-chip[data-c="{i}"]').click()
                card.locator(f'.bin[data-bin="{bb}"]').click()
        pg.click("[data-act=check]")
        if t != "learn":
            pg.click("[data-act=check]")
    pg.wait_for_selector(".summary")
    time.sleep(1.5)
    notes.append(("toast", pg.locator("#toast").inner_text()))
    pg.screenshot(path=str(OUT / "54-summary-badge.png"))
    pg.goto(URL + "#/stats")
    pg.wait_for_selector(".badges")
    time.sleep(0.6)
    pg.screenshot(path=str(OUT / "55-stats-badges.png"), full_page=True)
    pg.goto(URL + "#/")
    pg.wait_for_selector(".plan-card")
    time.sleep(0.8)
    pg.screenshot(path=str(OUT / "56-home-after-lg.png"))
    ow = pg.evaluate("() => document.documentElement.scrollWidth - window.innerWidth")
    notes.append(("overflow lg", ow))
    b.close()
for n in notes:
    print("NOTE", n)
print("ERRORS", errors)
