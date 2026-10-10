"""2.22.7 資料安全：老師一鍵備份全部學生資料＋每月提醒；學生、家長的 iPhone／iPad Safari 提醒加到主畫面"""
import json, time
from playwright.sync_api import sync_playwright
from synchelp import *

IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge")
    T, code = make_teacher(b)
    amy = add_student(T, "Amy")
    # ── 老師：剛加學生、還沒有作答：先不催備份 ──
    T.goto(URL + "#/students")
    T.wait_for_selector(".stu-page")
    time.sleep(0.8)
    check("該備份學生資料了" not in txt(T, ".stu-page"), "no backup nag on day one (no answers yet)")
    # 有作答之後：提醒備份
    now = int(time.time() * 1000)
    att = {"q": "s1-01", "m": "s1", "r": "ok", "t": [], "a": "x", "h": 0, "c": 0, "x": "p", "ts": now, "d": "sdev"}
    http("PATCH", f"/classes/{code}/a/{amy}.json", {f"{now}-s1-01-sdev": att})
    T.goto(URL + "#/students")
    check(wait_until(lambda: "該備份學生資料了" in txt(T, ".stu-page"), 10), "students page reminds the teacher to back up")
    # 設定頁：備份那一列（還沒備份過）
    T.goto(URL + "#/settings")
    T.wait_for_selector('[data-x="backup"]')
    check("還沒備份過" in txt(T, '[data-x="backup"]') and T.locator('[data-x="backup"] .new-tag').count() == 1, "settings has 備份全部學生資料 (never backed up yet, marked 新)")
    # 按下去：下載一個檔，裡面有整個後台
    T.evaluate("navigator.canShare = () => false")  # 電腦測試：不要跳出系統分享視窗，直接下載
    with T.expect_download() as dl:
        T.click('[data-x="backup"]')
    d = dl.value
    data = json.loads(open(d.path(), encoding="utf-8").read())
    check(d.suggested_filename.startswith("小宇英文-全部學生備份-") and d.suggested_filename.endswith(".json"), f"backup file name ({d.suggested_filename})")
    check(data.get("app") == "xiaoyu-english-backup" and data.get("students") == 1 and amy in (data.get("data", {}).get("students") or {}) and data["data"].get("a"), "backup contains the whole backend (students, answers…)")
    stu = data["data"]["students"][amy]
    check("code" not in data and "code" not in stu and "codeExp" not in stu and "live" not in data["data"], "backup has no join codes and no live status (safe if the file leaks)")
    check("上次備份" in txt(T, '[data-x="backup"]'), "settings row now shows the last backup date")
    T.goto(URL + "#/students")
    T.wait_for_selector(".stu-page")
    time.sleep(0.8)
    check("該備份學生資料了" not in txt(T, ".stu-page"), "after backing up, the reminder goes away")
    # ── 學生（iPhone Safari）：首頁提醒加到主畫面 ──
    ctx = b.new_context(viewport={"width": 390, "height": 844}, user_agent=IPHONE_UA, has_touch=True)
    ctx.add_init_script(SEED)
    A = ctx.new_page()
    A.goto(link(code, "student", amy))
    wait_until(lambda: st(A) == "member")
    A.goto(URL)
    A.wait_for_selector(".home")
    check(A.locator(".a2hs").count() == 1 and "加到主畫面" in txt(A, ".a2hs"), "iPhone Safari student sees the add-to-home-screen card")
    A.click('[data-a2hs="how"]')
    A.wait_for_selector(".sheet .plan")
    check("6 碼代碼" in txt(A, ".sheet") and "身分選「學生」" in txt(A, ".sheet"), "how-to explains re-joining with the 6-digit code (as 學生)")
    check(A.evaluate("document.querySelector('.sheet .plan svg').getBoundingClientRect().width") < 30, "the share icon in the how-to is text-sized")
    A.keyboard.press("Escape")
    time.sleep(0.4)
    A.click('[data-a2hs="later"]')
    check(A.locator(".a2hs").count() == 0, "之後再說 hides the card")
    A.reload()
    A.wait_for_selector(".home")
    check(A.locator(".a2hs").count() == 0, "…and it stays hidden for a week")
    A.screenshot(path=str(OUT / "safety-student.png"))
    ctx.close()
    # 沒加入老師後台的學生（iPhone Safari）：不出現（紀錄只在 Safari，換到主畫面會像不見了）
    ctx2 = b.new_context(viewport={"width": 390, "height": 844}, user_agent=IPHONE_UA, has_touch=True)
    ctx2.add_init_script(SEED)
    U = ctx2.new_page()
    U.goto(URL)
    U.wait_for_selector(".home")
    check(U.locator(".a2hs").count() == 0, "a student who never joined does not get the card")
    ctx2.close()
    # 家長（iPhone Safari）：學習進度最上面有卡片，說明寫身分選「家長」
    ctx3 = b.new_context(viewport={"width": 390, "height": 844}, user_agent=IPHONE_UA, has_touch=True)
    ctx3.add_init_script(SEED)
    P = ctx3.new_page()
    P.goto(link(code, "parent", amy))
    wait_until(lambda: st(P) == "member")
    P.goto(URL + "#/live/home")
    P.wait_for_selector(".parent-prog")
    time.sleep(0.6)
    if P.locator(".sheet-wrap").count():
        P.keyboard.press("Escape")
        time.sleep(0.4)
    check(P.locator(".a2hs").count() == 1, "parent sees the card on 學習進度")
    P.click('[data-a2hs="how"]')
    P.wait_for_selector(".sheet .install-tip")
    check("身分選「家長」" in txt(P, ".sheet"), "parent how-to says choose 家長")
    ctx3.close()
    # 電腦的學生、老師：不出現
    D = page(b, 1280, 800, "D")
    D.goto(URL)
    D.wait_for_selector(".home")
    check(D.locator(".a2hs").count() == 0, "no add-to-home-screen card on a desktop browser")
    T.goto(URL + "#/")
    time.sleep(0.5)
    check(T.locator(".a2hs").count() == 0, "teacher never sees the card")
    b.close()
report()
