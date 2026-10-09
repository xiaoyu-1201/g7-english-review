"""2.21 錯題統整：錯的題目對到重點總整理的那一行
① 每一筆對應都畫得出那一行（focus.js 的 SPOTS 和觀念卡的行數一致）
② 結果頁「這次要注意的」：依重點卡分組、畫線的那一行、錯在哪裡；看重點（捲到那張卡）、練這幾題
③ 重點總整理：錯題本裡的題目對到的行畫螢光筆；「我要注意的」只列有畫線的卡
④ 老師學生頁、家長學習進度：要注意的重點＋看畫線的重點＋存成 PDF（cdnjs 的 html2canvas、jsPDF）"""
import json
import time
from playwright.sync_api import sync_playwright
from synchelp import *

WRONG = ["u2b-03", "u2b-07", "u2b-08", "u2c-02", "u3a-07"]  # u3a-07 第二次段考（沒開放，不算）


def seed_wrong(pg):
    """在學生的裝置塞紀錄：u2b 做完一次，錯 3 題；u2c 錯 1 題"""
    pg.evaluate(
        """(wrong) => {
        const A = window.__app
        const S = A.S // 記憶體裡的那一份（App 離開頁面時會存回去，直接改 localStorage 會被蓋掉）
        const now = Date.now()
        const ids = A.MODULES.u2b.items.map((i) => i.id)
        const res = {}
        S.attempts ||= []
        for (const it of A.MODULES.u2b.scored) {
          const r = wrong.includes(it.id) ? 'bad' : 'ok'
          res[it.id] = r
          S.attempts.push({ q: it.id, m: 'u2b', r, t: [], a: 'x', h: 0, c: 0, ts: now - 60000, d: S.profile.id })
        }
        S.attempts.push({ q: 'u2c-02', m: 'u2c', r: 'bad', t: [], a: 'x', h: 0, c: 0, ts: now - 30000, d: S.profile.id })
        S.progress = { 'm:u2b': { ids, i: ids.length, res, t0: now - 120000, title: A.MODULES.u2b.title, mid: 'u2b' } }
        localStorage.setItem('g7review:v1', JSON.stringify(S))
      }""",
        WRONG,
    )


with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge")
    A = page(b, 390, 844, "A")
    A.goto(URL)
    A.wait_for_selector(".home")
    # ① 對應檢查
    bad = A.evaluate(
        """() => {
        const A = window.__app, all = new Set(A.UNITS), out = []
        for (const id of Object.keys(A.SPOTS)) {
          const sps = A.spotsOf(id, all)
          if (!sps.length) out.push('沒有對應 ' + id)
          for (const s of sps) if (s.line && !A.lineText(s.card, s.line)) out.push('空的行 ' + id + ' ' + s.line)
        }
        return out
      }"""
    )
    check(not bad, f"every SPOTS entry resolves to a non-empty line: {bad[:5]}")
    # ② 結果頁
    seed_wrong(A)
    A.goto(URL + "#/run/" + "m%3Au2b")
    A.reload()
    A.wait_for_selector(".summary .fx-group")
    cards = A.locator(".summary .fx-card").count()
    check(cards >= 2, f"result page groups mistakes by concept card: {cards}")
    first = txt(A, ".summary .fx-card")
    check("近遠" in first and "this、that ＋ is" in first, f"biggest group = 近遠 × 單複數 with its rule line highlighted: {first[:80]}")
    check("錯 2 題" in first and "these ＋ are" in first, "count and 考點 shown")
    check("Unit 3" not in txt(A, ".summary .fx-group"), "unopened units are not mentioned")
    A.screenshot(path=str(OUT / "focus-1-summary.png"), full_page=True)
    A.click(".summary .fx-card [data-fxnote]")
    A.wait_for_selector(".sheet .note.marked")
    check(A.locator(".sheet .note-rule.hl").count() >= 1, "看重點: the sheet shows the module's notes with the rule highlighted")
    check(wait_until(lambda: A.locator(".sheet .note.flash").count() == 1, 3), "看重點: scrolls to and flashes the card")
    check("練這" in txt(A, ".sheet .note.marked .fx-mine"), "marked card lists 考點 and a practice button")
    A.keyboard.press("Escape")
    time.sleep(0.4)
    check(A.locator(".summary .fx-card [data-fxrun]").count() == 0, "result page: one practice button only (重練這幾題), not one per card")
    # ③ 重點總整理
    A.goto(URL + "#/notes/Unit 2")
    A.wait_for_selector(".notes-page .notes-mode")
    check(A.locator('.notes-mod[data-mid="u2b"] .note.marked').count() >= 1, "notes page marks the u2b cards")
    check(A.locator('.notes-mod[data-mid="u2b"] .hl').count() >= 2, "the exact lines are highlighted")
    check("3" in txt(A, ".notes-mode .nm-n") or "4" in txt(A, ".notes-mode .nm-n"), f"我要注意的 shows the count: {txt(A, '.notes-mode .nm-n')}")
    A.screenshot(path=str(OUT / "focus-2-notes.png"), full_page=False)
    A.click('[data-nm="mine"]')
    A.wait_for_selector(".notes-page.focus-only")
    vis = A.evaluate("[...document.querySelectorAll('.notes-page .note')].filter((n) => getComputedStyle(n).display !== 'none').length")
    marked = A.locator(".notes-page .note.marked").count()
    check(vis == marked and vis >= 2, f"我要注意的 shows only the marked cards: {vis} visible / {marked} marked")
    check(A.evaluate("getComputedStyle(document.querySelector('.notes-units')).display") == "none", "unit tabs hidden in 我要注意的")
    A.screenshot(path=str(OUT / "focus-3-mine.png"), full_page=True)
    A.click('[data-nm="all"]')
    A.wait_for_selector(".notes-page:not(.focus-only)")
    A.click('.notes-mod[data-mid="u2b"] .note.marked .fx-run')
    check(wait_until(lambda: A.evaluate("location.hash").startswith("#/run/fx")), "練這幾題 on a marked card starts a run of just those questions")
    n_run = A.evaluate("Object.values(window.__app.S.progress).find((p) => p.title.startsWith('重練')).ids.length")
    check(n_run == 2, f"run has the 2 questions of that card: {n_run}")
    # ④ 老師、家長
    T, code = make_teacher(b)
    amy = add_student(T, "Amy")
    A.goto(link(code, "student", amy))
    check(wait_until(lambda: st(A) == "member", 15), "student linked (old records upload)")
    T.goto(URL + f"#/student/{amy}")
    check(wait_until(lambda: T.locator(".fx-sum .fx-row").count() >= 2, 20), "teacher's student page lists the concepts to watch")
    check("近遠" in txt(T, ".fx-sum"), "teacher sees the concept card name")
    T.screenshot(path=str(OUT / "focus-4-teacher.png"), full_page=True)
    T.click(".fx-sum [data-fxsheet]")
    T.wait_for_selector(".sheet .focus-only .note.marked")
    check(T.locator(".sheet .note.marked").count() >= 2, "看畫線的重點: only the marked cards")
    T.click(".sheet [data-fxpdf]")
    ok_pdf = wait_until(lambda: T.evaluate("window.__fxPdf && window.__fxPdf.pages"), 40)
    info = T.evaluate("window.__fxPdf || {}")
    check(ok_pdf and info.get("size", 0) > 20000, f"PDF made on the device: {info}")
    check(wait_until(lambda: "PDF 做好了" in txt(T, ".sheet"), 5), "PDF ready sheet with share/download")
    T.screenshot(path=str(OUT / "focus-5-pdf.png"))
    for k, u in enumerate(T.evaluate("window.__fxPdfImgs || []")):
        import base64
        (OUT / f"focus-pdf-{k}.jpg").write_bytes(base64.b64decode(u.split(",", 1)[1]))
    P = page(b, 390, 844, "P")
    P.goto(link(code, "parent", amy))
    wait_until(lambda: st(P) == "member")
    P.click('.tabbar a[href="#/live/home"]')
    check(wait_until(lambda: P.locator(".fx-sum .fx-row").count() >= 2, 20), "parent's 學習進度 shows 要注意的重點")
    P.screenshot(path=str(OUT / "focus-6-parent.png"), full_page=True)
    b.close()
report()
