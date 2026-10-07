// 網頁裡的語音辨識（口說練習用）：Moonshine tiny（MIT 授權）＋ transformers.js（Apache 2.0）
// 好處：沒有手機語音辨識的提示音、不會跟錄音搶麥克風、主畫面 App 和 LINE 裡也能用
// 模型約 28MB，第一次用的時候下載，之後存在瀏覽器裡（transformers-cache）
const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1'
const MODEL = 'onnx-community/moonshine-tiny-ONNX'
const TOTAL = 28.6e6 // 模型檔案大約的總大小（進度條用）

let loading = null
export const ASR = {
  ready: false,
  progress: 0, // 0～1
  listeners: new Set(),
  // 下載＋載入模型（只做一次；失敗的話下次再試）
  load() {
    return (loading ||= (async () => {
      const { pipeline, env } = await import(LIB)
      env.allowLocalModels = false
      const got = {}
      const pipe = await pipeline('automatic-speech-recognition', MODEL, {
        dtype: 'q8',
        device: 'wasm',
        progress_callback: (p) => {
          if (p.status !== 'progress' || !p.file) return
          got[p.file] = p.loaded || 0
          this.progress = Math.min(0.99, Object.values(got).reduce((s, n) => s + n, 0) / TOTAL)
          this.listeners.forEach((f) => f(this.progress))
        },
      })
      this.ready = true
      this.progress = 1
      this.listeners.forEach((f) => f(1))
      return pipe
    })().catch((e) => {
      loading = null
      throw e
    }))
  },
  // pcm：16000 Hz 單聲道 → 文字（沒聽到話會是空字串）
  async transcribe(pcm) {
    const pipe = await this.load()
    const r = await pipe(pcm)
    return String(r?.text || '').trim()
  },
}
