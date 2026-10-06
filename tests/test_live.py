import pathlib, time, sys
from playwright.sync_api import sync_playwright

URL = "https://xiaoyu-1201.github.io/g7-english-review/"
OUT = pathlib.Path(__file__).parent / "shots"
errors = []
with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge")
    ctx = b.new_context(viewport={"width": 820, "height": 1180}, has_touch=True)
    ctx.add_init_script("if (!localStorage.getItem('g7review:v1')) localStorage.setItem('g7review:v1', JSON.stringify({seen:{intro:1}}))")
    pg = ctx.new_page()
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(URL)
    pg.wait_for_selector(".home", timeout=20000)
    time.sleep(2)
    v = pg.evaluate("window.__app && window.__app.VERSION")
    sw = pg.evaluate("navigator.serviceWorker.getRegistrations().then(r => r.length)")
    pg.click('[data-mod="u1c"]')
    pg.wait_for_selector(".qcard")
    time.sleep(0.6)
    pg.screenshot(path=str(OUT / "40-live.png"))
    print("version", v, "sw", sw)
    b.close()
print("ERRORS", errors)
