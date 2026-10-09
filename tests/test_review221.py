"""2.21 code review 補的測試（資深工程師審查列的必修項目）
① 老師把課全部收回：學生首頁不能壞掉
② 課堂檢視：雲端來的選項順序被塞了字串、重複、超出範圍 → 不採用，不會執行任何程式
③ 「開放下一課」的復原：按了會收回；提示消失後，同一個位置點不到看不見的按鈕
④ 兩課同時長大：雲端要有兩筆 {k:'grow'}（時間不能一樣，不然互相蓋掉）"""
import time
from playwright.sync_api import sync_playwright
from synchelp import *

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge")
    T, code = make_teacher(b)
    amy = add_student(T, "Amy")
    A = page(b, 390, 844, "A")
    A.goto(link(code, "student", amy))
    wait_until(lambda: st(A) == "member")
    # ④ 兩課同時長大（Starter、Unit 1 各答對 1 題 → 第一次看到花園時一起記錄）
    A.evaluate(
        """() => {
        const X = window.__app, now = Date.now()
        for (const mid of ['s1', 'u1a']) X.S.attempts.push({ q: X.MODULES[mid].scored[0].id, m: mid, r: 'ok', t: [], a: 'x', h: 0, c: 0, ts: now, d: X.S.profile.id })
        localStorage.setItem('g7review:v1', JSON.stringify(X.S))
      }"""
    )
    A.goto(URL)
    A.reload()
    A.wait_for_selector(".home .garden")
    def grows():
        s = http("GET", f"/classes/{code}/s/{amy}.json")[1] or {}
        return sorted(v.get("u") for v in s.values() if v.get("k") == "grow")
    check(wait_until(lambda: grows() == ["Starter", "Unit 1"], 15), f"two units growing at once → two grow records in the cloud: {grows()}")
    # ② 課堂檢視：壞掉或惡意的 ord
    A.click('.mod[data-mod="u2b"]')
    A.wait_for_selector(".qcard")
    for _ in range(4):  # 跳過觀念卡（先選一個答案才能按「我懂了」），到第一題選擇題
        if A.locator(".qcard.t-mcq").count():
            break
        if A.locator(".qcard.t-learn .learn-ask .opt").count():
            A.locator(".qcard.t-learn .learn-ask .opt").first.click()
        A.locator("[data-act=check]").click()
        time.sleep(0.4)
    q = A.evaluate("document.querySelector('.qcard').dataset.id")
    n = A.evaluate(f"window.__app.ITEM['{q}'].opts.length")
    T.goto(URL + f"#/watch/{amy}")
    T.wait_for_selector(".watch-page")
    check(wait_until(lambda: T.locator(".watch-slot .opt").count() == n, 15), "class view shows the current question")
    live = http("GET", f"/classes/{code}/live/{amy}.json")[1] or {}
    dev = next(k for k, v in live.items() if v.get("q") == q)
    bad = ['"><img src=x onerror="window.__xss=1">'] + list(range(1, n))
    http("PATCH", f"/classes/{code}/live/{amy}/{dev}.json", {"ord": bad, "ts": int(time.time() * 1000)})
    time.sleep(2)
    check(T.evaluate("window.__xss") is None, "a string in ord is not rendered (no script runs)")
    check(T.locator(".watch-slot .opt").count() == n and T.locator(".watch-slot img[src='x']").count() == 0, "class view still shows the normal options")
    http("PATCH", f"/classes/{code}/live/{amy}/{dev}.json", {"ord": [0] * n, "ts": int(time.time() * 1000) + 1})
    time.sleep(2)
    check(T.locator(".watch-slot .opt").count() == n, "duplicated indexes are ignored too")
    A.locator("[data-act=close]").click()
    # ③ 開放下一課的復原
    T.goto(URL + "#/students")
    T.wait_for_selector(f'[data-card="{amy}"] [data-act="next"]')
    T.click(f'[data-card="{amy}"] [data-act="next"]')
    check(wait_until(lambda: T.locator("#toast .t-act").count() == 1), "toast offers 復原")
    units = lambda: (http("GET", f"/classes/{code}/students/{amy}/units.json")[1] or {})
    check(wait_until(lambda: units().get("Unit 3") is True), "Unit 3 opened")
    T.click("#toast .t-act")
    check(wait_until(lambda: units().get("Unit 3") is False), "復原 closes it again")
    T.wait_for_selector(f'[data-card="{amy}"] [data-act="next"]')
    T.click(f'[data-card="{amy}"] [data-act="next"]')
    check(wait_until(lambda: units().get("Unit 3") is True), "opened again")
    time.sleep(6.6)
    check(T.locator("#toast .t-act").count() == 0, "after the toast fades, the hidden 復原 button is gone")
    check(T.evaluate("getComputedStyle(document.querySelector('#toast')).pointerEvents") == "none", "the faded toast does not catch taps")
    # ① 老師把課全部收回：學生首頁不能壞掉
    http("PUT", f"/classes/{code}/students/{amy}/units.json", {u: False for u in ["Starter", "Unit 1", "Unit 2", "Review 1", "會考導向", "Unit 3"]})
    A.goto(URL)
    A.reload()
    check(wait_until(lambda: A.locator(".home").count() == 1, 15), "no units open: home still renders")
    check(A.locator(".home .garden").count() == 0, "no garden when nothing is open")
    b.close()
report()
