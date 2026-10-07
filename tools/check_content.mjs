// 檢查題庫格式：答案位置、空格數、選項解析、文章／插圖對得上（node tools/check_content.mjs）
import { MODULES, PASSAGES, LESSONS, SPEAK, TAGS, EXAMS } from '../content.js'

const errs = []
const bad = (id, m) => errs.push(`${id}: ${m}`)
const FIG = ['tree', 'scene', 'preps', 'floors', 'clock', 'clocks', 'cal', 'signs', 'people', 'pic']
const SEC = ['情境單題', '圖表題組', '辨識句意', '基本問答', '言談理解']
const ids = new Set()
const inLesson = new Set(LESSONS.flatMap((l) => l.modules))
for (const [mid, mod] of Object.entries(MODULES)) {
  if (!inLesson.has(mid)) bad(mid, '沒有放進任何一堂課（LESSONS）')
  for (const k of ['unit', 'title', 'icon', 'min', 'items']) if (mod[k] == null) bad(mid, `少了 ${k}`)
  mod.items.forEach((it, i) => {
    const id = it.id || `${mid}#${i}`
    if (it.t !== 'learn') {
      if (!it.id) bad(id, '沒有 id')
      if (ids.has(it.id)) bad(id, 'id 重複')
      ids.add(it.id)
      for (const t of it.tags || []) if (!TAGS[t]) bad(id, `沒有這個標籤：${t}`)
    }
    if (it.fig && !FIG.includes(it.fig.k)) bad(id, `沒有這種插圖：${it.fig.k}`)
    if (it.passage && !PASSAGES[it.passage]) bad(id, `沒有這篇文章：${it.passage}`)
    if (it.sec && !SEC.includes(it.sec)) bad(id, `題型標籤不對：${it.sec}`)
    if (it.audio && !(typeof it.audio === 'string' || (Array.isArray(it.audio) && it.audio.every((x) => Array.isArray(x) && x.length === 2)))) bad(id, 'audio 格式不對')
    if (it.t === 'learn' || it.t === 'mcq' || it.t === 'multi') {
      if (!Array.isArray(it.opts) || it.opts.length < 2) bad(id, '選項太少')
      const ok = (x) => Number.isInteger(x) && x >= 0 && x < it.opts.length
      if (it.t === 'multi' ? !(Array.isArray(it.a) && it.a.every(ok)) : !ok(it.a)) bad(id, `答案位置不對：${it.a}`)
      if (new Set(it.opts).size !== it.opts.length) bad(id, '選項重複')
      for (const k of Object.keys(it.why || {})) {
        if (!ok(+k)) bad(id, `why 的選項不存在：${k}`)
        if (+k === it.a) bad(id, `why 寫到正確答案：${k}`)
      }
    }
    if (it.t === 'learn') for (const k of ['title', 'show', 'ask', 'rule']) if (!it[k]) bad(id, `觀念卡少了 ${k}`)
    if (it.t === 'fill') {
      const n = (it.q.match(/___/g) || []).length
      if (n !== it.ans.length) bad(id, `空格 ${n} 個，答案 ${it.ans.length} 組`)
      if (!it.ans.every((a) => Array.isArray(a) && a.length && a.every((x) => typeof x === 'string'))) bad(id, 'ans 格式不對')
    }
    if (it.t === 'write' && !(it.acc?.length && it.task && it.q)) bad(id, 'write 少了 q／task／acc')
    if (it.t === 'spot' && !(Number.isInteger(it.bad) && it.bad >= 0 && it.bad < it.toks.length && it.acc?.length)) bad(id, 'spot 的 bad／acc 不對')
    if (it.t === 'order' && !(it.words?.length > 2)) bad(id, 'order 少了 words')
    if (it.t === 'sort' && !(it.chips?.every(([, b]) => Number.isInteger(b) && b >= 0 && b < it.bins.length))) bad(id, 'sort 的格子編號不對')
  })
}
for (const e of EXAMS) {
  for (const p of [...e.cloze, ...e.text, ...e.chart]) if (!PASSAGES[p]) bad(e.id, `沒有這篇文章：${p}`)
  const units = new Set(Object.values(MODULES).map((m) => m.unit))
  for (const u of e.units) if (!units.has(u)) bad(e.id, `沒有這個單元：${u}`)
}
for (const [u, list] of Object.entries(SPEAK)) for (const s of list) if (!(Array.isArray(s) && s.length >= 2 && s[0])) bad('SPEAK ' + u, '句子格式不對')
const scored = [...ids].length
console.log(JSON.stringify({ modules: Object.keys(MODULES).length, scored, errors: errs }))
process.exit(errs.length ? 1 : 0)
