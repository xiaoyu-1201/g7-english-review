"""上一題：回顧作答過的題目、保留寫到一半的答案、重新整理後也能回顧"""
import pathlib, time
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:5181/"
OUT = pathlib.Path(__file__).parent / "shots"
SEED = "if (!localStorage.getItem('g7review:v1')) localStorage.setItem('g7review:v1', JSON.stringify({seen:{intro:1}}))"
errors, notes, fails = [], [], []


def check(cond, msg):
    if not cond:
        fails.append(msg)


with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge")
    for name, vp in [("ipad", {"width": 820, "height": 1180}), ("phone", {"width": 390, "height": 844})]:
        ctx = b.new_context(viewport=vp, has_touch=True)
        ctx.add_init_script(SEED)
        pg = ctx.new_page()
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
        pg.goto(URL)
        pg.evaluate("localStorage.clear()")
        pg.goto(URL)
        pg.wait_for_selector(".home")
        attempts = lambda: pg.evaluate("JSON.parse(localStorage.getItem('g7review:v1')).attempts.length")
        cur = lambda: pg.locator(".qcard").first.get_attribute("data-id")
        pg.click('[data-mod="s2"]')
        pg.wait_for_selector(".t-learn")
        check(pg.locator("[data-act=back]").count() == 0, "first card should have no back")
        for _ in range(2):
            pg.click('.opt[data-i="0"]')
            pg.click("[data-act=check]")
        pg.wait_for_selector(".t-mcq")
        pg.click('.opt[data-i="1"]')  # 答錯
        pg.click("[data-act=check]")
        pg.click("[data-act=check]")  # 不小心按到繼續
        pg.wait_for_selector(".t-fill")
        check(cur() == "s2-02", f"{name} at s2-02, got {cur()}")
        pg.fill(".blank", "It")  # 寫到一半
        n0 = attempts()
        pg.click("[data-act=back]")
        pg.wait_for_selector(".run.reviewing")
        time.sleep(0.4)
        pg.screenshot(path=str(OUT / f"80-back-review-{name}.png"))
        check(cur() == "s2-01", f"{name} back to s2-01, got {cur()}")
        check(pg.locator(".qcard .fb.bad").count() == 1, f"{name} review shows feedback")
        check(pg.locator("[data-act=hint]").count() == 0, f"{name} no hint in review")
        check(pg.locator(".rev-tag").count() == 1, f"{name} review tag")
        pg.click('.qcard .opt[data-i="0"]', force=True)  # 回顧時點選項不會改答案
        check(pg.locator(".qcard .opt.sel").count() <= 1 and pg.locator(".qcard .opt.ok").count() == 1, f"{name} review is static")
        pg.keyboard.press("ArrowLeft")
        pg.wait_for_selector(".t-learn")
        check(pg.locator(".learn-rule:not([hidden])").count() == 1, f"{name} learn review shows rule")
        pg.click("[data-act=check]")  # 下一題
        pg.wait_for_selector(".t-mcq")
        pg.click("[data-act=check]")  # 下一題 → s2-02（寫到一半）
        pg.wait_for_selector(".t-fill:not(.snap)")
        check(pg.locator(".blank").input_value() == "It", f"{name} draft restored")
        check(not pg.locator("[data-act=check]").is_disabled(), f"{name} check enabled after draft")
        check(attempts() == n0, f"{name} no extra attempts while reviewing")
        pg.fill(".blank", "Its")
        pg.click("[data-act=check]")
        pg.click("[data-act=back]")  # 檢查完但還沒按繼續就回上一題
        pg.wait_for_selector(".run.reviewing")
        check(cur() == "s2-01", f"{name} back from checked s2-02")
        pg.click("[data-act=check]")
        pg.wait_for_selector(".qcard.snap")
        check(cur() == "s2-02" and pg.locator(".blank").input_value() == "Its", f"{name} s2-02 snapshot keeps answer")
        pg.click("[data-act=check]")
        pg.wait_for_selector(".qcard:not(.snap)")
        check(cur() == "s2-03", f"{name} forward to s2-03, got {cur()}")
        # 重新整理後回上一題
        pg.reload()
        pg.wait_for_selector(".qcard")
        check(cur() == "s2-03", f"{name} after reload at s2-03")
        pg.click("[data-act=back]")
        pg.wait_for_selector(".run.reviewing")
        time.sleep(0.3)
        pg.screenshot(path=str(OUT / f"81-back-after-reload-{name}.png"))
        notes.append((name, "fallback", pg.locator(".q-feedback").inner_text()[:120]))
        check(attempts() == n0 + 1, f"{name} attempts {attempts()} vs {n0 + 1}")
        ctx.close()
    b.close()
for n in notes:
    print("NOTE", n)
print("ERRORS", errors)
print("FAILS", fails)
