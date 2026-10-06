"""會考導向：圖表題組（卡片／公告／訊息）、題型標籤、考點、選項解析、模擬段考配分、列印"""
import time
from playwright.sync_api import sync_playwright
from synchelp import *

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge")
    A = page(b, 390, 844, "A")
    A.goto(URL)
    A.wait_for_selector(".home")
    check(A.locator('[data-mod="k1"]').count() == 1 and A.locator('[data-mod="k2"]').count() == 1 and A.locator('[data-mod="k3"]').count() == 1, "home lists 會考 modules")
    # 圖表題組：先觀念卡，再到表格卡片的題目
    A.click('[data-mod="k2"]')
    A.wait_for_selector(".t-learn")
    A.click('.opt[data-i="1"]')
    A.click("[data-act=check]")
    A.wait_for_selector(".pv-card")
    check("Ruby Lin" in txt(A, ".pv-card"), "card table rendered")
    check("圖表題組" in txt(A, ".q-meta"), "question tagged 圖表題組")
    # 故意答錯 → 考點＋選項解析＋標出選的那個
    right = A.evaluate("window.__app.ITEM[document.querySelector('.qcard').dataset.id].a")
    A.click(f'.opt[data-i="{(right + 2) % 4}"]')
    A.click("[data-act=check]")
    A.wait_for_selector(".fb-kp")
    check("考點" in txt(A, ".fb-kp"), "feedback shows 考點")
    check(A.locator(".fb-why li").count() == 4, "option analysis lists all 4 options")
    check(A.locator(".fb-why li.mine").count() == 1 and A.locator(".fb-why li.ok").count() == 1, "analysis marks chosen and correct")
    time.sleep(0.3)
    A.screenshot(path=str(OUT / "e1-card-why.png"), full_page=True)
    # 公告、訊息
    for _ in range(12):
        A.click("[data-act=check]") if A.locator('[data-act=check]:not([disabled])').count() and A.locator(".qcard.done").count() else None
        A.wait_for_selector(".qcard")
        if A.locator(".pv-chat").count():
            break
        if A.locator(".qcard.done").count() == 0:
            i = A.evaluate("window.__app.ITEM[document.querySelector('.qcard').dataset.id].a")
            A.click(f'.opt[data-i="{i}"]')
            A.click("[data-act=check]")
    check(A.locator(".pv-chat .pv-msg.me").count() >= 1, "chat bubbles rendered (me on right)")
    time.sleep(0.3)
    A.screenshot(path=str(OUT / "e2-chat.png"), full_page=True)
    A.click("[data-act=close]")
    # 會考聽力：言談理解標籤
    A.click('[data-mod="k3"]')
    A.wait_for_selector(".t-learn")
    A.click('.opt[data-i="1"]')
    A.click("[data-act=check]")
    A.wait_for_selector(".t-mcq")
    check("辨識句意" in txt(A, ".q-meta"), "listening tagged 辨識句意")
    A.click("[data-act=close]")
    # 模擬段考：7 大題、配分 100、有圖表題組
    A.goto(URL + "#/exam")
    A.click("[data-act=start]")
    A.wait_for_selector(".exam-paper .qcard")
    hs = A.locator(".exam-h h2").all_inner_texts()
    check(len(hs) == 7, f"exam has 7 sections ({len(hs)})")
    pts = sum(int(h.split("（")[1].split(" 分")[0]) for h in hs if "（" in h)
    check(pts == 100, f"exam points total 100 ({pts})")
    check(A.locator(".exam-paper .pv-card, .exam-paper .pv-notice, .exam-paper .pv-chat").count() == 1, "exam includes a chart set")
    lt = A.locator(".exam-group").first.locator(".q-meta").all_inner_texts()
    check(any("言談理解" in t for t in lt) and any("基本問答" in t for t in lt), "listening has 基本問答 and 言談理解")
    # 空白交卷 → 0 分（依配分計算）
    A.click("[data-act=submit]")
    A.wait_for_selector(".sheet .chk")
    for c in A.locator(".sheet .chk").all():
        c.click()
    A.click(".sheet [data-go]")
    A.wait_for_selector(".exam-result")
    check(txt(A, ".er-score b") == "0", "blank exam scores 0 with weighted points")
    # 列印：會考題型那一堂
    A.goto(URL + "#/print/L3")
    A.wait_for_selector(".paper")
    check(A.locator(".paper .pv-card").count() == 1 and A.locator(".paper .pv-chat").count() == 1, "print includes chart passages")
    b.close()
report()
