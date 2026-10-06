"""歡迎畫面、紙本練習卷、每日暖身"""
import pathlib, time, json
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:5181/"
OUT = pathlib.Path(__file__).parent / "shots"
errors, notes = [], []
with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge")
    for name, vp, dark in [("ipad", {"width": 820, "height": 1180}, False), ("phone-dark", {"width": 390, "height": 844}, True)]:
        ctx = b.new_context(viewport=vp, has_touch=True, color_scheme="dark" if dark else "light")
        pg = ctx.new_page()
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
        pg.goto(URL)
        pg.wait_for_selector(".role-pick")
        time.sleep(0.6)
        pg.screenshot(path=str(OUT / f"70-welcome-{name}.png"))
        pg.click('[data-role="student"]')
        time.sleep(0.5)
        notes.append((name, "welcome closed", pg.locator(".sheet-wrap").count() == 0))
        pg.reload()
        pg.wait_for_selector(".home")
        time.sleep(0.4)
        notes.append((name, "welcome not again", pg.locator(".welcome").count() == 0))
        pg.goto(URL + "#/print/L1")
        pg.wait_for_selector(".paper")
        time.sleep(0.4)
        pg.screenshot(path=str(OUT / f"71-print-L1-{name}.png"), full_page=False)
        notes.append((name, "L1 items", pg.locator(".p-q").count(), "keys", pg.locator(".p-key li").count()))
        pg.goto(URL + "#/print/L2")
        pg.wait_for_selector(".paper")
        notes.append((name, "L2 items", pg.locator(".p-q").count()))
        ctx.close()
    # 每日暖身：把作答時間往前移一天，暖身任務應該出現
    ctx = b.new_context(viewport={"width": 820, "height": 1180})
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
    pg.goto(URL)
    now = int(time.time() * 1000)
    ids = ["s2-03", "s2-05", "u1a-01", "u1a-02", "u2c-08", "u2b-02"]
    data = {"seen": {"intro": 1}, "attempts": [{"q": q, "m": q.split("-")[0], "r": "ok", "t": [], "a": "", "h": 0, "c": 0, "x": "p", "ts": now - 86400000 - i * 1000, "d": "x"} for i, q in enumerate(ids)]}
    pg.evaluate("(d) => localStorage.setItem('g7review:v1', JSON.stringify(d))", data)
    pg.reload()
    pg.wait_for_selector(".plan-card")
    time.sleep(0.5)
    notes.append(("plan", pg.locator(".plan-card").inner_text()[:120]))
    notes.append(("warm task", pg.locator("[data-warm]").count()))
    pg.click("[data-warm]")
    pg.wait_for_selector(".qcard")
    notes.append(("warm run", pg.locator(".run-title").inner_text(), pg.locator(".run-count").inner_text()))
    # 印錯題卷（沒有錯題）
    pg.goto(URL + "#/print/book")
    pg.wait_for_selector(".paper-page")
    notes.append(("book print", pg.locator(".lg-sub").inner_text()))
    # 列印預覽（print media）截圖
    pg.goto(URL + "#/print/L2")
    pg.wait_for_selector(".paper")
    pg.emulate_media(media="print")
    time.sleep(0.3)
    pg.screenshot(path=str(OUT / "72-print-media.png"), full_page=True)
    b.close()
for n in notes:
    print("NOTE", n)
print("ERRORS", errors)
