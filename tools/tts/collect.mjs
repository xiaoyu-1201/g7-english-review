// 列出所有要做成音檔的文字：聽力（依說話的人選聲音）、口說句子、可以點來聽的單字
import { MODULES, SPEAK } from '../../content.js'
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
  }
}
for (const [en] of Object.values(SPEAK).flat()) {
  lines.add(`W|${en}`)
  for (const w of en.split(/\s+/)) {
    const c = w.replace(/[^A-Za-z' -]/g, '').toLowerCase()
    if (c) words.add(c)
  }
}
const out = { lines: [...lines], words: [...words] }
fs.writeFileSync(new URL('./texts.json', import.meta.url), JSON.stringify(out, null, 1))
console.log('lines', out.lines.length, 'words', out.words.length)
