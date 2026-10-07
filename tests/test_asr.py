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
    A.goto(URL + "#/speak")
    A.wait_for_selector(".speak-intro")
    check(A.evaluate("window.__app.speakEngine()") == "local", "default engine is the in-page recognizer (no beep)")
    check(A.locator('#sp-eng [data-eng="local"].on').count() == 1, "engine switch shows 沒有提示音 selected")
    check(wait_until(lambda: "準備好了" in txt(A, ".sp-eng-desc"), 240), "model downloaded and ready")
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
    # 切回手機內建辨識
    A.locator("[data-act=close]").click()
    A.goto(URL + "#/speak")
    A.wait_for_selector("#sp-eng")
    A.click('#sp-eng [data-eng="sr"]')
    check(A.evaluate("window.__app.speakEngine()") == "sr" and "提示音" in txt(A, ".sp-eng-desc"), "can switch back to the built-in recognizer")
    A.click('#sp-eng [data-eng="local"]')
    ctx.close()
report()
