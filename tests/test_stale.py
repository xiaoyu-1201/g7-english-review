"""2.22.8 成員管理：很久沒上線的裝置標出來，一鍵重傳加入連結（暫停加入時先問要不要打開）"""
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
    P = page(b, 390, 844, "P")
    P.goto(link(code, "parent", amy))
    wait_until(lambda: st(P) == "member")
    time.sleep(1.2)
    A.context.close()  # 學生的頁面開著會一直回報上線時間
    time.sleep(1.2)
    # 學生那台：最後上線改成 12 天前（家長那台是剛剛）
    live = http("GET", f"/classes/{code}/live/{amy}.json")[1] or {}
    for k, v in live.items():
        if v.get("role") != "parent":
            http("PATCH", f"/classes/{code}/live/{amy}/{k}.json", {"ts": int(time.time() * 1000) - 12 * 86400000, "view": "away"})
            check(wait_until(lambda: (http("GET", f"/classes/{code}/live/{amy}/{k}/ts.json")[1] or 0) < time.time() * 1000 - 11 * 86400000), "the 12-days-ago time stuck (not overwritten by a late presence update)")
    T.goto(URL + "#/manage")
    T.wait_for_selector(".manage-page")
    check(wait_until(lambda: "12 天沒上線" in txt(T, ".manage-page"), 10), "the student's device is marked 12 天沒上線")
    check("1 台裝置很久沒上線" in txt(T, ".mg-stale-card"), f"summary card at the top ({txt(T, '.mg-stale-card')[:40] if T.locator('.mg-stale-card').count() else '-'})")
    check(T.locator("[data-resend]").count() == 1, "only the stale device gets 重傳加入連結 (the parent was just here)")
    T.screenshot(path=str(OUT / "stale-manage.png"), full_page=True)
    T.set_viewport_size({"width": 390, "height": 844})
    time.sleep(0.4)
    T.screenshot(path=str(OUT / "stale-manage-phone.png"), full_page=True)
    check(T.evaluate("document.documentElement.scrollWidth") <= 390, "phone: no sideways scroll on 成員管理")
    T.set_viewport_size({"width": 820, "height": 1180})
    # 開放加入中：直接打開「傳給 Amy」，選好「學生用」
    T.click("[data-resend]")
    T.wait_for_selector(".sheet .share-grid")
    check("傳給 Amy" in txt(T, ".sheet") and T.locator('#sh-role [data-r="student"].on').count() == 1, "resend opens the share sheet for Amy (學生用)")
    T.keyboard.press("Escape")
    time.sleep(0.5)
    # 暫停加入：先問要不要打開；按了之後真的打開、再出現分享視窗
    T.click('#open-seg [data-open="0"]')
    check(wait_until(lambda: http("GET", f"/classes/{code}/open.json")[1] is False), "joining paused")
    T.wait_for_selector('#open-seg [data-open="0"].on')
    T.click("[data-resend]")
    T.wait_for_selector(".sheet")
    check("先打開「開放加入」" in txt(T, ".sheet"), "paused: asks to open joining first")
    T.click(".sheet .btn.primary, .sheet [data-ok]")
    check(wait_until(lambda: http("GET", f"/classes/{code}/open.json")[1] is True), "confirm turns joining back on")
    check(wait_until(lambda: T.locator(".sheet .share-grid").count() == 1, 5), "…and then shows the share sheet")
    T.keyboard.press("Escape")
    time.sleep(0.5)
    check(T.locator('#open-seg [data-open="1"].on').count() == 1, "the 開放加入 switch shows 開 right away")
    b.close()
report()
