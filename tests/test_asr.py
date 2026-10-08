"""網頁裡的語音辨識（2.10）：沒有手機提示音的辨識方式。
用 Kokoro 念的英文（fixtures/pencils.wav）當成麥克風的聲音，跑完整流程：錄音 → 只留講話那段 → 模型辨識 → 打分。
第一次跑要從 Hugging Face 下載模型（約 28MB），存在 tests/.cache/asr-profile，之後就不用再下載。"""
import pathlib, time
from playwright.sync_api import sync_playwright
from synchelp import *

HERE = pathlib.Path(__file__).parent
WAV = HERE / "fixtures" / "pencils.wav"
PROFILE = HERE / ".cache" / "asr-profile"
ARGS = [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    f"--use-file-for-fake-audio-capture={WAV}",
    "--autoplay-policy=no-user-gesture-required",
]
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(str(PROFILE), channel="msedge", args=ARGS, viewport={"width": 390, "height": 844})
    ctx.add_init_script(SEED)
    A = ctx.pages[0] if ctx.pages else ctx.new_page()
    A.on("pageerror", lambda e: errors.append(f"A pageerror: {e}"))
    # 設定檔是沿用的（模型才不用每次重新下載），但 HTTP 快取要清掉，不然會拿到舊的程式
    ctx.new_cdp_session(A).send("Network.clearBrowserCache")
    A.goto(URL + "#/speak")
    A.wait_for_selector(".speak-intro")
    check(A.evaluate("window.__app.speakEngine()") == "local", "default engine is the in-page recognizer (no beep)")
    # 第一次：先問要不要下載（使用者的網路有流量上限），按「下載」才開始
    if A.locator("[data-act=asrdl]").count():
        check("MB" in txt(A, ".sp-eng-desc"), "first visit asks before downloading and shows the size")
        A.click("[data-act=asrdl]")
        A.wait_for_selector(".sheet [data-ok]")
        A.click(".sheet [data-ok]")
        A.wait_for_selector(".speak-intro")
    check(A.evaluate("localStorage.getItem('g7review:asrok')") == "1", "download consent remembered")
    check(A.locator("#sp-eng").count() == 0, "no engine switch on the intro (downloads in the background)")
    check(wait_until(lambda: A.evaluate("window.__app.asrReady()"), 240), "model downloaded and ready in the background")
    check(A.evaluate("window.__app.engineNow()") == "local", "mic uses the in-page recognizer once ready (never the beeping one)")
    dev = A.evaluate("(async () => (await import('./asr.js')).ASR.device)()")
    print("asr device", dev, "webgpu available:", A.evaluate("!!navigator.gpu"))
    check(dev in ("webgpu", "wasm"), f"model runs on {dev}")
    # 直接跑一次：假的麥克風念 "Those are my pencils."
    t0 = time.time()
    heard = A.evaluate("""async () => {
      const L = await window.__app.listenLocal()
      const r = await L.done
      return { alts: r.alts, err: r.err, blob: !!r.blob }
    }""")
    print("heard", heard, round(time.time() - t0, 1), "s")
    check(bool(heard["alts"]), "something was recognized")
    check(A.evaluate("(t) => window.__app.speakScore('Those are my pencils.', [t]).score", heard["alts"][0] if heard["alts"] else "") == 100, "recognized sentence scores 100")
    check(heard["blob"], "recording kept (no fight over the mic)")
    # 介面：開始 → 按麥克風 → 出現分數（句子是隨機的，分數不一定高，只看流程）
    A.click("[data-act=go]")
    A.wait_for_selector(".sp-card")
    A.click("[data-act=mic]")
    check(wait_until(lambda: A.locator(".sp-score").count() == 1, 30), "UI flow shows a score")
    check(A.locator('[data-act="mine"]').count() == 1, "student can play own recording")
    A.locator("[data-act=close]").click()
    # 強制走 CPU（wasm）那條路也要能辨識（沒有 WebGPU 的手機）
    A.evaluate("localStorage.setItem('g7review:asr', 'wasm')")
    A.goto(URL + "#/speak")
    A.reload()  # 模型是整頁只載入一次，要重新整理才會走 wasm
    A.wait_for_selector(".speak-intro")
    check(wait_until(lambda: A.evaluate("window.__app.asrReady()"), 240), "wasm fallback loads")
    dev2 = A.evaluate("(async () => (await import('./asr.js')).ASR.device)()")
    heard2 = A.evaluate("""async () => { const L = await window.__app.listenLocal(); const r = await L.done; return r.alts }""")
    check(dev2 == "wasm" and bool(heard2), f"wasm fallback recognizes ({dev2}: {heard2})")
    # 沒有 ScriptProcessor 的路：用 AnalyserNode 量音量、錄音檔解碼成 PCM，也要能辨識；錄完麥克風要放掉
    A.evaluate("localStorage.setItem('g7review:noproc', '1')")
    A.reload()
    A.wait_for_selector(".speak-intro")
    wait_until(lambda: A.evaluate("window.__app.asrReady()"), 240)
    heard3 = A.evaluate("""async () => { const L = await window.__app.listenLocal(); const r = await L.done; return { alts: r.alts, err: r.err, blob: !!r.blob } }""")
    print("noproc path", heard3)
    check(bool(heard3["alts"]) and A.evaluate("(t) => window.__app.speakScore('Those are my pencils.', [t]).score", heard3["alts"][0] if heard3["alts"] else "") == 100, f"analyser + decode fallback recognizes {heard3}")
    check(A.evaluate("window.__app.micsOpen()") == 0, "microphone released after recording")
    A.evaluate("localStorage.removeItem('g7review:noproc'); localStorage.removeItem('g7review:asr')")
    ctx.close()
report()
