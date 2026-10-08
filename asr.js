// 網頁裡的語音辨識（口說練習用）：Moonshine tiny（MIT 授權）＋ transformers.js（Apache 2.0）
// 好處：沒有手機語音辨識的提示音、不會跟錄音搶麥克風、主畫面 App 和 LINE 裡也能用
// 模型第一次用的時候下載，之後存在瀏覽器裡（transformers-cache）
// 2.14.1：有 WebGPU（iOS 26+、新的 Android／桌機）就用 GPU 算，比 CPU 快很多、手機不會燙；沒有或失敗就退回 CPU（wasm、q8 約 28MB）
const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1'
const MODEL = 'onnx-community/moonshine-tiny-ONNX'

let loading = null
export const ASR = {
  ready: false,
  progress: 0, // 0～1
  device: '', // 'webgpu' 或 'wasm'（載入好才知道）
  listeners: new Set(),
  // 下載＋載入模型（只做一次；失敗的話下次再試）
  load() {
    return (loading ||= (async () => {
      const { pipeline, env } = await import(LIB)
      env.allowLocalModels = false
      const got = {}
      const tot = {}
      const progress_callback = (p) => {
        if (p.status !== 'progress' || !p.file) return
        got[p.file] = p.loaded || 0
        tot[p.file] = p.total || tot[p.file] || 0
        const T = Object.values(tot).reduce((s, n) => s + n, 0)
        this.progress = T ? Math.min(0.99, Object.values(got).reduce((s, n) => s + n, 0) / T) : 0
        this.listeners.forEach((f) => f(this.progress))
      }
      const tries = []
      if (navigator.gpu && !(localStorage.getItem('g7review:asr') === 'wasm')) tries.push({ device: 'webgpu', dtype: 'fp16' }, { device: 'webgpu', dtype: 'fp32' })
      tries.push({ device: 'wasm', dtype: 'q8' })
      let pipe = null
      let lastErr = null
      for (const opt of tries) {
        try {
          pipe = await pipeline('automatic-speech-recognition', MODEL, { ...opt, progress_callback })
          // 真的跑一次短音檔，確定這個裝置的 GPU 算得出來（有些裝置能載入卻算不出來）
          await pipe(new Float32Array(16000))
          this.device = opt.device
          break
        } catch (e) {
          lastErr = e
          pipe = null
        }
      }
      if (!pipe) throw lastErr || new Error('asr-load')
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
