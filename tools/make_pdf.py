"""重點總整理 → PDF 檔（給 iPad 分享到 Goodnotes、儲存到檔案用）
10/9 老師：iPad 不能列印、Safari 的「Open in Goodnotes」只抓到 Starter 還被紙張切開 → 事先做好 PDF 放在網站的 pdf/ 資料夾。
產生：pdf/notes-<課>.pdf（每一課一份）、pdf/notes-e1.pdf…（每次段考範圍一份）、pdf/notes-all.pdf（全部）。
改了觀念卡（learn）或重點總整理的排版之後要重跑，然後一起 commit。
用法（在 App 資料夾）：python tools\\make_pdf.py
"""
import pathlib, subprocess, sys, time
from playwright.sync_api import sync_playwright

APP = pathlib.Path(__file__).resolve().parent.parent
OUT = APP / "pdf"
PORT = 5187
URL = f"http://127.0.0.1:{PORT}/"
# 聽力重點的句子、藍色單字在 PDF 裡是音檔連結、QR Code 打開網頁版：都要指向正式網站（不是本機）
LIVE = "https://xiaoyu-1201.github.io/g7-english-review/"
SEED = "localStorage.setItem('g7review:v1', JSON.stringify({seen:{intro:1}})); window.__pdfBase = '" + LIVE + "';"
# PDF 裡不要頁首、分頁列、課名列
HIDE = ".lg-head, .tabbar, .notes-units { display: none !important } .page { padding-top: 0 }"

OUT.mkdir(exist_ok=True)
web = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1"], cwd=APP, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(channel="msedge")
        c = b.new_context(viewport={"width": 820, "height": 1180})
        c.add_init_script(SEED)
        pg = c.new_page()
        pg.goto(URL + "#/notes")
        pg.wait_for_selector(".notes-page")
        order = pg.evaluate("window.__app.MOD_ORDER")
        unit_of = pg.evaluate("Object.fromEntries(Object.entries(window.__app.MODULES).map(([k, m]) => [k, m.unit]))")
        units = pg.evaluate("window.__app.UNITS")
        exams = pg.evaluate("window.__app.EXAMS.filter((e) => !e.kind).map((e) => ({ id: e.id, title: e.title, units: e.units }))")
        slugs = pg.evaluate("Object.fromEntries(window.__app.UNITS.map((u) => [u, window.__app.pdfSlug(u)]))")
        n = 0

        def make(name, us):
            global n
            n += 1
            ids = [m for m in order if unit_of[m] in us]
            pg.goto(URL + f"?pdf={n}#/print/notes/" + ",".join(ids))  # 換 query 讓每一份都重新載入
            pg.wait_for_selector(".notes-print .notes-mod")
            pg.wait_for_selector(".notes-print[data-links]")  # 音檔連結、QR Code 都換好了
            pg.add_style_tag(content=HIDE)
            pg.evaluate("document.fonts.ready")
            pg.wait_for_timeout(400)
            path = OUT / name
            pg.pdf(path=str(path), format="A4", print_background=True, margin={"top": "12mm", "bottom": "12mm", "left": "11mm", "right": "11mm"})
            print(f"{name}: {len(ids)} 個單元, {path.stat().st_size // 1024} KB", flush=True)

        for u in units:
            make(f"notes-{slugs[u]}.pdf", [u])
        for e in exams:
            make(f"notes-{e['id']}.pdf", e["units"])
        make("notes-all.pdf", units)
        b.close()
finally:
    web.terminate()
