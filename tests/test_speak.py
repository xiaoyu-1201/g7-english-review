"""口說練習：比對規則、看字跟讀、不看字（練聽力）、老師課堂檢視、紀錄同步。
語音辨識用假的（window.__say ＝ 學生「說」的話），因為自動測試沒辦法真的講話。"""
import time
from playwright.sync_api import sync_playwright
from synchelp import *

MOCK_SR = """
(() => {
  class FakeSR {
    start() {
      setTimeout(() => {
        const t = window.__say
        // 搶麥克風：錄音開著的時候，辨識什麼都沒收到、也不報錯就結束（iPhone、iPad 的樣子）
        if (window.__clash && localStorage.getItem('g7review:norec') !== '1') { this.onend && this.onend(); return }
        if (!t) { this.onerror && this.onerror({ error: 'no-speech' }); this.onend && this.onend(); return }
        const res = [{ transcript: t }]
        res.isFinal = true
        this.onresult && this.onresult({ results: [res] })
        this.onend && this.onend()
      }, 300)
    }
    stop() {}
    abort() {}
  }
  window.SpeechRecognition = FakeSR
  window.webkitSpeechRecognition = FakeSR
  // 這個測試測的是「手機內建辨識」那條路（網頁裡的辨識在 test_asr）
  try {
    const s = JSON.parse(localStorage.getItem('g7review:v1') || '{}')
    s.profile = { ...(s.profile || {}), speakEngine: 'sr' }
    localStorage.setItem('g7review:v1', JSON.stringify(s))
  } catch {}
})();
"""

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"])
    T, code = make_teacher(b)
    amy = add_student(T, "Amy")
    A = page(b, 390, 844, "Amy", seed=SEED + MOCK_SR)
    A.goto(link(code, "student", amy))
    wait_until(lambda: st(A) == "member")
    # 比對規則：縮寫、數字、漏字
    sc = lambda target, heard: A.evaluate("([t, h]) => window.__app.speakScore(t, [h]).score", [target, heard])
    check(sc("He's my cousin, Kevin.", "he is my cousin Kevin") == 100, "contraction expanded")
    check(sc("I am thirteen years old.", "I am 13 years old") == 100, "digits match words")
    check(sc("My aunt is thirty.", "my aunt is thirteen") < 100, "thirteen vs thirty is caught")
    check(sc("Those boxes are heavy.", "those box are heavy") < 100, "missing plural ending is caught")
    # 不該扣分的：同音字、縮寫寫法、稱謂寫法、人名
    check(sc("They're in the box.", "there in the box") == 100, "they're = there (homophone)")
    check(sc("They are my uncle and aunt.", "they're my uncle and ant") == 100, "they are = they're, aunt = ant")
    check(sc("Good morning, Mr. Lee.", "good morning mister Li") == 100, "Mr. = mister, names not scored")
    check(sc("Who's that handsome boy?", "whose that handsome boy") == 100, "who's = whose")
    check(sc("Her name is Sandy.", "her name is Sandie") == 100, "name spelling ignored")
    check(sc("He's my cousin, Kevin.", "his my cousin Kevin") < 100, "he's vs his still caught")
    check(sc("Is that your bag?", "is that your back") < 100, "bag vs back still caught")
    # 全部 44 句：辨識結果是「小寫、沒標點、縮寫展開、數字用阿拉伯數字」也要 100 分
    bad = A.evaluate("""async () => {
      const { SPEAK } = await import('./content.js')
      const exp = { "what's": 'what is', "who's": 'who is', "it's": 'it is', "he's": 'he is', "she's": 'she is', "that's": 'that is', "i'm": 'i am', "they're": 'they are', "isn't": 'is not', "aren't": 'are not' }
      const nums = { thirteen: '13', thirty: '30', seventy: '70', five: '5', fourteen: '14' }
      const out = []
      for (const [en] of Object.values(SPEAK).flat()) {
        const said = en.toLowerCase().replace(/[.,!?]/g, '').split(' ').map((w) => exp[w] || nums[w] || w).join(' ')
        const a = window.__app.speakScore(en, [en]).score
        const b = window.__app.speakScore(en, [said]).score
        if (a !== 100 || b !== 100) out.push(en + ' => ' + a + '/' + b + ' (' + said + ')')
      }
      return out
    }""")
    check(not bad, f"all 44 sentences score 100 when read correctly {bad}")
    # 首頁入口
    A.goto(URL)
    A.wait_for_selector(".qk-speak")
    check("練聽力" in txt(A, ".qk-speak"), "home tile mentions listening")
    T.goto(URL + "#/watch/" + amy)
    T.wait_for_selector(".watch-page")
    # 看字跟讀
    A.click(".qk-speak")
    A.wait_for_selector(".speak-intro")
    A.click('#sp-unit [data-u="Unit 2"]')
    A.click('#sp-mode [data-m="read"]')
    time.sleep(0.3)
    A.screenshot(path=str(OUT / "d1-speak-intro.png"))
    A.click("[data-act=go]")
    A.wait_for_selector(".sp-card")
    s1 = txt(A, ".sp-en")
    # 「聽」播的是事先做好的自然語音音檔
    check(A.evaluate("(t) => !!window.__app.AudioLib.find([['W', t]])", s1), "speaking sentence has natural audio file")
    A.click('[data-act="play"]')
    check(wait_until(lambda: A.evaluate("() => { const a = window.__app.AudioLib.el; return !!a && a.src.includes('/audio/') }")), "play uses audio file")
    check(A.evaluate("() => { const I = window.__app.ITEM; return Object.values(I).filter((i) => i.audio).every((i) => window.__app.AudioLib.find(typeof i.audio === 'string' ? [['W', i.audio]] : i.audio)) }"), "every listening question has audio files")
    check(wait_until(lambda: s1 in txt(T, ".watch-sp .sp-en")), "teacher sees the sentence being practiced")
    A.evaluate("(t) => window.__say = t", s1)
    A.click("[data-act=mic]")
    check(wait_until(lambda: A.locator(".sp-score").count() == 1 and "100" in txt(A, ".sp-score")), "full sentence scores 100")
    check(wait_until(lambda: "100 分" in txt(T, ".watch-sp .wq-h")), "teacher sees 100 分")
    check(wait_until(lambda: A.locator('[data-act="mine"]').count() == 1), "student can play own recording")
    check(wait_until(lambda: T.locator(".watch-sp [data-rec]").count() == 1, 12), "teacher watch can play student's recording")
    A.click("[data-act=next]")
    A.wait_for_selector(".sp-card")
    s2 = txt(A, ".sp-en")
    part = " ".join(s2.split()[:-2])
    A.evaluate("(t) => window.__say = t", part)
    A.click("[data-act=mic]")
    check(wait_until(lambda: A.locator(".spw.miss").count() >= 1), "missed words marked red")
    check(A.locator(".sp-result .chip.say").count() >= 1, "missed words can be played")
    check(wait_until(lambda: T.locator(".watch-sp .spw.miss").count() >= 1), "teacher sees missed words")
    time.sleep(0.3)
    A.screenshot(path=str(OUT / "d2-speak-result.png"))
    T.screenshot(path=str(OUT / "d3-watch-speak.png"))
    # 再說一次：分數取最高
    A.evaluate("(t) => window.__say = t", s2)
    A.click("[data-act=mic]")
    check(wait_until(lambda: "100" in txt(A, ".sp-score")), "retry speaking improves score")
    # 錄音搶走麥克風（辨識收不到、不報錯）→ 自動改成只辨識，再按一次就能給分
    A.click("[data-act=next]")
    A.wait_for_selector(".sp-card")
    s4 = txt(A, ".sp-en")
    A.evaluate("(t) => { window.__say = t; window.__clash = true }", s4)
    A.click("[data-act=mic]")
    check(wait_until(lambda: "已經調整好" in txt(A, "#toast")), "mic clash detected")
    check(A.evaluate("localStorage.getItem('g7review:norec')") == "1", "switched to recognition only")
    time.sleep(0.5)
    A.click("[data-act=mic]")
    check(wait_until(lambda: A.locator(".sp-score").count() == 1 and "100" in txt(A, ".sp-score")), "scores after clash fix")
    # 沒聽到聲音（只辨識）
    A.click("[data-act=next]")
    A.wait_for_selector(".sp-card")
    A.evaluate("() => window.__say = ''")
    A.click("[data-act=mic]")
    check(wait_until(lambda: "沒有聽到聲音" in txt(A, "#toast")), "no-speech message")
    # 念到一半按「跳過」：這次的分數不能記到下一句
    time.sleep(0.4)
    A.evaluate("() => window.__say = document.querySelector('.sp-en').textContent")
    A.click("[data-act=mic]")
    A.click("[data-act=skip]")
    time.sleep(0.9)
    check(A.locator(".sp-score").count() == 0, "skip while listening: score not moved to next sentence")
    # 跳過剩下的 → 結果
    for _ in range(8):
        if A.locator(".speak-sum").count():
            break
        A.locator("[data-act=skip], [data-act=next]:not([disabled])").first.click()
        time.sleep(0.2)
    A.wait_for_selector(".speak-sum")
    check("100" in txt(A, ".sp-sum-head"), "summary average from spoken sentences")
    check(wait_until(lambda: T.evaluate(f"window.__app.Sync.sessionsOf('{amy}').some(s => s.k === 'speak')")), "speaking session synced to teacher")
    # 不看字（練聽力）
    A.goto(URL)
    A.wait_for_selector(".home")
    A.goto(URL + "#/speak")
    A.wait_for_selector(".speak-intro")
    A.click('#sp-mode [data-m="blind"]')
    check("段考聽力" in txt(A, ".sp-mode-desc"), "blind mode explains listening")
    A.click("[data-act=go]")
    A.wait_for_selector(".sp-hidden")
    check(A.locator(".sp-zh").inner_text().find("先聽") >= 0, "blind mode hides sentence and meaning")
    time.sleep(0.3)
    A.screenshot(path=str(OUT / "d4-speak-blind.png"))
    sent = A.evaluate("() => window.__app.speakScore ? document.querySelector('.sp-hidden').getAttribute('aria-label') : ''")
    A.click("[data-act=peek]")
    A.wait_for_selector(".sp-card .sp-en:not(.sp-hidden)")
    s3 = txt(A, ".sp-en")
    check(len(s3) > 3, "看字 reveals the sentence")
    A.evaluate("(t) => window.__say = t", s3)
    A.click("[data-act=mic]")
    check(wait_until(lambda: A.locator(".sp-score").count() == 1), "blind mode scores after speaking")
    A.click("[data-act=next]")
    A.wait_for_selector(".sp-hidden")
    A.evaluate("() => window.__say = 'hello there'")
    A.click("[data-act=mic]")
    check(wait_until(lambda: A.locator(".sp-hidden").count() == 0 and A.locator(".spw").count() >= 1), "speaking reveals the sentence with marks")
    # 老師、家長的錄音清單
    T.goto(URL + "#/student/" + amy)
    T.wait_for_selector(".rec-card [data-loadrec]")
    T.click(".rec-card [data-loadrec]")
    check(wait_until(lambda: T.locator(".rec-card [data-rec]").count() >= 1), "teacher lists recordings")
    stok = tok_of(A)
    check(http("GET", f"/recs/{code}/{amy}.json?auth={stok}")[0] == 200, "student reads own recordings")
    X = page(b, 390, 844, "X")
    X.goto(URL)
    X.wait_for_selector(".home")
    xt = X.evaluate("window.__app.Auth.token()")
    check(http("GET", f"/recs/{code}/{amy}.json?auth={xt}")[0] == 401, "stranger cannot read recordings")
    # 念到一半按 ✕：回首頁，不會被拉回口說
    A.evaluate("() => window.__say = 'hello'")
    A.click("[data-act=mic]")
    A.locator("[data-act=close]").click()
    time.sleep(0.9)
    check(A.locator(".speak-run").count() == 0 and A.evaluate("location.hash") in ("", "#/"), "close while listening stays home")
    # 跟自己比有口說
    A.goto(URL + "#/stats")
    check(wait_until(lambda: "口說最高" in txt(A, ".self-rec")), "self record shows speaking best")
    b.close()
report()
