"""重點總整理的列印／PDF：
非 iOS：按「列印」直接 window.print；iOS：按「PDF」→ 選一份 → 用系統分享（Web Share 傳檔案）給 Goodnotes；不能分享檔案就在新分頁打開 PDF
（10/9 老師：iPad 列印按不動、分享面板沒有列印、Open in Goodnotes 只抓到 Starter 還被紙張切開）"""
from playwright.sync_api import sync_playwright
from synchelp import *

STUB = SEED + "window.__printed = 0; window.print = () => { window.__printed++ }; window.__opened = []; window.open = (u) => { window.__opened.push(u); return {} };"
IOS = STUB + "Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Safari/604.1' });"
SHARE = IOS + "window.__shared = []; Object.defineProperty(navigator, 'canShare', { value: () => true }); Object.defineProperty(navigator, 'share', { value: async (d) => { window.__shared.push({ title: d.title, files: d.files.map((f) => [f.name, f.type, f.size]) }) } });"
NOSHARE = IOS + "Object.defineProperty(navigator, 'canShare', { value: () => false });"
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
    # iPad：PDF → 這一課／第一次段考範圍 → 分享檔案
    pg = page(b, 820, 1180, "ipad", seed=SHARE)
    pg.goto(URL + "#/notes")
    pg.wait_for_selector(".notes-page [data-print]")
    check("PDF" in txt(pg, ".notes-page [data-print]"), "iPad: the header button says PDF")
    pg.locator('.notes-units button[data-u="Unit 1"]').click()
    pg.click(".notes-page [data-print]")
    pg.wait_for_selector(".sheet [data-pdf]")
    rows = pg.locator(".sheet [data-pdf]").all_inner_texts()
    check(len(rows) == 2 and "這一課：Unit 1" in rows[0] and "第一次段考範圍" in rows[1], f"iPad: offers this unit and the exam range ({rows})")
    pg.screenshot(path=str(OUT / "np-ipad.png"))
    pg.click('.sheet [data-pdf="0"]')
    check(wait_until(lambda: len(pg.evaluate("window.__shared")) == 1), "tapping a row shares the PDF file")
    shared = pg.evaluate("window.__shared")
    f = shared[0]["files"][0] if shared and shared[0]["files"] else None
    check(f is not None and f[0] == "重點總整理 Unit 1.pdf" and f[1] == "application/pdf" and f[2] > 10000, f"shares the unit's PDF ({f})")
    check(pg.evaluate("window.__printed") == 0, "no window.print on iPad")
    pg.click('.sheet [data-pdf="1"]')
    check(wait_until(lambda: len(pg.evaluate("window.__shared")) == 2) and pg.evaluate("window.__shared")[1]["files"][0][0] == "重點總整理 第一次段考.pdf", "exam-range PDF shares too")
    # 改用列印
    pg.click(".sheet [data-doprint]")
    check(wait_until(lambda: pg.evaluate("window.__printed") == 1), "改用列印 still calls window.print")
    # 不能分享檔案的裝置：在新分頁打開 PDF
    pg2 = page(b, 820, 1180, "noshare", seed=NOSHARE)
    pg2.goto(URL + "#/notes")
    pg2.wait_for_selector(".notes-page [data-print]")
    pg2.click(".notes-page [data-print]")
    pg2.wait_for_selector(".sheet [data-pdf]")
    pg2.click('.sheet [data-pdf="0"]')
    check(wait_until(lambda: len(pg2.evaluate("window.__opened")) == 1) and pg2.evaluate("window.__opened")[0].endswith("/pdf/notes-starter.pdf"), f"no file sharing: opens the PDF in a new tab ({pg2.evaluate('window.__opened')})")
    # PDF 檔都在（每一課、每次段考、全部）
    missing = pg2.evaluate("(async () => { const A = window.__app; const files = [...A.UNITS.map((u) => `notes-${A.pdfSlug(u)}.pdf`), ...A.EXAMS.filter((e) => !e.kind).map((e) => `notes-${e.id}.pdf`), 'notes-all.pdf']; const out = []; for (const f of files) { const r = await fetch('pdf/' + f, { method: 'HEAD' }); if (!r.ok) out.push(f) } return out })()")
    check(missing == [], f"every PDF exists (missing: {missing})")
    # 列印頁本身（全部的課攤開，做 PDF 用）
    pg3 = page(b, 820, 1180, "printpage", seed=STUB)
    pg3.goto(URL + "#/print/notes")
    pg3.wait_for_selector(".notes-print")
    n = pg3.locator(".notes-print .notes-mod").count()
    check(n >= 3 and pg3.locator(".notes-print .notes-mod.hide").count() == 0, f"print page shows every unit ({n} modules)")
    b.close()
report()
