"""自動作答所有題目（全部答對）＋批改器反例＋截圖"""
import json, pathlib, sys, time
from playwright.sync_api import sync_playwright
SEED = "if (!localStorage.getItem('g7review:v1')) localStorage.setItem('g7review:v1', JSON.stringify({seen:{intro:1}}))"

URL = "http://127.0.0.1:5181/"
SCR = pathlib.Path(__file__).parent
OUT = SCR / "shots"
OUT.mkdir(exist_ok=True)
only = sys.argv[1:]  # 可指定模組
errors, fails = [], []

CLICK_TEXT = """([sel, w]) => { const b = [...document.querySelectorAll(sel)].find(x => x.textContent.trim() === w); if (!b) return false; b.click(); return true }"""


def answer(pg, it):
    t = it["t"]
    card = pg.locator(".qcard").first
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
    elif t == "order":
        for w in it["words"]:
            if not pg.evaluate(CLICK_TEXT, [".ord-pool .ord-chip", w]):
                fails.append((it["id"], f"order chip not found: {w}"))
    elif t == "spot":
        card.locator(f'.tok[data-i="{it["bad"]}"]').click()
        card.locator(".spot-in").fill(it["acc"][0])
    elif t == "sort":
        for i, (text, b) in enumerate(it["chips"]):
            card.locator(f'.sort-pool .sort-chip[data-c="{i}"]').click()
            card.locator(f'.bin[data-bin="{b}"]').click()
    elif t == "place":
        card.locator(f'[data-spot="{it["a"]}"]').click()


with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge")
    ctx = b.new_context(viewport={"width": 820, "height": 1180}, device_scale_factor=1, has_touch=True)
    ctx.add_init_script(SEED)
    pg = ctx.new_page()
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
    pg.goto(URL)
    pg.evaluate("localStorage.clear()")
    pg.goto(URL)
    pg.wait_for_selector(".home")
    pg.screenshot(path=str(OUT / "01-home-empty.png"), full_page=True)
    mods = pg.evaluate("() => Object.fromEntries(Object.entries(window.__app.MODULES).map(([k,m]) => [k, m.items]))")
    order = [m for m in mods if not only or m in only]
    shot_types = {}
    for mid in order:
        pg.goto(URL + "#/")
        pg.wait_for_selector(".home")
        pg.click(f'[data-mod="{mid}"]')
        for it in mods[mid]:
            pg.wait_for_selector(".qcard")
            cur = pg.locator(".qcard").first.get_attribute("data-id")
            if cur != it["id"]:
                fails.append((it["id"], f"expected card, got {cur}"))
                break
            answer(pg, it)
            btn = pg.locator("[data-act=check]")
            if btn.is_disabled():
                fails.append((it["id"], "check button still disabled"))
                break
            key = it["t"] + ("-fig" if it.get("fig") else "") + ("-audio" if it.get("audio") else "") + ("-passage" if it.get("passage") else "")
            if key not in shot_types:
                shot_types[key] = it["id"]; time.sleep(0.6)
                pg.screenshot(path=str(OUT / f"q-{key}-before.png"))
            btn.click()
            if it["t"] != "learn":
                cls = pg.locator(".qcard").first.get_attribute("class")
                if "r-ok" not in cls:
                    fb = pg.locator(".q-feedback").first.inner_text()
                    fails.append((it["id"], fb.replace("\n", " | ")[:300]))
                if shot_types.get(key) == it["id"]:
                    time.sleep(0.7)
                    pg.screenshot(path=str(OUT / f"q-{key}-after.png"), full_page=True)
                pg.locator("[data-act=check]").click()
        try:
            pg.wait_for_selector(".summary", timeout=5000)
            pct = pg.locator(".sum-pct b").inner_text()
            if pct != "100":
                fails.append((mid, f"summary {pct}%"))
        except Exception:
            fails.append((mid, "no summary"))
            pg.screenshot(path=str(OUT / f"fail-{mid}.png"), full_page=True)
            print("FAILS so far", fails, errors)
    pg.screenshot(path=str(OUT / "02-summary.png"), full_page=True)

    # 批改器反例
    cases = [
        ["my name is Jamie.", ["My name is Jamie."]],
        ["Is she your cousin.", ["Is she your cousin?"]],
        ["Is she your cousin ?", ["Is she your cousin?"]],
        ["Hi,I'm Zac.", ["Hi, I'm Zac."]],
        ["Good morning Mrs. Hugo.", ["Good morning, Mrs. Hugo."]],
        ["fifty five", ["fifty-five"]],
        ["These is umbrellas.", ["These are umbrellas."]],
        ["These are umbrella.", ["These are umbrellas."]],
        ["He is a old singer.", ["He is an old singer."]],
        ["Its my cat.", ["It's my cat."]],
        ["It's name is Lucky.", ["Its name is Lucky."]],
        ["Where are my parents?", ["Where are your parents?"]],
        ["Max is not a studant.", ["Max is not a student."]],
        ["Is Sophie nurse?", ["Is Sophie a nurse?"]],
        ["Is a Sophie nurse?", ["Is Sophie a nurse?"]],
        ["Those are pencil boxs.", ["Those are pencil boxes."]],
        ["No, I'm not", ["No, I'm not.", "No, I am not."]],
        ["no, i'm not.", ["No, I'm not.", "No, I am not."]],
        ["Im thirteen.", ["I'm thirteen."]],
    ]
    res = pg.evaluate("(cs) => cs.map(([g,a]) => { const r = window.__app.checkText(g, a, {}); return [g, r.r, r.tags.join(','), r.msgs.join(' / ')] })", cases)
    for r in res:
        print("CHK", r)

    # 其他頁面截圖
    def shot(hash_, name, wait, full=True):
        pg.goto(URL + hash_)
        pg.wait_for_selector(wait)
        time.sleep(0.4)
        pg.screenshot(path=str(OUT / name), full_page=full)

    shot("#/", "03-home-progress.png", ".home")
    shot("#/book", "04-book.png", ".page")
    shot("#/stats", "05-stats.png", ".page")
    shot("#/settings", "06-settings.png", ".page")
    shot("#/notes", "07-notes.png", ".notes-page", full=False)
    shot("#/flash", "08-flash-intro.png", ".flash-intro")
    pg.click("[data-act=go]")
    pg.wait_for_selector(".flash-opt")
    pg.screenshot(path=str(OUT / "09-flash.png"))
    pg.click("[data-act=quit]")
    shot("#/exam", "10-exam-intro.png", ".exam-intro")
    pg.click("[data-act=start]")
    pg.wait_for_selector(".exam-paper .qcard")
    pg.screenshot(path=str(OUT / "11-exam.png"))
    pg.click("[data-act=submit]")
    pg.wait_for_selector(".sheet .chk")
    time.sleep(0.4)
    pg.screenshot(path=str(OUT / "12-exam-submit.png"))
    for c in pg.locator(".sheet .chk").all():
        c.click()
    pg.click(".sheet [data-go]")
    pg.wait_for_selector(".exam-result")
    pg.screenshot(path=str(OUT / "13-exam-result.png"))
    # 檢討：答錯的題目可以馬上再試一次
    if pg.locator(".retry-btn").count() < 1:
        fails.append(("exam", "no 再試一次 on wrong answers"))
    else:
        pg.locator(".retry-btn").first.click()
        pg.wait_for_selector(".sheet .qcard")
        if "再試一次" not in pg.locator(".sheet-title").inner_text():
            fails.append(("exam", "retry sheet title"))
        pg.keyboard.press("Escape")
        time.sleep(0.5)
    pg.goto(URL + "#/")
    pg.wait_for_selector(".home")
    pg.click("[data-plan=L1]")
    time.sleep(0.5)
    pg.screenshot(path=str(OUT / "14-plan-sheet.png"))
    pg.keyboard.press("Escape")
    time.sleep(0.4)
    if pg.locator(".sheet-wrap").count():
        fails.append(("sheet", "Esc did not close sheet"))

    # 其他尺寸、深色
    for name, vp, dark in [("phone", {"width": 390, "height": 844}, False), ("ipad-land", {"width": 1180, "height": 820}, False), ("dark", {"width": 820, "height": 1180}, True)]:
        c2 = b.new_context(viewport=vp, device_scale_factor=1, has_touch=True, color_scheme="dark" if dark else "light")
        c2.add_init_script(SEED)
        p2 = c2.new_page()
        p2.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
        p2.goto(URL)
        p2.wait_for_selector(".home")
        p2.screenshot(path=str(OUT / f"20-{name}-home.png"), full_page=True)
        for mid, n in [("u1c", 3), ("u2e", 2), ("s1", 0)]:
            p2.goto(URL + "#/")
            p2.wait_for_selector(".home")
            p2.click(f'[data-mod="{mid}"]')
            p2.wait_for_selector(".qcard")
            for k in range(n):
                it = mods[mid][k]
                answer(p2, it)
                p2.click("[data-act=check]")
                if it["t"] != "learn":
                    p2.click("[data-act=check]")
                p2.wait_for_selector(".qcard")
            p2.screenshot(path=str(OUT / f"21-{name}-{mid}.png"), full_page=True)
        # 水平捲動檢查
        ow = p2.evaluate("() => document.documentElement.scrollWidth - window.innerWidth")
        if ow > 1:
            fails.append((name, f"horizontal overflow {ow}px"))
        c2.close()
    b.close()

print("ERRORS", len(errors))
for e in errors[:20]:
    print("  ", e)
print("FAILS", len(fails))
for f in fails[:60]:
    print("  ", f)
