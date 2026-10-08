// 列出所有要做成音檔的文字：聽力（依說話的人選聲音）、口說句子、可以點來聽的單字、分類題會念的字卡、設定頁的試聽
// App 找不到音檔才會用裝置朗讀，而裝置朗讀在 iPhone 靜音模式下沒有聲音，所以會念出來的字都要列在這裡
import { MODULES, SPEAK, VOICE_SAMPLE, SPEAK_PAIRS, SPEAK_QA } from '../../content.js'
import fs from 'fs'

const lines = new Set() // "說話的人|文字"
const words = new Set()
const addWords = (s) => {
  for (const m of String(s || '').matchAll(/\[\[([^\]]+)\]\]/g)) words.add(m[1].trim().toLowerCase())
}
for (const mod of Object.values(MODULES)) {
  for (const it of mod.items) {
    if (it.audio) {
      const arr = typeof it.audio === 'string' ? [['W', it.audio]] : it.audio
      for (const [sp, t] of arr) lines.add(`${sp || 'W'}|${t.trim()}`)
    }
    for (const v of Object.values(it)) if (typeof v === 'string') addWords(v)
    // 分類題（say）：點字卡會念出來
    if (it.say && Array.isArray(it.chips)) for (const c of it.chips) words.add(String(c[0]).trim().toLowerCase())
  }
}
for (const [sp, t] of VOICE_SAMPLE) lines.add(`${sp}|${t}`)
const addSentence = (en, sp = 'W') => {
  lines.add(`${sp}|${en}`)
  for (const w of en.split(/\s+/)) {
    const c = w.replace(/[^A-Za-z' -]/g, '').toLowerCase()
    if (c) words.add(c)
  }
}
for (const [en] of Object.values(SPEAK).flat()) addSentence(en)
// 對比組：兩句都要；問答：問句用男聲、參考答案用女聲
for (const [a, b] of Object.values(SPEAK_PAIRS).flat()) {
  addSentence(a)
  addSentence(b)
}
for (const [q, ans] of Object.values(SPEAK_QA).flat()) {
  addSentence(q, 'M')
  for (const a of ans) addSentence(a)
}
const out = { lines: [...lines], words: [...words] }
fs.writeFileSync(new URL('./texts.json', import.meta.url), JSON.stringify(out, null, 1))
console.log('lines', out.lines.length, 'words', out.words.length)
