"""答錯流程、提示、有點猜、錯題本、特訓、匯出入、報告"""
import pathlib, time, json
from playwright.sync_api import sync_playwright
SEED = "if (!localStorage.getItem('g7review:v1')) localStorage.setItem('g7review:v1', JSON.stringify({seen:{intro:1}}))"

URL = "http://127.0.0.1:5181/"
SCR = pathlib.Path(__file__).parent
OUT = SCR / "shots"
errors, notes = [], []

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge")
    ctx = b.new_context(viewport={"width": 820, "height": 1180}, has_touch=True, accept_downloads=True)
    ctx.add_init_script("delete Navigator.prototype.share; delete Navigator.prototype.canShare;")
    ctx.add_init_script(SEED)
    pg = ctx.new_page()
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
    pg.goto(URL)
    pg.evaluate("localStorage.clear()")
    pg.goto(URL)
    pg.wait_for_selector(".home")
    # 設定名字
    pg.goto(URL + "#/settings")
    pg.fill("#f-name", "Amy")
    pg.click('[data-seg="role"] button[data-v="teacher"]')
    pg.fill("#f-exam", "2026-10-15")
    pg.goto(URL + "#/")
    pg.wait_for_selector(".home")
    time.sleep(0.8)
    pg.screenshot(path=str(OUT / "30-home-named.png"))

    pg.click('[data-mod="s2"]')
    pg.wait_for_selector(".t-learn")
    pg.click('.opt[data-i="1"]')  # 觀念卡答錯
    time.sleep(0.5)
    pg.screenshot(path=str(OUT / "31-learn-wrong.png"), full_page=True)
    pg.click("[data-act=check]")
    pg.wait_for_selector(".t-learn")
    pg.click('.opt[data-i="2"]')
    pg.click("[data-act=check]")
    # s2-01 選錯 + 提示 + 有點猜
    pg.wait_for_selector(".t-mcq")
    pg.click("[data-act=hint]")
    pg.click("[data-act=hint]")
    pg.click('.opt[data-i="2"]')
    pg.click("[data-act=check]")
    time.sleep(0.6)
    pg.screenshot(path=str(OUT / "32-mcq-wrong.png"), full_page=True)
    notes.append(("mcq wrong fb", pg.locator(".q-feedback").inner_text()[:200]))
    pg.click("[data-act=check]")
    # s2-02 填 it's
    pg.wait_for_selector(".t-fill")
    pg.click("[data-act=guess]")
    pg.fill(".blank", "it's")
    pg.click("[data-act=check]")
    time.sleep(0.6)
    pg.screenshot(path=str(OUT / "33-fill-wrong.png"), full_page=True)
    notes.append(("fill wrong fb", pg.locator(".q-feedback").inner_text()[:200]))
    pg.click("[data-act=check]")
    # s2-03 答對、s2-04 選 are（錯）
    pg.click('.opt[data-i="2"]'); pg.click("[data-act=check]"); pg.click("[data-act=check]")
    pg.click('.opt[data-i="2"]'); pg.click("[data-act=check]"); pg.click("[data-act=check]")
    # 離開，回首頁 → 有「繼續上次」
    pg.click("[data-act=close]")
    pg.wait_for_selector(".home")
    notes.append(("resume", pg.locator(".resume").inner_text()))
    # 寫句題答錯（格式）
    pg.click('[data-mod="u1b"]')
    for _ in range(2):
        pg.wait_for_selector(".t-learn")
        pg.click('.opt[data-i="0"]')
        pg.click("[data-act=check]")
    pg.wait_for_selector(".t-write")
    pg.fill(".write-in", "max isn't a student")
    pg.click("[data-act=check]")
    time.sleep(0.6)
    pg.screenshot(path=str(OUT / "34-write-care.png"), full_page=True)
    notes.append(("write care", pg.locator(".q-feedback").inner_text()[:240]))
    pg.click("[data-act=check]")
    pg.fill(".write-in", "Is Sophie nurse?")
    pg.click("[data-act=check]")
    time.sleep(0.6)
    pg.screenshot(path=str(OUT / "35-write-bad.png"), full_page=True)
    pg.click("[data-act=check]")
    pg.click("[data-act=close]")

    # 錯題本
    pg.goto(URL + "#/book")
    pg.wait_for_selector(".page")
    time.sleep(0.4)
    pg.screenshot(path=str(OUT / "36-book.png"), full_page=True)
    pg.click(".book-cta [data-act=all]")
    pg.wait_for_selector(".qcard")
    notes.append(("book run title", pg.locator(".run-title").inner_text()))
    pg.click("[data-act=close]")
    # 題目回顧 sheet
    pg.goto(URL + "#/book")
    pg.wait_for_selector("[data-review]")
    pg.locator("[data-review]").first.click()
    time.sleep(0.5)
    pg.screenshot(path=str(OUT / "37-review-sheet.png"))
    pg.mouse.click(10, 10)  # 點外面關閉
    time.sleep(0.4)
    notes.append(("sheet closed by outside tap", pg.locator(".sheet-wrap").count() == 0))

    # 紀錄 → 特訓
    pg.goto(URL + "#/stats")
    pg.wait_for_selector(".bars")
    time.sleep(0.4)
    pg.screenshot(path=str(OUT / "38-stats-radar.png"), full_page=True)
    pg.locator("[data-drill]").first.click()
    pg.wait_for_selector(".qcard")
    notes.append(("drill", pg.locator(".run-title").inner_text()))
    pg.click("[data-act=close]")

    # 匯出
    pg.goto(URL + "#/stats")
    pg.wait_for_selector(".bars")
    with pg.expect_download() as d:
        pg.click('[data-x="export"]')
    path = SCR / "export.json"
    d.value.save_as(str(path))
    data = json.loads(path.read_text(encoding="utf-8"))
    notes.append(("export", d.value.suggested_filename, len(data["attempts"])))
    # 換一個「學生」裝置匯入
    ctx2 = b.new_context(viewport={"width": 390, "height": 844}, has_touch=True)
    ctx2.add_init_script(SEED)
    p2 = ctx2.new_page()
    p2.on("pageerror", lambda e: errors.append("p2 pageerror: " + str(e)))
    p2.goto(URL)
    p2.wait_for_selector(".home")
    p2.click('[data-mod="s1"]')
    p2.wait_for_selector(".t-learn")
    p2.click('.opt[data-i="0"]')
    p2.click("[data-act=check]")
    p2.wait_for_selector(".t-multi")
    p2.click('.opt[data-i="0"]')
    p2.click("[data-act=check]")
    p2.goto(URL + "#/stats")
    p2.wait_for_selector(".file-in", state="attached")
    p2.set_input_files(".file-in", str(path))
    time.sleep(0.6)
    notes.append(("import toast", p2.locator("#toast").inner_text()))
    p2.set_input_files(".file-in", str(path))
    time.sleep(0.6)
    notes.append(("import again toast", p2.locator("#toast").inner_text()))
    p2.wait_for_selector(".seg")
    p2.screenshot(path=str(OUT / "39-phone-stats-merged.png"), full_page=True)
    # 報告（沒有 share、clipboard 可能失敗 → sheet）
    p2.click('[data-x="report"]')
    time.sleep(0.6)
    if p2.locator(".report-ta").count():
        notes.append(("report", p2.locator(".report-ta").input_value()[:400]))
    else:
        notes.append(("report toast", p2.locator("#toast").inner_text()))
    ctx2.close()
    b.close()

for n in notes:
    print("NOTE", n)
print("ERRORS", errors)
