"""2.26 每課單字：首頁每課一張「單字」卡；單字頁有分組、六種玩法（認識字彙三種）；
單字卡翻面、記得了；配對消除全部配完；聽音選字、句子填空、拼字走一般的練習（答錯進錯題本）；拼字可以改成打字"""
import time
from playwright.sync_api import sync_playwright
from synchelp import *

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge")
    P = page(b, 390, 844, "vocab")
    P.goto(URL)
    P.wait_for_selector(".home")
    cards = P.locator(".vocab-mod")
    check(cards.count() >= 3, f"home: a 單字 card per open unit ({cards.count()})")
    check("新" in cards.first.inner_text(), "the 單字 card is marked 新")
    cards.nth(1).click()  # Unit 1
    P.wait_for_selector(".vocab .vg-card")
    check(P.evaluate("location.hash").startswith("#/vocab/"), "opens the unit vocab page")
    n_groups = P.locator(".vg-card").count()
    check(n_groups >= 3, f"groups by section ({n_groups})")
    check(P.locator(".vg-card").first.locator(".vg-mode").count() == 6, "a normal group has 6 modes")
    P.click('[data-vlist]')
    check(P.locator(".vg-words:not([hidden]) .vg-word").count() >= 5, "看單字 expands the word list")
    # 認識字彙：Unit 3 才有 → 直接開 Unit 3 看（老師裝置：全部開放；這裡用 old-link-less 學生，Unit 3 沒開放會被擋）
    # 單字卡：翻面、記得了（這一組每張都按記得了 → 結果頁）
    P.click('[data-vm$=":cards"]')
    P.wait_for_selector(".vcard")
    total = int(P.locator(".run-count").inner_text().split("／")[1].split(" ")[0])
    for i in range(total):
        P.click(".vcard")
        time.sleep(0.15)
        check(P.locator(".vcard.flipped").count() == 1, "card flips") if i == 0 else None
        P.click('[data-act="ok"]')
        time.sleep(0.15)
    P.wait_for_selector(".vocab-sum")
    check("／" in P.locator(".vsum-big").inner_text(), "flashcards summary shows remembered／total")
    check(P.evaluate("Object.keys(JSON.parse(localStorage.getItem('g7review:v1')).vocab.w).length") >= total, "記得了 is saved per word")
    check(P.evaluate("JSON.parse(localStorage.getItem('g7review:v1')).sessions.some(s => s.k.startsWith('vocab:') && s.k.endsWith(':cards'))"), "a vocab:…:cards session is recorded")
    # 配對消除：照 data-k 配對，全部消完 → 結果頁有秒數
    P.click('[data-vm$=":match"]')
    P.wait_for_selector(".vm-tile")
    for _ in range(6):  # 最多幾回合
        if P.locator(".vocab-sum").count():
            break
        keys = P.evaluate("[...new Set([...document.querySelectorAll('.vm-tile:not(.gone)')].map(t => t.dataset.k))]")
        for k in keys:
            P.click(f'.vm-tile.en[data-k="{k}"]:not(.gone)')
            P.click(f'.vm-tile:not(.en)[data-k="{k}"]:not(.gone)')
            time.sleep(0.05)
        time.sleep(0.9)
    P.wait_for_selector(".vocab-sum", timeout=8000)
    check("秒" in P.locator(".vsum-big").inner_text(), "match summary shows seconds")
    check(P.evaluate("!!JSON.parse(localStorage.getItem('g7review:v1')).vocab.best") and P.evaluate("Object.keys(JSON.parse(localStorage.getItem('g7review:v1')).vocab.best).length") == 1, "best time saved for the group")
    # 聽音選字：走一般的練習；故意答錯一題 → 錯題本
    P.click('[data-vm$=":listen"]')
    P.wait_for_selector(".run .t-mcq")
    check(P.locator(".run .audio [data-play]").count() >= 1, "listen item has a play button")
    check(P.locator('[data-act="notes"]').count() == 0, "no 重點 button for vocab runs")
    it_id = P.locator(".qcard").get_attribute("data-id")
    a = P.evaluate(f"window.__app ? null : null")
    # 選一個不對的：透過 opt-text 比對 ITEM 不可得，改成點第一個再看對錯；錯了就達成目的，對了再做下一題直到錯一次
    wrong = False
    for _ in range(6):
        P.click('.opts .opt:enabled >> nth=0')
        P.click('[data-act="check"]')
        time.sleep(0.4)
        if P.locator(".opt.bad").count():
            wrong = True
            break
        if P.locator('[data-act="check"]:enabled').count():
            P.click('[data-act="check"]')
            time.sleep(0.4)
        if not P.locator(".run .t-mcq").count():
            break
    check(wrong, "a wrong listen answer is marked")
    check(P.evaluate("JSON.parse(localStorage.getItem('g7review:v1')).attempts.some(a => a.q.startsWith('vl:') && a.r !== 'ok')"), "wrong vocab answers go into attempts (錯題本)")
    # 拼字方塊：點字母拼出；再改用打字
    P.goto(URL + "#/vocab/" + "Unit%201")
    P.wait_for_selector(".vg-card")
    P.click('[data-vm$=":spell"]')
    P.wait_for_selector(".run .t-spell")
    ans = P.evaluate("document.querySelector('.qcard') && window.__ans ? '' : ''")
    tiles = P.locator(".spell-tile")
    n = tiles.count()
    check(n >= 2, f"spell: letter tiles ({n})")
    # 照正確順序點：答案在 ITEM 裡（測試用的全域沒有），改用題目卡的 data-id 查：vs:<key> → 從 slot 數量推不出來；直接點全部再檢查，只驗證流程
    for i in range(n):
        P.click(".spell-tile >> nth=0")
    check(P.locator('[data-act="check"]:enabled').count() == 1, "spell: all tiles placed → 檢查 enabled")
    P.click(".spell-slot.on >> nth=0")
    check(P.locator(".spell-tile").count() == 1, "spell: tapping a filled slot returns the letter")
    P.click(".spell-toggle")
    check(P.locator(".spell-in").count() == 1, "spell: switch to typing")
    P.fill(".spell-in", "xyz")
    P.click('[data-act="check"]')
    time.sleep(0.4)
    check(P.locator(".spell-fix .fix").count() == 1, "spell: wrong → shows the correct spelling")
    check(P.evaluate("JSON.parse(localStorage.getItem('g7review:v1')).profile.spellType") == "type", "spell typing mode remembered")
    # 句子填空：有挖空
    P.goto(URL + "#/vocab/" + "Unit%201")
    P.wait_for_selector(".vg-card")
    P.click('[data-vm$=":fill"]')
    P.wait_for_selector(".run .t-mcq")
    check(P.locator(".q-text .gap").count() >= 1, "fill item has a blank in the sentence")
    P.screenshot(path=str(OUT / "vocab-fill.png"))
    b.close()
report()
