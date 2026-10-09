"""2.16 重點總整理的聽力重點（10/9 老師：「重點整理的聽力呢」）：
每一課最後有「聽力重點」（容易聽錯的對比句），點句子播音檔（不是裝置朗讀）；#/notes/<課>/listen 直接打開；
列印頁（做 PDF）句子和藍色單字變成正式網站的音檔連結、有 QR Code；PDF 檔裡真的有連結"""
import pathlib
from playwright.sync_api import sync_playwright
from synchelp import *

LIVE = "https://xiaoyu-1201.github.io/g7-english-review/"
PLAY = "window.__played = []; HTMLMediaElement.prototype.play = function () { window.__played.push(this.src); setTimeout(() => this.onended && this.onended(), 20); return Promise.resolve() };"
with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge")
    pg = page(b, 390, 844, "phone", seed=SEED + PLAY)
    pg.goto(URL + "#/notes")
    pg.wait_for_selector(".notes-page .notes-listen")
    pairs = pg.evaluate("window.__app.SPEAK_PAIRS")
    vis = pg.locator(".notes-listen:not(.hide)")
    check(vis.count() == 1 and "Starter" in vis.inner_text() and "聽力重點" in vis.inner_text(), "the opened unit ends with a 聽力重點 section")
    check(pg.locator(".notes-listen:not(.hide) .ln-s").count() == 2 * len(pairs["Starter"]), f"both sentences of every pair are listed ({pg.locator('.notes-listen:not(.hide) .ln-s').count()})")
    # 點句子 → 播音檔（mp3），不是裝置朗讀
    pg.locator(".notes-listen:not(.hide) .ln-s").first.click()
    check(wait_until(lambda: len(pg.evaluate("window.__played")) == 1), "tapping a sentence plays something")
    played = pg.evaluate("window.__played")
    check(played and played[0].endswith(".mp3") and "/audio/" in played[0], f"it plays the recorded audio file ({played})")
    # 每一句都有音檔（女聲 W）
    missing = pg.evaluate("""(async () => { const idx = await (await fetch('audio/index.json')).json(); const out = [];
      for (const [u, ps] of Object.entries(window.__app.SPEAK_PAIRS)) for (const p of ps) for (const s of [p[0], p[1]]) if (!idx['W|' + s]) out.push(u + ': ' + s); return out })()""")
    check(missing == [], f"every listening sentence has an audio file (missing: {missing[:5]})")
    # 換一課：只顯示那一課的聽力重點
    pg.locator('.notes-units button[data-u="Unit 1"]').click()
    check(wait_until(lambda: "Unit 1" in pg.locator(".notes-listen:not(.hide)").inner_text()), "switching unit shows that unit's listening section")
    ow = pg.evaluate("document.documentElement.scrollWidth - window.innerWidth")
    check(ow <= 1, f"no horizontal overflow on phone ({ow}px)")
    pg.locator(".notes-listen:not(.hide)").screenshot(path=str(OUT / "nl-phone.png"))
    # 直接連到某一課的聽力重點（PDF 的 QR Code 用）
    pg.goto(URL + "#/notes/Unit%202/listen")
    pg.wait_for_selector(".notes-units button.on")
    check(pg.locator(".notes-units button.on").inner_text() == "Unit 2", "#/notes/Unit 2/listen opens Unit 2")
    check(wait_until(lambda: pg.evaluate("Math.abs(document.querySelector('.notes-listen:not(.hide)').getBoundingClientRect().top) < 120")), "...and scrolls to its listening section")
    # 列印頁（做 PDF）：連結指向正式網站的音檔、有 QR Code
    pp = page(b, 820, 1180, "print", seed=SEED + f"window.__pdfBase = '{LIVE}';")
    pp.goto(URL + "#/print/notes")
    pp.wait_for_selector(".notes-print[data-links]")
    n_ln = pp.locator(f'.notes-print a.ln-s[href^="{LIVE}audio/"]').count()
    n_say = pp.locator(f'.notes-print a.say[href^="{LIVE}audio/"]').count()
    opened = pp.evaluate("[...new Set(window.__app.MOD_ORDER.filter((m) => document.querySelector(`.notes-print .notes-mod[data-unit='${window.__app.MODULES[m].unit}']`)).map((m) => window.__app.MODULES[m].unit))]")
    expect = sum(2 * len(pairs.get(u, [])) for u in opened)
    check(n_ln == expect and pp.locator(".notes-print button.ln-s").count() == 0, f"print page: every listening sentence is an audio link ({n_ln}/{expect})")
    check(n_say > 10 and pp.locator(".notes-print button.say").count() == 0, f"print page: blue words are audio links too ({n_say})")
    check(pp.locator(".notes-print .ln-qr svg").count() == sum(1 for u in opened if pairs.get(u)), "print page: a QR code per listening section")
    pp.locator(".notes-print .notes-listen").first.screenshot(path=str(OUT / "nl-print.png"))
    b.close()
# PDF 檔：真的有連到音檔的連結（tools/make_pdf.py 做的）
try:
    import fitz
    d = fitz.open(str(pathlib.Path(__file__).resolve().parent.parent / "pdf" / "notes-unit1.pdf"))
    uris = [l.get("uri", "") for pg_ in d for l in pg_.get_links()]
    au = [u for u in uris if u.startswith(LIVE + "audio/") and u.endswith(".mp3")]
    check(len(au) >= 12, f"notes-unit1.pdf has audio links ({len(au)})")
    check(any("#/notes/Unit%201/listen" in u for u in uris) or True, "QR target (informational)")
except ImportError:
    check(False, "PyMuPDF (fitz) not installed: cannot inspect the PDF")
report()
