"""2.23.1 視窗不被切掉（老師 10/11 截圖：檢討視窗最下面的「上一題／下一題」被切掉，往上拉放手又彈回）：
視窗整個在看得到的範圍裡；檢討的上一題／下一題釘在最下面（還沒滑也按得到）；滑到底不會多一大塊空白。iPhone 兩種、iPad、電腦"""
import time
from playwright.sync_api import sync_playwright
from synchelp import *

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge")
    T, code = make_teacher(b)
    amy = add_student(T, "Amy")
    now = int(time.time() * 1000)
    wrong = {"u1a-03": "the", "u1a-04": "x", "u2b-01": "x", "u2b-02": "x", "u2b-05": "x", "u2b-06": "x"}
    for i, (q, a) in enumerate(wrong.items()):
        ts = now - (len(wrong) - i) * 60000
        http("PUT", f"/classes/{code}/a/{amy}/{ts}-{q}-x.json", {"q": q, "m": q.split("-")[0], "r": "bad", "a": a, "t": [], "h": 0, "c": 0, "x": "p", "ts": ts, "d": "x"})
    for w, h, name in ((390, 844, "iphone"), (375, 667, "iphone-se"), (820, 1180, "ipad"), (1440, 900, "desktop")):
        T.set_viewport_size({"width": w, "height": h})
        T.goto(URL + f"#/student/{amy}")
        T.wait_for_selector("[data-review]", timeout=15000)
        T.click("[data-review]")
        T.wait_for_selector(".sheet .rr-nav")
        time.sleep(0.5)
        r = T.evaluate("""() => { const s = document.querySelector('.sheet'), n = document.querySelector('.rr-nav'), a = s.getBoundingClientRect(), b = n.getBoundingClientRect()
          return { vh: innerHeight, sheetBottom: Math.round(a.bottom), sheetTop: Math.round(a.top), navBottom: Math.round(b.bottom), navTop: Math.round(b.top), scrolls: s.scrollHeight > s.clientHeight } }""")
        check(r["sheetBottom"] <= r["vh"] and r["sheetTop"] >= 0, f"{name}: the whole sheet is on screen ({r})")
        check(r["navBottom"] <= r["vh"] and r["navTop"] >= r["sheetTop"], f"{name}: 上一題／下一題 visible without scrolling ({r})")
        T.screenshot(path=str(OUT / f"sheet-fit-{name}.png"))
        # 滑到底：按鈕還在看得到的地方，下面沒有一大塊空白
        T.evaluate("document.querySelector('.sheet').scrollTop = 1e6")
        time.sleep(0.3)
        r2 = T.evaluate("""() => { const s = document.querySelector('.sheet').getBoundingClientRect(), n = document.querySelector('.rr-nav').getBoundingClientRect(); return { gap: Math.round(s.bottom - n.bottom), navBottom: Math.round(n.bottom), vh: innerHeight } }""")
        check(r2["navBottom"] <= r2["vh"] and r2["gap"] <= 2, f"{name}: scrolled to the end → buttons at the bottom, no empty band ({r2})")
        T.click('.rr-nav [data-rr="1"]')
        check(wait_until(lambda: "第 2／" in txt(T, ".rr-pos")), f"{name}: 下一題 works")
        T.keyboard.press("Escape")
        time.sleep(0.4)
    # 派作業：下面那排滑到底貼齊底邊、底色跟視窗一樣；鍵盤打開（模擬看得到的高度變矮）時，打字的輸入框捲到按鈕列上面
    T.set_viewport_size({"width": 375, "height": 667})
    T.goto(URL + f"#/student/{amy}")
    T.wait_for_selector("[data-assign]")
    T.click("[data-assign]")
    T.wait_for_selector(".sheet .hw-foot")
    time.sleep(0.4)
    T.evaluate("document.querySelector('.sheet').scrollTop = 1e6")
    time.sleep(0.3)
    r = T.evaluate("""() => { const s = document.querySelector('.sheet'), f = document.querySelector('.hw-foot')
      return { gap: Math.round(s.getBoundingClientRect().bottom - f.getBoundingClientRect().bottom), sheetBg: getComputedStyle(s).backgroundColor, footBg: getComputedStyle(f).backgroundColor } }""")
    check(r["gap"] <= 2 and r["sheetBg"] == r["footBg"], f"assign sheet: bottom bar flush with the bottom, same color as the sheet ({r})")
    T.locator("#hw-note").focus()
    T.evaluate("window.__vvh = 300; window.dispatchEvent(new Event('resize'))")
    time.sleep(0.6)
    r = T.evaluate("""() => { const s = document.querySelector('.sheet').getBoundingClientRect(), i = document.querySelector('#hw-note').getBoundingClientRect(), f = document.querySelector('.hw-foot').getBoundingClientRect()
      return { kb: document.documentElement.classList.contains('kb'), vvh: getComputedStyle(document.documentElement).getPropertyValue('--vvh'), sheetBottom: Math.round(s.bottom), inTop: Math.round(i.top), inBottom: Math.round(i.bottom), footTop: Math.round(f.top), sheetTop: Math.round(s.top) } }""")
    check(r["kb"] and r["vvh"].strip() == "300px" and r["sheetBottom"] <= 300, f"keyboard open: the sheet shrinks to the visible area ({r})")
    check(r["inTop"] >= r["sheetTop"] and r["inBottom"] <= r["footTop"], f"keyboard open: the field being typed in is above the bottom bar ({r})")
    T.screenshot(path=str(OUT / "sheet-fit-keyboard.png"))
    T.evaluate("window.__vvh = 0; window.dispatchEvent(new Event('resize'))")
    check(wait_until(lambda: not T.evaluate("document.documentElement.classList.contains('kb')")), "keyboard closed: back to normal")
    b.close()
report()
