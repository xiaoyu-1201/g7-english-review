"""2.28 開放的課可以細到單元（老師 10/17）：老師只開 Unit 3 的其中一個單元 → 學生只看得到那個單元（＋Unit 3 單字）；
學生頁顯示「Unit 3（1／5 個單元）」；全部勾完＝整課；學生自己不能改 mods"""
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
    # 老師：學生頁 → 開放的課 → 展開 Unit 3 → 只勾 u3a
    T.goto(URL + f"#/student/{amy}")
    T.wait_for_selector("[data-units]")
    T.click("[data-units]")
    T.wait_for_selector(".unit-block")
    T.click('.unit-block[data-u="Unit 3"] [data-fold]')
    check(T.locator('.unit-block[data-u="Unit 3"] .mod-row').count() >= 5, "Unit 3 expands to its parts (vocab + modules)")
    check(T.locator('.unit-block[data-u="Unit 3"] .mod-row[data-m="vocab_unit3"]').count() == 1, "Unit 3 has a 單字 part")
    T.click('.mod-row[data-m="u3a"]')
    check("part" in (T.get_attribute('.unit-row[data-u="Unit 3"]', "class") or ""), "Unit 3 row shows partly open")
    check("1／" in T.locator('.unit-block[data-u="Unit 3"] .u-sub').inner_text(), "sub text says 1／N 塊")
    T.click(".sheet [data-ok]")
    check(wait_until(lambda: (http("GET", f"/classes/{code}/students/{amy}/mods.json")[1] or {}).get("u3a") is True), "mods saved: u3a")
    check((http("GET", f"/classes/{code}/students/{amy}/units.json")[1] or {}).get("Unit 3") is not True, "Unit 3 is not fully open")
    check(wait_until(lambda: "Unit 3（1／" in txt(T, "[data-units]")), "student page lists Unit 3（1／6 塊）")
    # 學生：只看得到 u3a；Unit 3 的其他單元看不到；Unit 3 單字卡看得到
    A.evaluate("window.__app.Sync.fetchStu()")
    check(wait_until(lambda: "老師開放了" in txt(A, "#toast"), 8), "student is told about the new part")
    A.goto(URL)
    A.wait_for_selector(".home")
    check(wait_until(lambda: A.locator('.mod[data-mod="u3a"]').count() == 1), "student sees u3a")
    check(A.locator('.mod[data-mod="u3b"]').count() == 0, "student does not see u3b")
    check(A.locator('.vocab-mod[data-vocab="Unit 3"]').count() == 0, "Unit 3 vocab stays hidden until its 單字 part is opened")
    A.click('.mod[data-mod="u3a"]')
    check(wait_until(lambda: A.locator(".qcard").count() == 1), "student can start the opened module")
    A.goto(URL + "#/")
    A.wait_for_selector(".home")
    # 老師：再把 Unit 3 其他單元全部勾起來 → 變成整課
    T.click("[data-units]")
    T.wait_for_selector(".unit-block")
    T.click('.unit-block[data-u="Unit 3"] [data-fold]')
    for m in T.evaluate("[...document.querySelectorAll('.unit-block[data-u=\"Unit 3\"] .mod-row:not(.on)')].map(r => r.dataset.m)"):
        T.click(f'.mod-row[data-m="{m}"]')
    check("on" in (T.get_attribute('.unit-row[data-u="Unit 3"]', "class") or "").split(), "all modules picked → whole unit on")
    T.click(".sheet [data-ok]")
    check(wait_until(lambda: (http("GET", f"/classes/{code}/students/{amy}/units.json")[1] or {}).get("Unit 3") is True), "whole Unit 3 saved")
    check(wait_until(lambda: not (http("GET", f"/classes/{code}/students/{amy}/mods.json")[1] or {})), "mods cleared when the whole unit is open")
    # 學生不能自己改 mods
    stok = tok_of(A)
    check(http("PUT", f"/classes/{code}/students/{amy}/mods/u4a.json?auth={stok}", True)[0] == 401, "student cannot open modules")
    b.close()
report()
