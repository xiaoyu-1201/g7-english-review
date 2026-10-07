"""2.11 第二、三次段考：題庫格式、一課一課開放、首頁分區、模擬段考選第幾次、新插圖（時鐘、月曆、標誌、人物、場景、圖片選項）"""
import subprocess, time, json, pathlib
from playwright.sync_api import sync_playwright
from synchelp import *

APP = pathlib.Path(__file__).parent.parent
r = subprocess.run(["node", "tools/check_content.mjs"], cwd=APP, capture_output=True, text=True, encoding="utf-8")
info = json.loads(r.stdout or "{}")
check(r.returncode == 0 and not info.get("errors"), f"content check passes {info.get('errors')}")
check(info.get("scored", 0) >= 440, f"question bank has {info.get('scored')} scored items")

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge")
    T, code = make_teacher(b)
    amy = add_student(T, "Amy")
    A = page(b, 390, 844, "A")
    A.goto(link(code, "student", amy))
    wait_until(lambda: st(A) == "member")
    # 學生：預設只有第一次段考
    A.goto(URL)
    A.wait_for_selector(".home")
    check(A.locator('[data-mod="u3a"]').count() == 0, "student: Unit 3 hidden by default")
    check("第一次段考" in txt(A, ".lg-sub"), "student header says first exam")
    # 老師開放 Unit 3 → 學生看到第二次段考的區塊
    T.goto(URL + "#/students")
    T.click(f'.sc[data-card="{amy}"] [data-act="next"]')
    check(wait_until(lambda: "已開放 Unit 3" in txt(T, "#toast")), "teacher opens Unit 3")
    A.evaluate("window.__app.Sync.fetchStu()")
    check(wait_until(lambda: A.locator('.mod[data-mod="u3a"]').count() == 1), "student sees Unit 3 after opening")
    check(A.locator('.mod[data-mod="u4a"]').count() == 0, "Unit 4 still hidden")
    check(A.locator(".exam-h").count() == 2 and "第二次段考" in txt(A, ".home"), "home split into exam sections")
    check("第一、二次段考" in txt(A, ".lg-sub"), "header covers first and second exams")
    # 新插圖：標誌（u3b 第一張觀念卡）、場景（u3a 第二張）
    A.click('.mod[data-mod="u3b"]')
    A.wait_for_selector(".t-learn")
    check(A.locator(".fig-signs .sg").count() == 3, "signs figure renders")
    A.screenshot(path=str(OUT / "g1-signs.png"))
    A.locator("[data-act=close]").click()
    # 老師的裝置：全部的課都看得到
    T.goto(URL)
    T.wait_for_selector(".home")
    check(T.locator('.mod[data-mod="u6e"]').count() == 1 and T.locator(".exam-h").count() == 3, "teacher sees all three exams")
    # 各種插圖都畫得出來
    for mid, sel, name in [("u4b", ".fig-clock", "clock"), ("u5b", ".fig-pic", "pic"), ("u4c", ".fig-people .pp", "people"), ("u6b", ".fig-pic", "scene")]:
        T.goto(URL)
        T.wait_for_selector(".home")
        T.click(f'.mod[data-mod="{mid}"]')
        T.wait_for_selector(".qcard")
        check(T.locator(sel).count() >= 1, f"{name} figure renders in {mid}")
        T.screenshot(path=str(OUT / f"g2-{name}.png"))
        T.locator("[data-act=close]").click()
    # 月曆（u5b 第二張觀念卡）
    T.goto(URL)
    T.wait_for_selector(".home")
    T.click('.mod[data-mod="u5b"]')
    T.wait_for_selector(".t-learn")
    T.click('.opt[data-i="1"]')
    T.click("[data-act=check]")
    T.wait_for_selector(".fig-cal")
    check(T.locator(".fig-cal .cal-d.mark").count() == 1, "calendar marks one date")
    T.screenshot(path=str(OUT / "g3-cal.png"))
    T.locator("[data-act=close]").click()
    # 選項就是插圖的 A／B／C：不打亂、排成一列（不會出現「B. C」）
    T.goto(URL)
    T.wait_for_selector(".home")
    T.evaluate("(() => { window.__app.S.progress.abc = { ids: ['u4e-01'], i: 0, res: {}, t0: Date.now(), title: 'abc' }; location.hash = '#/run/abc' })()")
    T.wait_for_selector(".opts.abc")
    check(T.evaluate("[...document.querySelectorAll('.opts.abc .opt')].map(o => o.innerText.trim()).join('')") == "ABC", "picture-letter options keep A/B/C order")
    T.screenshot(path=str(OUT / "g5-abc.png"))
    T.locator("[data-act=close]").click()
    # 模擬段考：選第二次段考 → 題目只來自 Unit 3、Unit 4、Review 2
    T.goto(URL + "#/exam")
    T.wait_for_selector("#ex-pick")
    check(T.locator("#ex-pick button").count() == 4, "exam picker lists three exams and the final mock")
    T.click('#ex-pick [data-ex="e2"]')
    check("Unit 3～Review 2" in txt(T, ".ex-range"), "picker shows the range")
    T.click("[data-act=start]")
    T.wait_for_selector(".exam-paper .qcard")
    ids = T.evaluate("[...document.querySelectorAll('.exam-paper .qcard')].map(e => e.dataset.id)")
    check(len(ids) >= 25 and all(i.split("-")[0][:2] in ("u3", "u4", "r2", "k4", "k5", "k6") for i in ids), f"second-exam paper only uses its range ({len(ids)} items)")
    check("第二次段考" in txt(T, ".run-title"), "exam header shows which exam")
    T.screenshot(path=str(OUT / "g4-exam2.png"), full_page=False)
    T.click("[data-act=quit]")
    time.sleep(0.4)
    if T.locator(".sheet [data-ok]").count():
        T.click(".sheet [data-ok]")
    # 第三次段考也出得來
    T.goto(URL + "#/exam")
    T.wait_for_selector("#ex-pick")
    T.click('#ex-pick [data-ex="e3"]')
    T.click("[data-act=start]")
    T.wait_for_selector(".exam-paper .qcard")
    ids3 = T.evaluate("[...document.querySelectorAll('.exam-paper .qcard')].map(e => e.dataset.id)")
    check(len(ids3) >= 25 and all(i.split("-")[0][:2] in ("u5", "u6", "r3", "k7", "k8", "k9") for i in ids3), f"third-exam paper only uses its range ({len(ids3)} items)")
    b.close()
report()
