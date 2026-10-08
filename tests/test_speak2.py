"""2.14 口說：每課句數、難度篩選、對比組（先選 A／B 再念）、問答（答案不只一種）、音檔齊全"""
import time, json, pathlib
from playwright.sync_api import sync_playwright
from synchelp import *

MOCK_SR = """
(() => {
  class FakeSR {
    start() {
      setTimeout(() => {
        const t = window.__say
        if (!t) { this.onerror && this.onerror({ error: 'no-speech' }); this.onend && this.onend(); return }
        const res = [{ transcript: t }]
        res.isFinal = true
        this.onresult && this.onresult({ results: [res] })
        this.onend && this.onend()
      }, 200)
    }
    stop() {}
    abort() {}
  }
  window.SpeechRecognition = FakeSR
  window.webkitSpeechRecognition = FakeSR
  try {
    const s = JSON.parse(localStorage.getItem('g7review:v1') || '{}')
    s.profile = { ...(s.profile || {}), speakEngine: 'sr' }
    localStorage.setItem('g7review:v1', JSON.stringify(s))
  } catch {}
})();
"""
APP = pathlib.Path(__file__).parent.parent
idx = json.loads((APP / "audio" / "index.json").read_text(encoding="utf-8"))

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"])
    T, code = make_teacher(b)
    T.goto(URL)
    T.wait_for_selector(".home")
    T.evaluate("localStorage.setItem('g7review:v1', JSON.stringify({ ...JSON.parse(localStorage.getItem('g7review:v1')), profile: { ...JSON.parse(localStorage.getItem('g7review:v1')).profile, speakEngine: 'sr' } }))")
    T.add_init_script(MOCK_SR)
    T.reload()
    T.wait_for_selector(".home")
    # 內容：每課 14 句以上、對比 5 組以上、問答 6 題以上；全部有音檔
    info = T.evaluate("""async () => {
      const m = await import('./content.js')
      const out = { units: {}, missing: [] }
      const has = (sp, t) => !!window.__app.AudioLib.idx?.[sp + '|' + t]
      for (const [u, l] of Object.entries(m.SPEAK)) {
        out.units[u] = [l.length, (m.SPEAK_PAIRS[u] || []).length, (m.SPEAK_QA[u] || []).length]
        for (const [en] of l) if (!has('W', en)) out.missing.push(en)
        for (const [a, b] of m.SPEAK_PAIRS[u] || []) { if (!has('W', a)) out.missing.push(a); if (!has('W', b)) out.missing.push(b) }
        for (const [q, ans] of m.SPEAK_QA[u] || []) { if (!has('M', q)) out.missing.push(q); for (const x of ans) if (!has('W', x)) out.missing.push(x) }
      }
      return out
    }""")
    check(all(v[0] >= 14 and v[1] >= 5 and v[2] >= 6 for v in info["units"].values()), f"each unit has enough speaking content {info['units']}")
    check(not info["missing"], f"all speaking texts have audio (missing {len(info['missing'])}: {info['missing'][:5]})")
    # 難度篩選：基礎沒有 lv3；挑戰沒有 lv1
    lv = T.evaluate("""() => {
      const S = window.__app
      return ['easy', 'std', 'hard'].map((l) => S.speakPool('all', 'read', l).map((x) => x.lv))
    }""")
    check(3 not in lv[0] and 1 not in lv[2] and len(lv[1]) > len(lv[0]), f"difficulty filters the pool (easy {len(lv[0])}, std {len(lv[1])}, hard {len(lv[2])})")
    # 問答評分：任何一個參考答案念到就 100
    sc = T.evaluate("window.__app.speakScoreAny(['Yes, she is.', \"No, she isn't.\"], ['no she is not']).score")
    check(sc == 100, f"qa accepts any reference answer ({sc})")
    sc2 = T.evaluate("window.__app.speakScoreAny(['Yes, she is.', \"No, she isn't.\"], ['yes he is']).score")
    check(sc2 < 100, f"qa still catches the wrong pronoun ({sc2})")
    # 對比組：先選 A／B，對了才念；念目標句
    T.goto(URL + "#/speak")
    T.wait_for_selector("#sp-mode")
    check(T.locator("#sp-mode button").count() == 4 and T.locator("#sp-lv button").count() == 3, "speak intro has four modes and three levels")
    T.click('#sp-mode [data-m="pair"]')
    T.click('#sp-unit [data-u="Starter"]')
    T.click("[data-act=go]")
    T.wait_for_selector(".sp-card-pair")
    check(T.locator(".sp-opt").count() == 2 and T.locator(".sp-mic").is_disabled(), "pair card shows A/B and mic waits for the pick")
    target = T.evaluate("window.__app.SP.list[0].target")
    T.click(f'.sp-opt[data-pick="{1 - target}"]')
    T.wait_for_selector(".sp-opt.bad")
    check(T.locator(".sp-opt.ok").count() == 1 and "播放的是" in txt(T, ".sp-ask") and not T.locator(".sp-mic").is_disabled(), "wrong pick is marked and the right one is highlighted")
    T.screenshot(path=str(OUT / "s1-pair.png"))
    en = T.evaluate("window.__app.SP.list[0].target ? window.__app.SP.list[0].b.en : window.__app.SP.list[0].a.en")
    T.evaluate("(t) => { window.__say = t }", en)
    T.click("[data-act=mic]")
    check(wait_until(lambda: T.locator(".sp-result:not([hidden]) .sp-score b").count() == 1 and txt(T, ".sp-result .sp-score b") == "100"), "reading the heard sentence scores 100")
    T.click("[data-act=close]")
    T.wait_for_selector(".home")
    # 問答：不看答案、回答、顯示參考答案
    T.goto(URL + "#/speak")
    T.wait_for_selector("#sp-mode")
    T.click('#sp-mode [data-m="qa"]')
    T.click('#sp-unit [data-u="Unit 1"]')
    T.click("[data-act=go]")
    T.wait_for_selector(".sp-card-qa")
    check(T.locator(".sp-ans").count() == 0 and "以英文回答" in txt(T, ".sp-ask") and T.locator("[data-act=peek]").count() == 0, "qa hides the answers and has no peek button before answering")
    # 問題要用做好的音檔播（男聲 M 的鍵），不能退回手機朗讀（靜音模式會沒聲音）
    T.evaluate("window.__played = null; window.__app.AudioLib.play = (files) => { window.__played = files; return Promise.resolve() }")
    T.click("[data-act=play]")
    check(bool(T.evaluate("window.__played")), "qa question plays a prepared audio file, not device speech")
    missing = T.evaluate("""async () => {
      const m = await import('./content.js')
      return Object.values(m.SPEAK_QA).flat().map(([q]) => q).filter((q) => !window.__app.AudioLib.find([['M', q]]))
    }""")
    check(not missing, f"every qa question resolves to an audio file {missing[:3]}")
    ans = T.evaluate("window.__app.SP.list[0].ans[1]")
    T.evaluate("(t) => { window.__say = t }", ans)
    T.click("[data-act=mic]")
    check(wait_until(lambda: T.locator(".sp-ans").count() == 1 and txt(T, ".sp-result .sp-score b") == "100"), "answering with the second reference answer scores 100 and shows it")
    T.screenshot(path=str(OUT / "s2-qa.png"))
    T.click("[data-act=next]")
    T.wait_for_selector(".sp-card-qa")
    check(T.locator(".sp-ans").count() == 0 and T.locator("[data-act=peek]").count() == 0, "next question again hides the answers")
    T.click("[data-act=close]")
    # 分數低會建議改基礎
    T.goto(URL + "#/speak")
    T.wait_for_selector("#sp-mode")
    T.click('#sp-mode [data-m="read"]')
    T.click('#sp-lv [data-lv="hard"]')
    T.click("[data-act=go]")
    T.wait_for_selector(".sp-card")
    for _ in range(3):
        T.evaluate("window.__say = 'banana'")
        T.click("[data-act=mic]")
        wait_until(lambda: T.locator(".sp-result:not([hidden])").count() == 1)
        T.click("[data-act=next]")
        time.sleep(0.2)
    for _ in range(5):
        if T.locator(".speak-sum").count():
            break
        T.click("[data-act=skip]")
        time.sleep(0.2)
    T.wait_for_selector(".speak-sum")
    check(T.locator("[data-act=easy]").count() == 1 and "高級" in txt(T, ".speak-sum h1"), "low score suggests the easy level; title shows the level")
    T.click("[data-act=easy]")
    T.wait_for_selector(".sp-card")
    check(T.evaluate("window.__app.SP.level") == "easy" and T.evaluate("window.__app.S.profile.speakLv") == "easy", "switches to easy and remembers it")
    b.close()
report()
