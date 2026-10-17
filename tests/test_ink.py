"""2.30 筆跡即時共用＋作答過程即時看到：
學生在題目卡上畫 → 老師的課堂檢視馬上看到（ink/<班級>/<學生>/q:<題目>/s）；老師在課堂檢視畫 → 學生的卡片看到（/t）；
老師復原 → 學生那邊消失；學生填空打到一半 → 老師看到「正在輸入…」和打到哪，而且卡片不會被重建（老師畫到一半不會被打斷）"""
import math, time
from playwright.sync_api import sync_playwright
from synchelp import *


def pen(pg, sel, dy=60):
    """用 CDP 模擬 Apple Pencil 在 sel 這張卡上畫一筆"""
    cdp = pg.context.new_cdp_session(pg)
    pg.locator(sel).first.scroll_into_view_if_needed()
    time.sleep(0.2)
    bx = pg.locator(sel).first.bounding_box()
    pts = [(bx["x"] + 20 + t * 3, bx["y"] + dy + math.sin(t / 8) * 8, 0.5) for t in range(40)]
    x, y, f = pts[0]
    cdp.send("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x, "y": y, "pointerType": "pen"})
    cdp.send("Input.dispatchMouseEvent", {"type": "mousePressed", "x": x, "y": y, "button": "left", "clickCount": 1, "force": f, "pointerType": "pen"})
    for x, y, f in pts[1:]:
        cdp.send("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x, "y": y, "button": "left", "buttons": 1, "force": f, "pointerType": "pen"})
    cdp.send("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": x, "y": y, "button": "left", "clickCount": 1, "pointerType": "pen"})
    cdp.detach()
    time.sleep(0.2)


with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge")
    T, code = make_teacher(b)
    amy = add_student(T, "Amy")
    A = page(b, 820, 1180, "A")
    errs = []
    A.on("pageerror", lambda e: errs.append("A " + str(e)))
    T.on("pageerror", lambda e: errs.append("T " + str(e)))
    A.goto(link(code, "student", amy))
    wait_until(lambda: st(A) == "member")
    A.goto(URL)
    A.wait_for_selector(".home")
    # 挑一個首頁看得到、第一題（觀念卡以外）是填空的單元
    mid = A.evaluate(
        """() => { const M = window.__app.MODULES
      return [...document.querySelectorAll('.mod[data-mod]')].map((e) => e.dataset.mod).find((m) => M[m] && (M[m].items.find((i) => i.t !== 'learn') || {}).t === 'fill') }"""
    )
    check(bool(mid), f"found a module whose first question is a fill-in ({mid})")
    A.click(f'.mod[data-mod="{mid}"]')
    A.wait_for_selector(".qcard")
    for _ in range(6):
        if A.locator(".qcard.t-fill").count():
            break
        cur = A.evaluate("document.querySelector('.qcard')?.dataset.id")
        if not A.locator(".qcard.t-learn").count():
            break
        A.click('.t-learn .opt[data-i="0"]')
        wait_until(lambda: A.locator("[data-act=check]:not([disabled])").count() == 1, 5)
        A.click("[data-act=check]")
        if not wait_until(lambda: A.evaluate("document.querySelector('.qcard')?.dataset.id") != cur, 3) and A.locator("[data-act=next]").count():
            A.click("[data-act=next]")
            wait_until(lambda: A.evaluate("document.querySelector('.qcard')?.dataset.id") != cur, 5)
    check(A.locator(".qcard.t-fill").count() == 1, f"reached a fill-in card ({A.evaluate('document.querySelector(\".qcard\")?.className')})")
    qid = A.evaluate("document.querySelector('.qcard').dataset.id")
    ink = lambda side: http("GET", f"/ink/{code}/{amy}/q:{qid}/{side}.json")[1] or {}
    # ① 學生畫一筆 → 雲端 s 有一筆
    pen(A, ".qcard")
    check(A.locator(".qcard .ink.pen path").count() == 1, "student's stroke is on the card")
    check(wait_until(lambda: len(ink("s")) == 1), f"student's stroke uploaded to ink/<class>/<sid>/q:<id>/s ({len(ink('s'))})")
    s = list(ink("s").values())[0]
    check(s.get("t") == "pen" and isinstance(s.get("p"), list) and len(s["p"]) > 3 and "id" in s, "stroke stored with type, points and id")
    # ② 老師的課堂檢視看到學生的筆跡（remote，不能擦）
    T.goto(URL + f"#/watch/{amy}")
    T.wait_for_selector(".watch-q .qcard")
    check(wait_until(lambda: T.locator(".watch-q .qcard .ink.pen path.remote").count() == 1), "teacher sees the student's stroke")
    check(T.locator(".watch-q .qcard").get_attribute("data-ink") == f"w:{amy}:q:{qid}", "teacher's card key is per student (w:<sid>:q:<id>)")
    T.screenshot(path=str(OUT / "ink-1-teacher-sees.png"))
    # ③ 老師畫一筆 → 雲端 t 有一筆 → 學生的卡片多一條 remote
    pen(T, ".watch-q .qcard", dy=90)
    check(wait_until(lambda: len(ink("t")) == 1), f"teacher's stroke uploaded to /t ({len(ink('t'))})")
    check(wait_until(lambda: A.locator(".qcard .ink.pen path.remote").count() == 1), "student sees the teacher's stroke")
    check(A.locator(".qcard .ink.pen path").count() == 2, "student's card: own stroke + teacher's stroke")
    A.screenshot(path=str(OUT / "ink-2-student-sees.png"))
    # 學生的橡皮擦擦不到老師的：筆跡不在學生的 localStorage 裡
    saved = A.evaluate("JSON.parse(localStorage.getItem('g7review:ink') || '{}')")
    check(len(saved.get(f"q:{qid}", [])) == 1, "teacher's stroke is not stored on the student's device")
    # ④ 學生打字（填空）→ 老師看到「正在輸入」和內容，卡片沒有被重建
    T.evaluate("document.querySelector('.watch-q .qcard').__keep = 1")
    A.locator(".qcard .blank").first.type("hel")
    check(wait_until(lambda: "正在輸入" in txt(T, ".wq-h") and "hel" in txt(T, ".wq-h")), f"teacher sees the typing in progress: {txt(T, '.wq-h')[:40]}")
    check(T.locator(".watch-q .blank").first.input_value() == "hel", "teacher's card shows the half-typed answer in the blank")
    check(T.evaluate("document.querySelector('.watch-q .qcard').__keep === 1"), "card is updated in place (not rebuilt) while the student types")
    check(T.locator(".watch-q .qcard .ink.pen path").count() == 2, "both strokes still on the teacher's card")
    T.screenshot(path=str(OUT / "ink-3-typing.png"))
    # ⑤ 老師復原 → 雲端 t 清掉 → 學生那邊的老師筆跡消失
    T.click("[data-undo]")
    check(wait_until(lambda: len(ink("t")) == 0), "undo removes the teacher's stroke from the cloud")
    check(wait_until(lambda: A.locator(".qcard .ink.pen path.remote").count() == 0), "student no longer sees the teacher's stroke")
    # ⑥ 學生按檢查 → 老師看到結果（原本的流程沒壞）
    for i in range(A.locator(".qcard .blank").count()):
        A.locator(".qcard .blank").nth(i).fill("x")
    A.click("[data-act=check]")
    check(wait_until(lambda: any(w in txt(T, ".wq-h") for w in ("答對了", "答錯了", "格式粗心"))), f"after checking, the teacher sees the result: {txt(T, '.wq-h')[:20]}")
    check(not errs, f"no JS errors ({errs})")
    b.close()
report()
