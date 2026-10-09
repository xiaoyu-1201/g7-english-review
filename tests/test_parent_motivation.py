"""2.18 家長動機＋作業連結（10/9 老師：「引起家長動機，每次點進來都看到新東西、知道學生在我這邊學到什麼」
「沒派作業就沒有網址、沒有作業連結」「截止時間要可以選，可以先預設」）"""
import re, time
from playwright.sync_api import sync_playwright
from synchelp import *

PLAY = "window.__played = []; HTMLMediaElement.prototype.play = function () { window.__played.push(this.src.slice(0, 30)); return Promise.resolve() };"
with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge")
    T, code = make_teacher(b)
    T.context.grant_permissions(["clipboard-read", "clipboard-write"], origin=URL.rstrip("/"))
    amy = add_student(T, "Amy")
    A = page(b, 390, 844, "A")
    A.goto(link(code, "student", amy))
    wait_until(lambda: st(A) == "member")
    P = page(b, 390, 844, "P", seed=SEED + PLAY)
    P.goto(link(code, "parent", amy))
    wait_until(lambda: st(P) == "member")
    # 資料：u2b-01 十天前錯、今天對（進步）；u2b-02 今天對；模擬段考 72 → 88；口說 92；一段錄音
    now = int(time.time() * 1000)
    att = lambda q, t, r: {"q": q, "m": "u2b", "r": r, "t": [], "a": "x", "h": 0, "c": 0, "x": "p", "ts": t, "d": "sdev"}
    rows = [att("u2b-01", now - 10 * 86400000, "bad"), att("u2b-01", now - 3600000, "ok"), att("u2b-02", now - 1800000, "ok")]
    http("PATCH", f"/classes/{code}/a/{amy}.json", {f"{a['ts']}-{a['q']}-sdev": a for a in rows})
    ss = [
        {"k": "exam", "m": "exam", "title": "模擬段考（第一次段考）", "ex": "e1", "s": 72, "n": 30, "ok": 20, "ts": now - 8 * 86400000, "d": "sdev"},
        {"k": "exam", "m": "exam", "title": "模擬段考（第一次段考）", "ex": "e1", "s": 88, "n": 30, "ok": 26, "ts": now - 7200000, "d": "sdev"},
        {"k": "speak", "m": "speak", "title": "口說練習（句子跟讀）", "s": 92, "n": 8, "ts": now - 600000, "d": "sdev"},
    ]
    http("PATCH", f"/classes/{code}/s/{amy}.json", {f"{s['ts']}-{s['k']}-sdev": s for s in ss})
    http("PUT", f"/recs/{code}/{amy}/hello.json", {"d": "data:audio/mp4;base64,AAAA", "ts": now, "sc": 90, "said": "hello", "en": "Hello."})
    # 老師：寫給家長的話（點建議句）
    T.goto(URL + f"#/student/{amy}")
    T.wait_for_selector(".note-card [data-note]")
    T.click(".note-card [data-note]")
    T.wait_for_selector(".sheet .note-ideas .chip")
    ideas = T.locator(".sheet .note-ideas .chip").all_inner_texts()
    check(any("72 分進步到 88 分" in i for i in ideas), f"note ideas use the student's data ({ideas[:4]})")
    T.locator(".sheet .note-ideas .chip").first.click()
    msg = T.evaluate("document.querySelector('#note-ta').value")
    T.click(".sheet [data-sendnote]")
    check(wait_until(lambda: "家長看得到" in txt(T, "#toast")), "note sent")
    hw = http("GET", f"/classes/{code}/hw/{amy}.json")[1] or {}
    check(any(h.get("kind") == "note" and h.get("msg") == msg for h in hw.values()), "note stored with the homework data (no rules change)")
    check(wait_until(lambda: msg[:6] in txt(T, ".note-card")), "teacher's card shows the last note")
    check("沒有作業" in txt(T, ".hw-card") or "還沒有派作業" in txt(T, ".hw-card"), "a note is not counted as homework")
    # 本週摘要（傳 LINE）
    T.click(".note-card [data-report]")
    T.wait_for_selector(".sheet .share-ta")
    rep = T.evaluate("document.querySelector('.sheet .share-ta').value")
    check("Amy這週的英文練習" in rep and "72 → 88" in rep and f"#/go/{code}/{amy}/p" in rep and msg[:6] in rep, f"weekly summary text: {rep[:120]!r}")
    T.evaluate("window.__clip = ''; navigator.clipboard.writeText = async (t) => { window.__clip = t }")  # 測試瀏覽器不給剪貼簿權限：用假的
    T.click(".sheet [data-copytext]")
    check(wait_until(lambda: T.evaluate("window.__clip") == rep) and "已複製" in txt(T, "#toast"), "summary copied to the clipboard")
    T.keyboard.press("Escape")
    time.sleep(0.4)
    # 家長：學習進度最上面＝老師的話、這週學會了、進步、聽孩子念的（2.21：家長加入後就在學習進度，請 App 去抓老師的話）
    P.wait_for_selector(".parent-prog")
    P.evaluate("window.__app.Sync.fetchHw()")
    check(wait_until(lambda: msg[:6] in txt(P, ".pp-note-card")), "parent sees the teacher's note at the top")
    pp = txt(P, ".parent-prog")
    check("這週學會了" in pp and "this / that / these / those" in pp, "parent sees what was learned this week")
    check("以前答錯、這週答對" in pp and "72 → 88" in pp and "↑ 16 分" in pp, f"parent sees progress ({pp[pp.find('進步'):pp.find('進步') + 60]!r})")
    check(P.locator(".pp-stats .pp-stat").count() >= 5 and P.locator(".pp-ico").count() >= 5, "summary uses big-number tiles and colored icon squares (no emoji rows)")
    P.click("[data-latestrec]")
    check(wait_until(lambda: len(P.evaluate("window.__played")) == 1 and P.evaluate("window.__played")[0].startswith("data:audio")), "parent can play the latest recording")
    check(P.locator(".pp-new").count() == 0, "first visit: no 'since last time' banner")
    P.screenshot(path=str(OUT / "pm-parent.png"), full_page=True)
    # 孩子又練了 → 家長再打開：「上次你看之後」
    time.sleep(1.2)
    answer_one(A, "u2b")
    time.sleep(1.5)
    P.goto(URL + "#/live")
    P.wait_for_selector(".live-page")
    P.goto(URL + "#/live/home")
    P.wait_for_selector(".parent-prog")
    check(wait_until(lambda: P.locator(".pp-new.on").count() == 1 and "多練了" in txt(P, ".pp-new")), f"second visit shows what is new since last time ({txt(P, '.pp-new') if P.locator('.pp-new').count() else ''})")
    # 派作業：截止時間可以選（預設上次選的）；派出後有 LINE 訊息＋作業連結
    T.goto(URL + f"#/student/{amy}")
    T.wait_for_selector("[data-assign]")
    T.click("[data-assign]")
    T.wait_for_selector(".sheet .hp-card")
    check(T.evaluate("document.querySelector('#hw-time').value") == "23:59", "due time defaults to 23:59")
    T.fill("#hw-time", "17:30")
    T.click('.sheet .hp-card[data-t="mod:u2b"]')
    T.click(".sheet [data-ok]")
    T.wait_for_selector(".sheet [data-send]")
    check("下午 5:30前" in txt(T, ".sheet .hw-confirm"), f"confirm shows the chosen time ({txt(T, '.sheet .hw-cf-meta')!r})")
    T.click(".sheet [data-send]")
    T.wait_for_selector(".sheet .share-ta")
    hwmsg = T.evaluate("document.querySelector('.sheet .share-ta').value")
    m = re.search(r"(http\S+#/go/\S+/hw-\S+)", hwmsg)
    check(m is not None and "下午 5:30前完成" in hwmsg and "this / that" in hwmsg, f"after sending: LINE message with the homework link ({hwmsg[:90]!r})")
    hwlink = m.group(1) if m else ""
    hw = http("GET", f"/classes/{code}/hw/{amy}.json")[1] or {}
    due = [h["due"] for h in hw.values() if h.get("kind") != "note"][0]
    check(time.localtime(due / 1000).tm_hour == 17 and time.localtime(due / 1000).tm_min == 30, "stored due time is 17:30")
    T.keyboard.press("Escape")
    time.sleep(0.4)
    T.click("[data-assign]")
    T.wait_for_selector("#hw-time")
    check(T.evaluate("document.querySelector('#hw-time').value") == "17:30", "next time the due time defaults to the last one chosen")
    T.keyboard.press("Escape")
    time.sleep(0.4)
    check(T.locator(".hw-card [data-sharehw]").count() == 1, "each homework has a 傳給學生 button")
    # 修改已經派出的作業（老師 10/9：不小心按錯要可以改）：原本的項目、時間帶進來；存回同一份
    hw_before = {k: v for k, v in (http("GET", f"/classes/{code}/hw/{amy}.json")[1] or {}).items() if v.get("kind") != "note"}
    hid, h0 = next(iter(hw_before.items()))
    T.click(f'.hw-card [data-edithw="{hid}"]')
    T.wait_for_selector(".sheet .hp-card")
    check("修改" in txt(T, ".sheet .sheet-title") and T.locator(".sheet .hw-pick.on").count() == 1 and T.evaluate("document.querySelector('#hw-time').value") == "17:30", "edit opens with the original tasks and time")
    T.click('.sheet .hp-card[data-t="book"]')
    T.click(".sheet [data-ok]")
    T.wait_for_selector(".sheet [data-send]")
    check("修改後" in txt(T, ".sheet .hw-confirm") and "儲存修改" in txt(T, ".sheet [data-send]"), "confirm step says it is an edit")
    T.click(".sheet [data-send]")
    check(wait_until(lambda: "已修改" in txt(T, "#toast")), "edit saved")
    h1 = (http("GET", f"/classes/{code}/hw/{amy}/{hid}.json")[1] or {})
    check(len(h1.get("tasks", [])) == 2 and h1.get("at") == h0.get("at") and len([1 for v in (http("GET", f"/classes/{code}/hw/{amy}.json")[1] or {}).values() if v.get("kind") != "note"]) == 1, "the same homework is updated (not a new one), assign time kept")
    # 學生（已連結）點作業連結 → 作業視窗 → 開始第一項
    A.goto(hwlink)
    A.wait_for_selector(".sheet [data-hw]")
    check("開始" in txt(A, ".sheet .sheet-actions") and "下午 5:30前" in txt(A, ".sheet"), "student: the link opens the homework with a start button")
    A.click(".sheet .sheet-actions [data-hw]")
    check(wait_until(lambda: A.locator(".run").count() == 1), "start goes straight into the module")
    A.locator("[data-act=close]").click()
    # 還沒連結的瀏覽器：說明＋在這裡加入 → 加入完回到作業
    X = page(b, 390, 844, "X")
    X.goto(hwlink)
    X.wait_for_selector(".go-page [data-join]")
    check("主畫面" in txt(X, ".go-page"), "unlinked browser: explains to open the home-screen app")
    X.click(".go-page [data-join]")
    check(wait_until(lambda: X.locator(".sheet [data-hw]").count() >= 1, 15), "after joining here, the homework opens")
    # 家長、老師點同一個連結
    P.goto(hwlink)
    check(wait_until(lambda: P.evaluate("location.hash") == "#/live"), "parent: the homework link goes to the parent page")
    T.goto(hwlink)
    check(wait_until(lambda: T.evaluate("location.hash") == f"#/student/{amy}"), "teacher: the link goes to the student page")
    # 單元連結（學習進度 → 單元 → 傳給學生）
    T.goto(URL + f"#/student/{amy}/home")
    T.wait_for_selector('.stu-home .mod[data-mod="u2b"]')
    T.click('.stu-home .mod[data-mod="u2b"]')
    T.wait_for_selector(".sheet [data-modlink]")
    T.click(".sheet [data-modlink]")
    T.wait_for_selector(".sheet .share-ta")
    mm = re.search(r"(http\S+#/go/\S+/m-u2b)", T.evaluate("document.querySelector('.sheet .share-ta').value"))
    check(mm is not None, "module link text has the link")
    A.goto(URL)
    A.wait_for_selector(".home")
    A.goto(mm.group(1) if mm else URL)
    check(wait_until(lambda: A.locator(".run").count() == 1), "student: the module link starts that module")
    b.close()
report()
