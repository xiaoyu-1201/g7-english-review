"""重點總整理的「列印」：手機、平板都按得到；iOS 先開說明（列印／Safari 分享→選項→PDF 存進 Goodnotes；主畫面 App 要先用 Safari 開）
（10/9 老師：iPad 列印沒辦法按、分享面板沒有列印、要匯出 PDF 到 Goodnotes）"""
from playwright.sync_api import sync_playwright
from synchelp import *

STUB = SEED + "window.__printed = 0; window.print = () => { window.__printed++ }; window.__opened = []; window.open = (u) => { window.__opened.push(u); return {} };"
IOS = STUB + "Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Safari/604.1' });"
IOS_APP = IOS + "Object.defineProperty(navigator, 'standalone', { get: () => true });"
with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge")
    # 不是 iOS：直接列印
    for w, h, name in [(390, 844, "phone"), (820, 1180, "tablet")]:
        pg = page(b, w, h, name, seed=STUB)
        pg.goto(URL + "#/notes")
        pg.wait_for_selector(".notes-page [data-print]")
        top = pg.evaluate("(() => { const b = document.querySelector('.notes-page [data-print]'); const r = b.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), hit: b.contains(el), on: el ? (el.className || el.tagName) : null } })()")
        check(top["w"] > 0 and top["hit"], f"{name}: print button is visible and on top ({top})")
        pg.click(".notes-page [data-print]")
        check(pg.evaluate("window.__printed") == 1, f"{name}: tapping 列印 calls window.print")
        check(pg.evaluate("[...document.querySelectorAll('.notes-page details')].every((d) => d.open)"), f"{name}: all sections open before printing")
        pg.screenshot(path=str(OUT / f"np-{name}.png"))
    # iPad Safari：先開說明 → 打開列印頁（全部的課）→ 列印
    pg = page(b, 820, 1180, "ipad", seed=IOS)
    pg.goto(URL + "#/notes")
    pg.wait_for_selector(".notes-page [data-print]")
    pg.click(".notes-page [data-print]")
    pg.wait_for_selector(".sheet [data-goprint]")
    check(pg.evaluate("window.__printed") == 0 and "PDF" in txt(pg, ".sheet") and "Goodnotes" in txt(pg, ".sheet"), "iPad Safari: explains PDF export via Share → Options → PDF → Goodnotes")
    pg.screenshot(path=str(OUT / "np-ipad.png"))
    pg.click(".sheet [data-goprint]")
    pg.wait_for_selector(".notes-print [data-print]")
    check(pg.evaluate("location.hash").startswith("#/print/notes/"), f"opens the print page with every unit ({pg.evaluate('location.hash')[:40]})")
    n = pg.locator(".notes-print .notes-mod").count()
    check(n >= 3 and pg.locator(".notes-print .notes-mod.hide").count() == 0, f"print page shows every unit ({n} modules)")
    pg.click(".notes-print [data-print]")
    pg.wait_for_selector(".sheet [data-doprint]")
    check(pg.locator(".sheet [data-goprint]").count() == 0 and "全部的課" in txt(pg, ".sheet"), "on the print page the sheet only offers 列印")
    pg.click(".sheet [data-doprint]")
    check(pg.evaluate("window.__printed") == 1, "列印 on the print page calls window.print")
    pg.screenshot(path=str(OUT / "np-printpage.png"), full_page=True)
    # iOS 主畫面 App：window.print 沒作用 → 教老師用 Safari 開列印頁
    pg = page(b, 390, 844, "standalone", seed=IOS_APP)
    pg.goto(URL + "#/notes")
    pg.wait_for_selector(".notes-page [data-print]")
    pg.click(".notes-page [data-print]")
    pg.wait_for_selector(".sheet [data-open]")
    check(pg.evaluate("window.__printed") == 0 and "Safari" in txt(pg, ".sheet"), "iOS home-screen app: explains to open Safari instead")
    pg.click(".sheet [data-open]")
    opened = pg.evaluate("window.__opened")
    check(len(opened) == 1 and "#/print/notes/" in opened[0], f"opens the print page URL ({opened[0][-50:] if opened else opened})")
    pg.screenshot(path=str(OUT / "np-standalone.png"))
    b.close()
report()
