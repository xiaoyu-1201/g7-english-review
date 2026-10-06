"""結果頁、錯題本：點一題 → 看上次答案 → 再練一次 → 記錄＋列表更新"""
import pathlib, time
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:5181/"
OUT = pathlib.Path(__file__).parent / "shots"
SEED = "if (!localStorage.getItem('g7review:v1')) localStorage.setItem('g7review:v1', JSON.stringify({seen:{intro:1}}))"
errors, notes, fails = [], [], []


def check(c, m):
    (notes if c else fails).append(m)


with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge")
    ctx = b.new_context(viewport={"width": 820, "height": 1180}, has_touch=True)
    ctx.add_init_script(SEED)
    pg = ctx.new_page()
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
    pg.goto(URL)
    pg.wait_for_selector(".home")
    items = pg.evaluate("() => window.__app.MODULES.u2b.items")
    n_att = lambda: pg.evaluate("JSON.parse(localStorage.getItem('g7review:v1')).attempts.length")
    pg.click('[data-mod="u2b"]')
    # 全部答錯（選錯的選項／填錯）
    for it in items:
        pg.wait_for_selector(".qcard")
        card = pg.locator(".qcard").first
        t = it["t"]
        if t == "learn":
            card.locator(f'.opt[data-i="{it["a"]}"]').click()
            pg.click("[data-act=check]")
            continue
        if t == "mcq":
            wrong = 0 if it["a"] != 0 else 1
            card.locator(f'.opt[data-i="{wrong}"]').click()
        elif t == "fill":
            for bi in range(len(it["ans"])):
                card.locator(f'.blank[data-b="{bi}"]').fill("xx")
        elif t == "spot":
            card.locator('.tok[data-i="0"]').click() if it["bad"] != 0 else card.locator('.tok[data-i="1"]').click()
        elif t == "order":
            for c in card.locator(".ord-pool .ord-chip").all():
                pg.locator(".ord-pool .ord-chip").first.click()
        pg.click("[data-act=check]")
        pg.click("[data-act=check]")
    pg.wait_for_selector(".summary")
    before = n_att()
    # 結果頁：點第一題 → 再練一次（答對）
    row = pg.locator("[data-review]").first
    rid = row.get_attribute("data-review")
    row.click()
    pg.wait_for_selector(".sheet [data-retry]")
    time.sleep(0.4)
    pg.screenshot(path=str(OUT / "95-review-sheet.png"))
    pg.click(".sheet [data-retry]")
    pg.wait_for_selector(".sheet .qcard:not(.done)")
    it = next(i for i in items if i["id"] == rid)
    card = pg.locator(".sheet .qcard").first
    if it["t"] == "mcq":
        card.locator(f'.opt[data-i="{it["a"]}"]').click()
    elif it["t"] == "fill":
        for bi, ans in enumerate(it["ans"]):
            card.locator(f'.blank[data-b="{bi}"]').fill(ans[0])
    elif it["t"] == "spot":
        card.locator(f'.tok[data-i="{it["bad"]}"]').click()
        card.locator(".spot-in").fill(it["acc"][0])
    pg.click(".sheet [data-hint]")
    check(pg.locator(".sheet .hint").count() == 1, "hint in sheet")
    pg.click(".sheet [data-check]")
    time.sleep(0.6)
    pg.screenshot(path=str(OUT / "96-review-retry-done.png"))
    check(pg.locator(".sheet .qcard.r-ok").count() == 1, f"retry graded ok ({rid})")
    check(n_att() == before + 1, "retry recorded")
    pg.click(".sheet [data-retry]")  # 再練一次（第二次）
    check(pg.locator(".sheet .qcard:not(.done)").count() == 1, "retry again resets card")
    pg.keyboard.press("Escape")
    time.sleep(0.5)
    check("重練對了" in row.inner_text(), f"summary row updated: {row.inner_text()}")
    # 錯題本：同樣可以再練
    pg.goto(URL + "#/book")
    pg.wait_for_selector("[data-review]")
    nb = pg.locator("[data-review]").count()
    pg.locator("[data-review]").first.click()
    pg.click(".sheet [data-retry]")
    pg.wait_for_selector(".sheet .qcard:not(.done)")
    pg.keyboard.press("Escape")
    time.sleep(0.6)
    check(pg.locator("[data-review]").count() == nb, "book list unchanged when not answered")
    # 切換分頁時 sheet 關閉不會把畫面拉回錯題本
    pg.locator("[data-review]").first.click()
    pg.click(".sheet [data-retry]")
    b2 = pg.locator(".sheet .qcard").first
    b2.locator(".opt").first.click() if b2.locator(".opt").count() else None
    if not pg.locator(".sheet [data-check]").is_disabled():
        pg.click(".sheet [data-check]")
    pg.evaluate("location.hash = '#/stats'")
    time.sleep(0.8)
    check(pg.evaluate("location.hash") == "#/stats" and pg.locator(".bars, .tiles").count() >= 1, "navigation not hijacked")
    b.close()
for n in notes:
    print("OK", n)
print("ERRORS", errors)
print("FAILS", fails)
