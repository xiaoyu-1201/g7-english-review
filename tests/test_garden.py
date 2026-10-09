"""2.21 成長植物：學生首頁上方是這一課的植物（圖要載得到）＋各課的小植物；
還沒選過顯示「選植物」→ 4 種可以選 → 換了之後首頁的圖跟著換、記一筆 {k:'plant'}；家長的學習進度看到同一種植物
每一階段都寫怎麼長到下一階；「幫它長大」直接練這課還不會的題目；生長規則（學生、家長）；長到的階段不會變小（{k:'grow'}）
新功能視窗：新版第一次回到首頁出現一次；學生版可以直接選植物；家長版不同"""
import time
from playwright.sync_api import sync_playwright
from synchelp import *

LOADED = "(sel) => [...document.querySelectorAll(sel)].every((i) => i.complete && i.naturalWidth > 0)"
FORCE = SEED + "localStorage.setItem('g7review:forcenews', '1');"


def push_attempt(pg, r, n=1):
    """在學生裝置塞 Unit 2 前 n 題的作答（直接改 App 記憶體裡的資料，再回首頁）"""
    pg.evaluate(
        """([r, n]) => {
        const A = window.__app
        const ids = A.MODULES.u2b.scored.slice(0, n).map((i) => i.id)
        for (const q of ids) A.S.attempts.push({ q, m: 'u2b', r, t: [], a: 'x', h: 0, c: 0, ts: Date.now(), d: A.S.profile.id })
        localStorage.setItem('g7review:v1', JSON.stringify(A.S)) // App 只在換頁時存檔
      }""",
        [r, n],
    )
    pg.reload()
    pg.wait_for_selector(".home .garden")


with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge")
    T, code = make_teacher(b)
    amy = add_student(T, "Amy")
    A = page(b, 390, 844, "A")
    A.goto(link(code, "student", amy))
    wait_until(lambda: st(A) == "member")
    A.goto(URL)
    A.wait_for_selector(".home .garden .gd-pot img.plant")
    check("plant-sun-1.webp" in A.get_attribute(".gd-pot img.plant", "src"), "no answers yet: big plant is the sunflower seed")
    check(wait_until(lambda: A.evaluate(LOADED, ".garden img.plant")), "all garden images load")
    check(A.locator(".gd-row .gd-cell").count() >= 4, f"one small plant per open unit: {A.locator('.gd-row .gd-cell').count()}")
    check(txt(A, ".gd-change") == "選植物", f"before picking, the button says 選植物: {txt(A, '.gd-change')}")
    check("再答對 1 題，就會發芽" in txt(A, ".gd-next").replace("\xa0", " "), f"seed stage tells how to sprout: {txt(A, '.gd-next')}")
    check("先學「字母與書寫格式」" in txt(A, ".gd-grow"), f"幫它長大 on an unstarted unit: start its first module (concept cards first): {txt(A, '.gd-grow')}")
    A.screenshot(path=str(OUT / "garden-1-home.png"))
    # 生長規則
    A.click("[data-growrule]")
    A.wait_for_selector(".sheet .gr-steps")
    check(A.locator(".sheet .gr-steps li").count() == 5, "rules sheet: five stages with pictures")
    check("錯題本裡這課的題目都練回來" in txt(A, ".sheet") and "不會變小" in txt(A, ".sheet"), "rules mention the bloom condition and no shrinking")
    A.screenshot(path=str(OUT / "garden-4-rules.png"))
    A.keyboard.press("Escape")
    time.sleep(0.4)
    # 選植物 → 4 種（每種顯示開花的樣子）
    A.click(".gd-change")
    A.wait_for_selector(".sheet .pp-pick")
    check(A.locator(".sheet .pp-pick").count() == 4, "four plants to choose from")
    check(wait_until(lambda: A.evaluate(LOADED, ".sheet img.plant")), "all four previews load")
    check("仙人掌" in txt(A, ".sheet") and "毛絨玩偶風" in txt(A, ".sheet"), "names and styles shown")
    A.screenshot(path=str(OUT / "garden-2-pick.png"))
    A.click('.sheet [data-plant="cactus"]')
    check(wait_until(lambda: "plant-cactus-" in (A.get_attribute(".gd-pot img.plant", "src") or "")), "home now shows the cactus")
    check(txt(A, ".gd-change") == "換植物", "after picking, the button says 換植物")
    check(A.evaluate("JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith('g7review:v1')))).sessions.some((s) => s.k === 'plant' && s.type === 'cactus')"), "pick recorded as a session")
    # 幫它長大 → 練這課還不會的題目
    A.click('.gd-cell[data-garden="Unit 2"]')
    A.wait_for_selector('.gd-cell.on[data-garden="Unit 2"]')
    A.click(".gd-grow")
    check(wait_until(lambda: A.evaluate("location.hash").startswith("#/run/m%3Au2a")), "幫它長大 on Unit 2 (nothing done yet) opens its first module")
    A.goto(URL)
    A.wait_for_selector(".home .garden")
    # 答對 1 題 → 發芽、記一筆 grow；之後同一題答錯 → 還是發芽（不會變小）
    push_attempt(A, "ok")
    check(txt(A, ".gd-stage") == "發芽", f"one correct answer: sprout: {txt(A, '.gd-stage')}")
    check("就會長出葉子" in txt(A, ".gd-next"), f"sprout stage tells how to grow leaves: {txt(A, '.gd-next')}")
    check(A.evaluate("window.__app.S.sessions.some((s) => s.k === 'grow' && s.u === 'Unit 2' && s.st === 1)"), "highest stage recorded as {k:'grow'}")
    push_attempt(A, "bad")
    check(txt(A, ".gd-stage") == "發芽", "answering it wrong later does not shrink the plant")
    # 點另一課的小植物 → 大植物換成那一課
    A.click('.gd-cell[data-garden="Unit 1"]')
    check(wait_until(lambda: "Unit 1" in txt(A, ".gd-k")), "tapping a small plant switches the big one")
    # 家長：學習進度的花園是同一種植物、階段一樣；生長規則（家長版）
    P = page(b, 390, 844, "P", seed=FORCE)
    P.goto(link(code, "parent", amy))
    wait_until(lambda: st(P) == "member")
    P.click('.tabbar a[href="#/live/home"]')  # 配對完先在「即時作答」（原本的設計），花園在「學習進度」
    check(wait_until(lambda: P.locator(".sheet .news-row").count() >= 2, 10), "parent sees the what's-new sheet once")
    check("孩子的花園" in txt(P, ".sheet") and "要注意的重點" in txt(P, ".sheet"), "parent version of what's new")
    P.screenshot(path=str(OUT / "garden-5-news-parent.png"))
    P.click(".sheet [data-close]")
    time.sleep(0.4)
    check(wait_until(lambda: P.locator(".gd-row.parent img.plant").count() > 0, 15), "parent sees the garden")
    check(wait_until(lambda: "plant-cactus-" in (P.get_attribute(".gd-row.parent img.plant", "src") or ""), 15), "parent sees the cactus the student picked")
    check(wait_until(lambda: "plant-cactus-2" in P.evaluate("[...document.querySelectorAll('.gd-row.parent img.plant')].map((i) => i.src).join(' ')"), 15), "parent sees Unit 2 as a sprout (same stage as the student)")
    P.click(".pp-card [data-growrule]")
    P.wait_for_selector(".sheet .gr-steps")
    check("孩子練習時" in txt(P, ".sheet"), "parent version of the rules")
    P.screenshot(path=str(OUT / "garden-3-parent.png"), full_page=True)
    # 新功能視窗（學生）：新版第一次回到首頁出現一次；還沒選植物的可以直接選；選了就不再跳
    N = page(b, 390, 844, "N", seed=FORCE)
    N.goto(URL)
    N.wait_for_selector(".home .garden")
    check(wait_until(lambda: N.locator(".sheet .news-row").count() == 3, 5), "student sees the what's-new sheet with 3 items")
    check(N.locator(".sheet .pp-pick").count() == 4, "and can pick a plant right there")
    N.screenshot(path=str(OUT / "garden-6-news.png"))
    N.click('.sheet [data-plant="sakura"]')
    check(wait_until(lambda: "plant-sakura-" in (N.get_attribute(".gd-pot img.plant", "src") or "")), "picking in the sheet sets the plant")
    N.reload()
    N.wait_for_selector(".home .garden")
    time.sleep(1.2)
    check(N.locator(".sheet").count() == 0, "what's-new does not show again")
    N.goto(URL + "#/settings")
    N.click('[data-x="news"]')
    check(wait_until(lambda: "更新紀錄" in txt(N, ".sheet"), 3), "settings → 更新紀錄 shows it again")
    b.close()
report()
