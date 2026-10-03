// 國一英文段考複習 App（翰林版七上 Starter～Review 1）
// 純前端：紀錄存在這台裝置（localStorage），可以匯出／匯入合併。
import { TAGS, TAG_HINTS, CHECKLIST, LESSONS, PASSAGES, MODULES, FLASH } from './content.js'
import { figure, placeScene, REL_LABEL } from './art.js'

const VERSION = '1.4（10/3）'
const KEY = 'g7review:v1'
const FORMAT_TAGS = ['cap', 'punct', 'space']
const TYPE_LABEL = { mcq: '選擇', multi: '複選', fill: '填空', write: '句型', order: '重組', spot: '抓錯', sort: '分類', place: '放位置', learn: '觀念' }
const DAY = 86400000

// ───────────────────────── 小工具 ─────────────────────────
const $ = (s, el = document) => el.querySelector(s)
const $$ = (s, el = document) => [...el.querySelectorAll(s)]
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const rid = () => Math.random().toString(36).slice(2, 10)
const uniq = (a) => [...new Set(a.filter(Boolean))]
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches
function shuffle(a) {
  const b = [...a]
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[b[i], b[j]] = [b[j], b[i]]
  }
  return b
}
const dayStart = (t = Date.now()) => {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
const fmtDate = (t) => {
  const d = new Date(t)
  return `${d.getMonth() + 1}/${d.getDate()}`
}
const fmtTime = (t) => {
  const d = new Date(t)
  return `${fmtDate(t)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const fmtDur = (ms) => {
  const m = Math.round(ms / 60000)
  return m < 1 ? '不到 1 分鐘' : `${m} 分鐘`
}
// [[word]] → 可以點來聽的單字
const rich = (html) => String(html ?? '').replace(/\[\[([^\]]+)\]\]/g, (_, w) => `<button type="button" class="say" data-say="${esc(w)}">${esc(w)}</button>`)
const qtext = (s) => esc(s).replace(/___/g, '<span class="gap" role="img" aria-label="空格"></span>').replace(/\n/g, '<br>')

// ───────────────────────── 儲存 ─────────────────────────
const DEF = () => ({
  profile: { name: '', device: '', exam: '', rate: 'normal', goal: 30, id: rid() },
  attempts: [],
  sessions: [],
  progress: {},
  flash: { best: 0, runs: 0 },
})
let S = load()
function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const d = JSON.parse(raw)
      const base = DEF()
      return { ...base, ...d, profile: { ...base.profile, ...(d.profile || {}) }, flash: { ...base.flash, ...(d.flash || {}) } }
    }
  } catch {}
  return DEF()
}
let saveWarned = false
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(S))
  } catch {
    if (!saveWarned) {
      saveWarned = true
      toast('這個瀏覽器沒辦法存紀錄（可能是無痕模式）', '⚠️')
    }
  }
}

// ───────────────────────── 題目索引 ─────────────────────────
const ITEM = {}
const MOD_ORDER = LESSONS.flatMap((l) => l.modules)
for (const mid of MOD_ORDER) {
  const m = MODULES[mid]
  let L = 0
  for (const it of m.items) {
    if (it.t === 'learn') it.id = `${mid}-L${++L}`
    it.mid = mid
    ITEM[it.id] = it
  }
  m.scored = m.items.filter((i) => i.t !== 'learn')
}
const ALL_SCORED = MOD_ORDER.flatMap((m) => MODULES[m].scored)

// ───────────────────────── 紀錄統計 ─────────────────────────
function attemptsOf(filterDevice) {
  return filterDevice ? S.attempts.filter((a) => a.d === S.profile.id) : S.attempts
}
function lastByItem(list = S.attempts) {
  const m = {}
  for (const a of list) if (!m[a.q] || m[a.q].ts <= a.ts) m[a.q] = a
  return m
}
// 錯題本：答錯過，而且還沒「隔開時間再答對兩次」
function bookState() {
  const by = {}
  for (const a of [...S.attempts].sort((x, y) => x.ts - y.ts)) (by[a.q] ||= []).push(a)
  const out = {}
  for (const [q, list] of Object.entries(by)) {
    if (!ITEM[q]) continue
    let wrong = 0
    let lastWrongTs = 0
    for (const a of list)
      if (a.r !== 'ok') {
        wrong++
        lastWrongTs = a.ts
      }
    if (!wrong) continue
    const after = list.filter((a) => a.ts > lastWrongTs)
    const oks = after.filter((a) => a.r === 'ok')
    const graduated = oks.length >= 3 || (oks.length >= 2 && oks[oks.length - 1].ts - oks[0].ts >= 8 * 3600000)
    out[q] = { wrong, inBook: !graduated, oks: oks.length, last: list[list.length - 1] }
  }
  return out
}
function bookIds() {
  const b = bookState()
  return Object.keys(b).filter((q) => b[q].inBook)
}
function moduleStats(mid) {
  const last = lastByItem()
  const sc = MODULES[mid].scored
  const done = sc.filter((i) => last[i.id]).length
  const mastered = sc.filter((i) => last[i.id]?.r === 'ok').length
  const best = Math.max(0, ...S.sessions.filter((s) => s.m === mid && s.k === 'm:' + mid).map((s) => s.stars || 0))
  return { total: sc.length, done, mastered, best }
}
function todayStats() {
  const t0 = dayStart()
  const list = S.attempts.filter((a) => a.ts >= t0)
  const ok = list.filter((a) => a.r === 'ok').length
  const care = list.filter((a) => a.r === 'care').length
  return { n: list.length, ok, care, acc: list.length ? ok / list.length : 0, careFree: ok + care ? ok / (ok + care) : 0 }
}
function streakDays() {
  const days = new Set(S.attempts.map((a) => dayStart(a.ts)))
  let n = 0
  let d = dayStart()
  if (!days.has(d)) d -= DAY
  while (days.has(d)) {
    n++
    d -= DAY
  }
  return n
}
function tagCounts(list) {
  const c = {}
  for (const a of list) if (a.r !== 'ok') for (const t of a.t || []) c[t] = (c[t] || 0) + 1
  return Object.entries(c).sort((a, b) => b[1] - a[1])
}
function record(it, res, extra = {}) {
  const a = { q: it.id, m: it.mid, r: res.r, t: res.tags || [], a: String(res.given ?? '').slice(0, 120), h: extra.h || 0, c: extra.c ? 1 : 0, x: extra.x || 'p', ts: Date.now(), d: S.profile.id }
  S.attempts.push(a)
  return a
}
// 錯因自評（後設認知：自己說出錯在哪，下次比較不會再錯）
const WHY_ME = [
  ['read', '看錯題目'],
  ['rule', '規則不熟'],
  ['word', '單字不熟'],
  ['rush', '太急了'],
]
function maxStreakDays() {
  const days = [...new Set(S.attempts.map((a) => dayStart(a.ts)))].sort((a, b) => a - b)
  let best = 0
  let run = 0
  days.forEach((d, i) => {
    run = i && Math.round((d - days[i - 1]) / DAY) === 1 ? run + 1 : 1
    best = Math.max(best, run)
  })
  return best
}

// ───────────────────────── 徽章 ─────────────────────────
const BADGES = [
  ['start', '🚀', '起步', '完成第一個單元'],
  ['ten', '🔟', '十連對', '練習時連續答對 10 題'],
  ['careful', '🎯', '零粗心', '一個單元 10 題以上，沒有格式粗心'],
  ['days', '🔥', '三天不間斷', '連續 3 天都有練習'],
  ['grad', '🎓', '錯題畢業生', '10 題從錯題本畢業'],
  ['flash', '⚡', '閃電手', '閃電挑戰答對 20 題'],
  ['lesson1', '🥈', '第 1 堂制霸', '第 1 堂 8 個單元都拿到三星'],
  ['lesson2', '🥇', '第 2 堂制霸', '第 2 堂 8 個單元都拿到三星'],
  ['exam', '💯', '準備好了', '模擬段考 90 分以上'],
]
function badgeEarned() {
  const modSess = S.sessions.filter((s) => s.k?.startsWith('m:'))
  const best = (m) => Math.max(0, ...modSess.filter((s) => s.m === m).map((s) => s.stars || 0))
  const runs = {}
  let maxRun = 0
  for (const a of S.attempts) {
    if (a.x === 'e') continue
    runs[a.d] = a.r === 'ok' ? (runs[a.d] || 0) + 1 : 0
    maxRun = Math.max(maxRun, runs[a.d])
  }
  const grads = Object.values(bookState()).filter((b) => !b.inBook).length
  return {
    start: modSess.length > 0,
    ten: maxRun >= 10,
    careful: modSess.some((s) => s.n >= 10 && !s.care),
    days: maxStreakDays() >= 3,
    grad: grads >= 10,
    flash: (S.flash.best || 0) >= 20,
    lesson1: LESSONS[0].modules.every((m) => best(m) === 3),
    lesson2: LESSONS[1].modules.every((m) => best(m) === 3),
    exam: S.sessions.some((s) => s.k === 'exam' && s.s >= 90),
  }
}
function checkBadges(silent = false) {
  S.badges ||= {}
  const e = badgeEarned()
  const fresh = BADGES.filter(([id]) => e[id] && !S.badges[id])
  if (!fresh.length) return
  fresh.forEach(([id]) => (S.badges[id] = Date.now()))
  save()
  if (silent) return
  setTimeout(() => {
    toast(fresh.length > 1 ? `獲得 ${fresh.length} 個徽章：${fresh.map((b) => b[2]).join('、')}` : `獲得徽章：${fresh[0][2]}——${fresh[0][3]}`, fresh[0][1])
    celebrate()
  }, 700)
}

// ───────────────────────── 文字批改 ─────────────────────────
const nb = (s) =>
  String(s ?? '')
    .replace(/[‘’ʼ′`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
const loose = (s) =>
  nb(s)
    .toLowerCase()
    .replace(/[.,?!;:\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
const wordsOf = (s) => loose(s).split(' ').filter(Boolean)

function editOps(a, b, eq = (x, y) => x === y) {
  const n = a.length
  const m = b.length
  const D = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)))
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) D[i][j] = Math.min(D[i - 1][j] + 1, D[i][j - 1] + 1, D[i - 1][j - 1] + (eq(a[i - 1], b[j - 1]) ? 0 : 1))
  const ops = []
  let i = n
  let j = m
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && D[i][j] === D[i - 1][j - 1] + (eq(a[i - 1], b[j - 1]) ? 0 : 1)) {
      ops.unshift({ op: eq(a[i - 1], b[j - 1]) ? 'eq' : 'sub', g: a[i - 1], a: b[j - 1] })
      i--
      j--
    } else if (i > 0 && D[i][j] === D[i - 1][j] + 1) {
      ops.unshift({ op: 'ins', g: a[i - 1] })
      i--
    } else {
      ops.unshift({ op: 'del', a: b[j - 1] })
      j--
    }
  }
  return { ops, dist: D[n][m] }
}
function lev(a, b) {
  return editOps([...a], [...b]).dist
}

function formatIssues(g, a) {
  const tags = new Set()
  const msgs = []
  const add = (t, m) => {
    tags.add(t)
    if (!msgs.includes(m)) msgs.push(m)
  }
  const tk = (s) => s.match(/[A-Za-z0-9']+/g) || []
  const gt = tk(g)
  const at = tk(a)
  if (gt.length === at.length)
    gt.forEach((w, i) => {
      const t = at[i]
      if (w === t || w.toLowerCase() !== t.toLowerCase()) return
      if (i === 0 && /^[A-Z]/.test(t) && !/^[A-Z]/.test(w)) add('cap', `句首第一個字母要大寫：${t}`)
      else if (t === 'I' || /^I'/.test(t)) add('cap', 'I（我）永遠要大寫')
      else if (/^[A-Z]/.test(t) && !/^[A-Z]/.test(w)) add('cap', `人名、稱謂要大寫：${t}`)
      else if (/[A-Z]/.test(w) && !/[A-Z]/.test(t)) add('cap', `這個字不用大寫：${w} → ${t}`)
      else add('cap', `大小寫要跟答案一樣：${t}`)
    })
  const ae = a.slice(-1)
  const ge = g.slice(-1)
  if ('.?!'.includes(ae)) {
    if (!'.?!'.includes(ge)) add('punct', ae === '?' ? '問句句尾要加問號 ?' : '句尾要加句點 .')
    else if (ge !== ae) add('punct', ae === '?' ? '問句句尾要用問號 ?，不是句點' : '這句不是問句，句尾用句點 .')
  } else if ('.?!'.includes(ge)) add('punct', '這裡不用加標點符號')
  const cnt = (s, r) => (s.match(r) || []).length
  if (cnt(a, /[.?!]/g) !== cnt(g, /[.?!]/g) && !msgs.some((m) => m.includes('句尾'))) add('punct', '句點／問號的數量不對')
  if (/\s[,.?!]/.test(g)) add('space', '逗點、句點、問號前面不能空格')
  if (/,(?=\S)/.test(g)) add('space', '逗點後面要空一格')
  if (cnt(a, /,/g) > cnt(g, /,/g)) add('punct', '少了逗點 ,')
  else if (cnt(a, /,/g) < cnt(g, /,/g)) add('punct', '多了逗點 ,')
  if (cnt(a, /-/g) > cnt(g, /-/g)) add('punct', '少了連字號 -（例如 twenty-one、17-year-old）')
  else if (cnt(a, /-/g) < cnt(g, /-/g)) add('punct', '這裡不用連字號 -')
  return { tags: [...tags], msgs }
}

const BE = ['am', 'is', 'are']
const ART = ['a', 'an']
const PRON = ['i', 'me', 'my', 'you', 'your', 'he', 'him', 'his', 'she', 'her', 'it', 'its', 'we', 'us', 'our', 'they', 'them', 'their']
const CONTR = { "it's": 'its', "he's": 'his', "they're": 'their', "you're": 'your', there: 'their' }
const EXPAND = { "it's": 'it is', "he's": 'he is', "she's": 'she is', "they're": 'they are', "you're": 'you are', "i'm": 'I am', "isn't": 'is not', "aren't": 'are not' }
const DEM = ['this', 'that', 'these', 'those']
const WH = ['what', 'who', 'where', 'how', 'when', 'why', 'which']
const PREP = ['in', 'on', 'under', 'at', 'near', 'between', 'behind', 'above', 'next', 'to', 'front', 'of', 'for', 'from']
const IRR = { mouse: 'mice', person: 'people', woman: 'women', man: 'men', child: 'children', wife: 'wives', housewife: 'housewives' }
const stem = (w) =>
  w
    .replace(/ies$/, 'y')
    .replace(/ves$/, 'fe')
    .replace(/(ch|sh|x|ss|z)es$/, '$1')
    .replace(/s$/, '')
    .replace(/fe$/, 'f')
function isPluralPair(g, a) {
  if (g === a) return false
  const p = (s, t) => s + 's' === t || s + 'es' === t || (s.endsWith('y') && s.slice(0, -1) + 'ies' === t) || IRR[s] === t
  const irr = Object.entries(IRR).some(([s, pl]) => (a === pl || a === s) && (g.startsWith(s.slice(0, 3)) || g.startsWith(pl.slice(0, 3))))
  return p(g, a) || p(a, g) || irr || stem(g) === stem(a)
}
const disp = (w) => w.replace(/^i(?='|$)/, 'I')
function classify(g, a) {
  if (BE.includes(g) && BE.includes(a)) return ['be', `be 動詞要用「${a}」，不是「${g}」：先看主詞是一個還是兩個以上。`]
  if (ART.includes(g) && ART.includes(a)) return ['aan', `要用「${a}」：a／an 看後面那個字的第一個音。`]
  if (CONTR[g] === a || CONTR[a] === g) {
    if (EXPAND[a]) return ['poss', `這裡要用「${disp(a)}」（＝ ${EXPAND[a]}）：拆開來讀讀看就知道。`]
    if (EXPAND[g]) return ['poss', `「${disp(g)}」＝ ${EXPAND[g]}，但這裡後面接名詞，要用所有格「${a}」。`]
    return ['poss', `「${g}」是「那裡」；「他們的」要用所有格「${a}」。`]
  }
  if (PRON.includes(g) && PRON.includes(a)) return ['pron', `代名詞要用「${a}」，不是「${g}」。`]
  if (DEM.includes(g) && DEM.includes(a)) return ['plural', `要用「${a}」（近／遠、單數／複數要配對）。`]
  if (WH.includes(g) && WH.includes(a)) return ['wh', `疑問詞要用「${a}」。`]
  if (PREP.includes(g) && PREP.includes(a)) return ['prep', `介系詞要用「${a}」。`]
  if (g.replace(/'/g, '') === a.replace(/'/g, '')) return ['punct', `縮寫或所有格要有撇號 '：${disp(a)}`]
  if (isPluralPair(g, a)) return ['plural', `單複數：要用「${a}」，不是「${g}」。`]
  if (lev(g, a) <= Math.max(1, Math.floor(a.length / 3))) return ['spell', `拼字：「${disp(g)}」→「${disp(a)}」`]
  return ['', `「${disp(g)}」應該是「${disp(a)}」。`]
}
function wordTag(w) {
  if (ART.includes(w)) return 'aan'
  if (BE.includes(w) || w === 'not') return 'be'
  if (PRON.includes(w)) return 'pron'
  if (PREP.includes(w)) return 'prep'
  return 'order'
}
function diagnose(g, a) {
  const gw = wordsOf(g)
  const aw = wordsOf(a)
  const tags = []
  const msgs = []
  if (gw.length === aw.length && gw.length > 1 && [...gw].sort().join(' ') === [...aw].sort().join(' ')) return { tags: ['order'], msgs: ['單字都對，但順序不對。'] }
  const { ops } = editOps(gw, aw)
  for (const o of ops) {
    if (o.op === 'sub') {
      const [t, m] = classify(o.g, o.a)
      if (t) tags.push(t)
      msgs.push(m)
    } else if (o.op === 'del') {
      tags.push(wordTag(o.a))
      msgs.push(`少了「${disp(o.a)}」。`)
    } else if (o.op === 'ins') {
      tags.push(wordTag(o.g))
      msgs.push(`多了「${disp(o.g)}」。`)
    }
  }
  return { tags: uniq(tags), msgs: uniq(msgs).slice(0, 4) }
}
function closest(g, accepts) {
  let best = accepts[0]
  let bd = Infinity
  for (const a of accepts) {
    const d = editOps(wordsOf(g), wordsOf(a)).dist
    if (d < bd) {
      bd = d
      best = a
    }
  }
  return best
}
function checkText(given, accepts, opt = {}) {
  const g = nb(given)
  const base = { given: g }
  if (!g && !accepts.includes('')) return { ...base, r: 'bad', tags: opt.tags || [], msgs: ['這一格還沒有寫。'], best: accepts[0] }
  for (const a of accepts) if (nb(a) === g) return { ...base, r: 'ok', tags: [], msgs: [], best: a }
  const lg = loose(g)
  for (const a of accepts)
    if (loose(a) === lg && a) {
      const f = formatIssues(g, nb(a))
      return { ...base, r: 'care', tags: f.tags.length ? f.tags : ['punct'], msgs: f.msgs.length ? f.msgs : ['格式和答案有一點不一樣，對照看看。'], best: a }
    }
  if (opt.wm)
    for (const [k, v] of Object.entries(opt.wm))
      if (loose(k) === lg) {
        const [t, m] = Array.isArray(v) ? v : ['', v]
        return { ...base, r: 'bad', tags: t ? [t] : opt.tags || [], msgs: [m], best: accepts[0] }
      }
  const best = closest(g, accepts)
  if (!best) return { ...base, r: 'bad', tags: opt.tags || [], msgs: ['這個字要整個刪掉。'], best: '' }
  const d = diagnose(g, best)
  return { ...base, r: 'bad', tags: d.tags.length ? d.tags : opt.tags || [], msgs: d.msgs.length ? d.msgs : ['和答案不一樣，對照看看。'], best }
}
// 逐字比對：標出你寫錯的字、正確答案的字
function diffHTML(given, target) {
  const g = nb(given).split(' ').filter(Boolean)
  const t = nb(target).split(' ').filter(Boolean)
  const { ops } = editOps(g, t)
  const yours = []
  const right = []
  for (const o of ops) {
    if (o.op === 'eq') {
      yours.push(esc(o.g))
      right.push(esc(o.a))
    } else if (o.op === 'sub') {
      yours.push(`<mark class="x">${esc(o.g)}</mark>`)
      right.push(`<mark class="y">${esc(o.a)}</mark>`)
    } else if (o.op === 'ins') yours.push(`<mark class="x">${esc(o.g)}</mark>`)
    else right.push(`<mark class="y">${esc(o.a)}</mark>`)
  }
  return { yours: yours.join(' ') || '<span class="muted">（空白）</span>', right: right.join(' ') || '<span class="muted">（刪掉）</span>' }
}
const joinTokens = (ws) => ws.join(' ').replace(/\s+([.?!,])/g, '$1')

// ───────────────────────── 語音 ─────────────────────────
const Voice = {
  ok: 'speechSynthesis' in window,
  list: [],
  playing: null,
  load() {
    if (!this.ok) return
    this.list = speechSynthesis.getVoices().filter((v) => /^en[-_]/i.test(v.lang))
  },
  pick(fem) {
    const L = this.list
    if (!L.length) return null
    const us = L.filter((v) => /en[-_]US/i.test(v.lang))
    const pool = us.length ? us : L
    const F = /samantha|ava|allison|susan|zira|aria|jenny|karen|moira|tessa|victoria|nicky|female|google us english/i
    const M = /alex|daniel|fred|aaron|tom\b|guy|david|mark|evan|nathan|male/i
    return pool.find((v) => (fem ? F : M).test(v.name)) || pool[fem ? 0 : Math.min(1, pool.length - 1)]
  },
  rate(slow) {
    return slow ? 0.62 : S.profile.rate === 'slow' ? 0.75 : 0.92
  },
  speak(lines, slow = false) {
    if (!this.ok) {
      toast('這台裝置不支援語音，請用 Safari 或 Chrome 開啟', '🔇')
      return Promise.resolve()
    }
    if (!this.list.length) this.load()
    speechSynthesis.cancel()
    const arr = typeof lines === 'string' ? [['W', lines]] : lines
    const PITCH = { M: 0.9, W: 1.05, B: 1.12, G: 1.25, A: 1 }
    return new Promise((res) => {
      arr.forEach(([sp, text], i) => {
        const u = new SpeechSynthesisUtterance(text)
        u.lang = 'en-US'
        const v = this.pick(sp === 'W' || sp === 'G')
        if (v) u.voice = v
        u.pitch = PITCH[sp] || 1
        u.rate = this.rate(slow)
        if (i === arr.length - 1) {
          u.onend = res
          u.onerror = res
        }
        speechSynthesis.speak(u)
      })
    })
  },
  stop() {
    if (this.ok) speechSynthesis.cancel()
  },
}
if (Voice.ok) {
  Voice.load()
  speechSynthesis.onvoiceschanged = () => Voice.load()
}

// ───────────────────────── 小元件 ─────────────────────────
let toastTimer
function toast(msg, icon = '') {
  let el = $('#toast')
  if (!el) {
    el = document.createElement('div')
    el.id = 'toast'
    el.setAttribute('role', 'status')
    document.body.append(el)
  }
  el.innerHTML = `${icon ? `<span class="t-ic">${icon}</span>` : ''}<span>${esc(msg)}</span>`
  el.classList.remove('show')
  void el.offsetWidth
  el.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600)
}
function buzz(ms = 12) {
  try {
    navigator.vibrate?.(ms)
  } catch {}
}

let sheetClose = null
function sheet(html, { onClose, wide } = {}) {
  closeSheet()
  const wrap = document.createElement('div')
  wrap.className = 'sheet-wrap'
  wrap.innerHTML = `<div class="sheet-bg" data-close></div><section class="sheet${wide ? ' wide' : ''}" role="dialog" aria-modal="true"><div class="grabber" aria-hidden="true"></div><button class="sheet-x" data-close aria-label="關閉">${ICON.x}</button><div class="sheet-body">${html}</div></section>`
  document.body.append(wrap)
  document.body.classList.add('locked')
  requestAnimationFrame(() => wrap.classList.add('open'))
  const onKey = (e) => e.key === 'Escape' && closeSheet()
  document.addEventListener('keydown', onKey)
  wrap.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) closeSheet()
  })
  sheetClose = () => {
    document.removeEventListener('keydown', onKey)
    wrap.classList.remove('open')
    document.body.classList.remove('locked')
    setTimeout(() => wrap.remove(), reduceMotion() ? 0 : 280)
    sheetClose = null
    onClose?.()
  }
  return $('.sheet-body', wrap)
}
function closeSheet() {
  sheetClose?.()
}
function confirmSheet(title, body, okText, onOk, danger = false) {
  const b = sheet(`<h2 class="sheet-title">${esc(title)}</h2><p class="sheet-p">${body}</p><div class="sheet-actions"><button class="btn ghost" data-close>取消</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(okText)}</button></div>`)
  $('[data-ok]', b).onclick = () => {
    closeSheet()
    onOk()
  }
}

const ICON = {
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>',
  chev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>',
  home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5L12 4l9 7.5" /><path d="M5.5 10v9.5h13V10" /></svg>',
  book: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5C6.5 4.5 9.5 4.5 12 6c2.5-1.5 5.5-1.5 8-.5v13c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5z" /><path d="M12 6v13" /></svg>',
  chart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20V11M12 20V5M19 20v-6" /></svg>',
  gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2" /><path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2L5.5 5.5" /></svg>',
  bulb: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 00-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0012 3z" /></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="fill" d="M8 5.5v13l10.5-6.5z" /></svg>',
  stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect class="fill" x="7" y="7" width="10" height="10" rx="2" /></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>',
  notes: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3.5" width="14" height="17" rx="3" /><path d="M9 8.5h6M9 12h6M9 15.5h4" /></svg>',
  share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4" /><path d="M6 11v8.5h12V11" /></svg>',
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="fill" d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z" /></svg>',
  flame: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="fill" d="M12 2.5c.6 3.2 4.8 5.6 4.8 10.3A4.8 4.8 0 0112 17.6a4.8 4.8 0 01-4.8-4.8c0-1.9.9-3.4 1.9-4.6.2 1.6 1 2.6 2.1 2.9-.4-3.1.1-6 0-8.6z" /><path class="fill" d="M12 21.5a5.5 5.5 0 01-5.5-5.5c0-.6.1-1.1.2-1.6A5.5 5.5 0 0012 18.4a5.5 5.5 0 005.3-4c.1.5.2 1 .2 1.6a5.5 5.5 0 01-5.5 5.5z" /></svg>',
  bolt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="fill" d="M13.5 2.5L5 13.5h6l-1 8 8.5-11h-6z" /></svg>',
  doc: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h7l4 4v13H7z" /><path d="M14 3.5v4h4M10 12h5M10 15.5h5" /></svg>',
  list: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7h11M9 12h11M9 17h11" /><circle class="fill" cx="5" cy="7" r="1.3" /><circle class="fill" cx="5" cy="12" r="1.3" /><circle class="fill" cx="5" cy="17" r="1.3" /></svg>',
  speaker: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="fill" d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11" /></svg>',
}

function stars(n, max = 3) {
  return `<span class="stars" aria-label="${n} 顆星">${Array.from({ length: max }, (_, i) => `<i class="${i < n ? 'on' : ''}">${ICON.star}</i>`).join('')}</span>`
}
function ring(pct, size = 64, stroke = 7, cls = '') {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const p = Math.max(0, Math.min(1, pct))
  return `<svg class="ring ${cls}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle class="ring-bg" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" /><circle class="ring-fg" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}" transform="rotate(-90 ${size / 2} ${size / 2})" /></svg>`
}

// ───────────────────────── 題目元件 ─────────────────────────
// 每一題都是一個 controller：answered() 有沒有作答、grade() 批改、reveal(res) 顯示對錯
function hintsFor(it) {
  if (it.g?.length) return it.g
  const h = uniq((it.tags || []).map((t) => TAG_HINTS[t]))
  return h.length ? h : ['先把題目唸一遍，圈出關鍵字。']
}
function passageHTML(pid, mode) {
  const p = PASSAGES[pid]
  if (!p) return ''
  const text = esc(p.text).replace(/__\((\d)\)__/g, '<span class="cloze">($1)</span>')
  return `<details class="passage" ${mode === 'exam' ? '' : 'open'}><summary>${ICON.doc}<span>${esc(p.title)}</span></summary><p class="en">${text}</p><p class="zh" hidden>${esc(p.zh)}</p></details>`
}
function audioHTML(it) {
  if (!it.audio) return ''
  const lines = typeof it.audio === 'string' ? [['', it.audio]] : it.audio
  const SP = { M: '男', W: '女', B: '男孩', G: '女孩', A: '' }
  return `<div class="audio">
    <button type="button" class="btn play" data-play>${ICON.play}<span>播放</span></button>
    <button type="button" class="btn ghost slow" data-play="slow">慢速</button>
    <span class="audio-note">可以重聽</span>
  </div>
  <div class="transcript" hidden><div class="tr-h">聽力原文</div>${lines.map(([sp, t]) => `<p>${SP[sp] ? `<b>${SP[sp]}：</b>` : ''}${esc(t)}</p>`).join('')}</div>`
}
function metaHTML(it) {
  const m = MODULES[it.mid]
  const lv = it.lv === 3 ? '<span class="chip lv3">挑戰</span>' : it.lv === 2 ? '<span class="chip lv2">進階</span>' : ''
  const kind = it.audio ? '<span class="chip blue">聽力</span>' : it.passage ? '<span class="chip blue">閱讀</span>' : ''
  return `<div class="q-meta"><span class="chip">${TYPE_LABEL[it.t]}</span>${kind}${lv}<span class="q-unit">${esc(m.unit)} · ${esc(m.title)}</span></div>`
}

function makeItem(it, mode = 'practice') {
  const el = document.createElement('article')
  el.className = `qcard t-${it.t}`
  el.dataset.id = it.id
  const C = CTRL[it.t](it, mode)
  const pre = mode === 'exam' ? '' : passageHTML(it.passage, mode)
  el.innerHTML = `${metaHTML(it)}${pre}${it.t === 'learn' ? '' : figure(it.fig)}${audioHTML(it)}${C.html}<div class="q-feedback" hidden></div>`
  C.el = el
  C.it = it
  C.mount?.(el)
  el.addEventListener('click', (e) => {
    const p = e.target.closest('[data-play]')
    if (p) {
      const b = $('[data-play]:not(.slow)', el)
      if (Voice.playing === el) {
        Voice.stop()
        Voice.playing = null
        b.innerHTML = `${ICON.play}<span>播放</span>`
        return
      }
      Voice.playing = el
      b.innerHTML = `${ICON.stop}<span>停止</span>`
      Voice.speak(it.audio, p.dataset.play === 'slow').then(() => {
        if (Voice.playing === el) Voice.playing = null
        b.innerHTML = `${ICON.play}<span>播放</span>`
      })
    }
  })
  return C
}

function inputAttrs(extra = '') {
  return `autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" ${extra}`
}

const CTRL = {
  learn(it) {
    let sel = null
    const C = {
      html: `<h2 class="learn-title">${esc(it.title)}</h2>${figure(it.fig)}<div class="learn-show">${rich(it.show)}</div>
        <div class="learn-ask"><div class="ask-h">你先想想 🤔</div><div class="q-text">${qtext(it.ask)}</div>
        <div class="opts">${it.opts.map((o, i) => `<button type="button" class="opt" data-i="${i}"><span class="opt-key">${'ABCD'[i]}</span><span class="opt-text">${esc(o)}</span></button>`).join('')}</div></div>
        <div class="learn-rule" hidden><div class="rule-h">重點</div><div>${rich(it.rule)}</div>${it.tip ? `<div class="tip"><b>易錯提醒</b>${rich(it.tip)}</div>` : ''}</div>`,
      answered: () => sel !== null,
      mount(el) {
        $('.opts', el).addEventListener('click', (e) => {
          const b = e.target.closest('.opt')
          if (!b || sel !== null) return
          sel = +b.dataset.i
          $$('.opt', el).forEach((o) => {
            const i = +o.dataset.i
            o.classList.add(i === it.a ? 'ok' : i === sel ? 'bad' : 'dim')
            o.disabled = true
          })
          const r = $('.learn-rule', el)
          r.hidden = false
          r.insertAdjacentHTML('afterbegin', `<div class="learn-verdict ${sel === it.a ? 'ok' : 'bad'}">${sel === it.a ? '想得對！' : `答案是 ${'ABCD'[it.a]}。沒關係，看下面的重點。`}</div>`)
          buzz()
          C.onAnswer?.()
          requestAnimationFrame(() => r.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'nearest' }))
        })
      },
    }
    return C
  },

  mcq(it, mode) {
    const n = it.opts.length
    let order = shuffle([...Array(n).keys()])
    const fixed = it.opts.findIndex((o) => o.startsWith('（'))
    if (fixed >= 0) order = order.filter((x) => x !== fixed).concat(fixed)
    let sel = null
    // 上課模式：先遮住選項，讓學生「先說出答案」（生成效應：自己想出來的記得比較牢）
    const cover = mode === 'practice' && S.profile.oral === 'on' && !it.audio
    const C = {
      html: `<div class="q-text">${qtext(it.q)}</div><div class="opts-wrap${cover ? ' covered' : ''}">${cover ? '<button type="button" class="cover-btn"><span>🗣️ 先說出你的答案</span><small>想好了再點這裡看選項</small></button>' : ''}<div class="opts" role="radiogroup">${order
        .map((i, k) => `<button type="button" class="opt" role="radio" aria-checked="false" data-i="${i}"><span class="opt-key">${'ABCDEFGH'[k]}</span><span class="opt-text">${esc(it.opts[i])}</span></button>`)
        .join('')}</div></div>`,
      answered: () => sel !== null,
      mount(el) {
        $('.cover-btn', el)?.addEventListener('click', (e) => {
          const w = e.currentTarget.parentElement
          w.classList.remove('covered')
          e.currentTarget.remove()
        })
        $('.opts', el).addEventListener('click', (e) => {
          const b = e.target.closest('.opt')
          if (!b || C.locked) return
          sel = +b.dataset.i
          $$('.opt', el).forEach((o) => {
            const on = o === b
            o.classList.toggle('sel', on)
            o.setAttribute('aria-checked', on)
          })
          C.onAnswer?.()
        })
      },
      grade() {
        const ok = sel === it.a
        const key = (i) => 'ABCDEFGH'[order.indexOf(i)]
        return {
          r: ok ? 'ok' : 'bad',
          tags: ok ? [] : it.tags || [],
          msgs: !ok && it.why?.[sel] ? [it.why[sel]] : [],
          given: sel === null ? '' : it.opts[sel],
          right: `(${key(it.a)}) ${esc(it.opts[it.a])}`,
        }
      },
      reveal(res) {
        C.locked = true
        $$('.opt', C.el).forEach((o) => {
          const i = +o.dataset.i
          o.disabled = true
          if (i === it.a) o.classList.add('ok')
          else if (i === sel) o.classList.add('bad')
          else o.classList.add('dim')
        })
      },
    }
    return C
  },

  multi(it) {
    const set = new Set()
    const C = {
      html: `<div class="q-text">${qtext(it.q)}</div><div class="opts multi">${it.opts
        .map((o, i) => `<button type="button" class="opt" role="checkbox" aria-checked="false" data-i="${i}"><span class="opt-box">${ICON.check}</span><span class="opt-text">${esc(o)}</span></button>`)
        .join('')}</div>`,
      answered: () => set.size > 0,
      mount(el) {
        $('.opts', el).addEventListener('click', (e) => {
          const b = e.target.closest('.opt')
          if (!b || C.locked) return
          const i = +b.dataset.i
          set.has(i) ? set.delete(i) : set.add(i)
          b.classList.toggle('sel', set.has(i))
          b.setAttribute('aria-checked', set.has(i))
          C.onAnswer?.()
        })
      },
      grade() {
        const A = new Set(it.a)
        const miss = it.a.filter((i) => !set.has(i)).map((i) => it.opts[i])
        const extra = [...set].filter((i) => !A.has(i)).map((i) => it.opts[i])
        const ok = !miss.length && !extra.length
        const msgs = []
        if (miss.length) msgs.push(`漏選：${miss.join('、')}`)
        if (extra.length) msgs.push(`多選：${extra.join('、')}`)
        return { r: ok ? 'ok' : 'bad', tags: ok ? [] : it.tags || [], msgs, given: [...set].map((i) => it.opts[i]).join(','), right: it.a.map((i) => esc(it.opts[i])).join('、') }
      },
      reveal() {
        C.locked = true
        const A = new Set(it.a)
        $$('.opt', C.el).forEach((o) => {
          const i = +o.dataset.i
          o.disabled = true
          if (A.has(i)) o.classList.add(set.has(i) ? 'ok' : 'miss')
          else if (set.has(i)) o.classList.add('bad')
          else o.classList.add('dim')
        })
      },
    }
    return C
  },

  fill(it) {
    let bi = 0
    const lines = it.q.split('\n').map(
      (line) =>
        `<div class="fill-line">${line
          .split('___')
          .map((p, k, arr) => esc(p) + (k < arr.length - 1 ? `<span class="blank-wrap"><input class="blank" data-b="${bi++}" aria-label="第 ${bi} 格" ${inputAttrs()}></span>` : ''))
          .join('')}</div>`,
    )
    const C = {
      html: `<div class="q-text fill">${lines.join('')}</div>`,
      inputs: () => $$('.blank', C.el),
      answered: () => C.inputs().every((i) => i.value.trim()),
      mount(el) {
        el.addEventListener('input', (e) => {
          if (!e.target.matches('.blank')) return
          e.target.style.width = Math.max(5, e.target.value.length + 2) + 'ch'
          C.onAnswer?.()
        })
        el.addEventListener('keydown', (e) => {
          if (e.key !== 'Enter' || !e.target.matches('.blank')) return
          e.preventDefault()
          const ins = C.inputs()
          const k = ins.indexOf(e.target)
          if (k < ins.length - 1) ins[k + 1].focus()
          else C.onEnter?.()
        })
      },
      focus: () => C.inputs()[0]?.focus({ preventScroll: true }),
      grade() {
        const vals = C.inputs().map((i) => i.value)
        const parts = vals.map((v, b) => checkText(v, it.ans[b], { wm: it.wm, tags: it.tags }))
        C.parts = parts
        const r = parts.some((p) => p.r === 'bad') ? 'bad' : parts.some((p) => p.r === 'care') ? 'care' : 'ok'
        const multi = parts.length > 1
        const msgs = parts.flatMap((p, b) => p.msgs.map((m) => (multi ? `第 ${b + 1} 格：${m}` : m)))
        return {
          r,
          tags: uniq(parts.flatMap((p) => p.tags)),
          msgs,
          given: vals.join(' / '),
          right: parts.map((p, b) => esc(it.ans[b][0])).join('　/　'),
        }
      },
      reveal() {
        C.inputs().forEach((inp, b) => {
          const p = C.parts[b]
          inp.disabled = true
          inp.classList.add(p.r)
          if (p.r !== 'ok') inp.parentElement.insertAdjacentHTML('beforeend', `<span class="fix">${esc(it.ans[b][0])}</span>`)
        })
      },
    }
    return C
  },

  write(it) {
    const C = {
      html: `<p class="task">${esc(it.task)}</p><blockquote class="src">${qtext(it.q)}</blockquote><textarea class="write-in" rows="2" placeholder="在這裡寫出完整的句子" aria-label="作答" ${inputAttrs()}></textarea>`,
      answered: () => $('.write-in', C.el).value.trim().length > 0,
      mount(el) {
        const ta = $('.write-in', el)
        ta.addEventListener('input', () => C.onAnswer?.())
        ta.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            C.onEnter?.()
          }
        })
      },
      focus: () => $('.write-in', C.el)?.focus({ preventScroll: true }),
      grade() {
        const v = $('.write-in', C.el).value
        const res = checkText(v, it.acc, { wm: it.wm, tags: it.tags })
        C.res = res
        const d = diffHTML(v, res.best)
        return { ...res, yours: res.r === 'ok' ? '' : d.yours, right: res.r === 'ok' ? esc(res.best) : d.right }
      },
      reveal(res) {
        const ta = $('.write-in', C.el)
        ta.disabled = true
        ta.classList.add(res.r)
      },
    }
    return C
  },

  order(it) {
    const all = [...it.words.map((w, i) => ({ w, k: 'w' + i })), ...(it.extra || []).map((w, i) => ({ w, k: 'x' + i }))]
    let pool = shuffle(all)
    for (let t = 0; t < 5 && pool.map((c) => c.w).join('|') === it.words.join('|'); t++) pool = shuffle(all)
    const placed = []
    const chip = (c, where) => `<button type="button" class="ord-chip${it.lines ? ' line' : ''}" data-k="${c.k}" data-where="${where}">${esc(c.w)}</button>`
    const C = {
      html: `<p class="task">${esc(it.q || (it.extra?.length ? '重組句子：有多的字卡，不一定全部用到。' : '重組句子：依序點字卡排成正確的句子。'))}</p>
        <div class="ord-ans${it.lines ? ' lines' : ''}" aria-label="你的排列"></div><div class="ord-pool${it.lines ? ' lines' : ''}"></div>`,
      draw() {
        const ans = $('.ord-ans', C.el)
        ans.innerHTML = placed.length ? placed.map((c) => chip(c, 'ans')).join('') : `<span class="ord-ph">${it.lines ? '依照對話順序點選下面每一句' : '點下面的字卡，依序排好'}</span>`
        $('.ord-pool', C.el).innerHTML = pool.map((c) => chip(c, 'pool')).join('')
      },
      answered: () => (it.lines ? placed.length === it.words.length : placed.length >= it.words.length),
      mount(el) {
        C.draw()
        el.addEventListener('click', (e) => {
          const b = e.target.closest('.ord-chip')
          if (!b || C.locked) return
          const k = b.dataset.k
          if (b.dataset.where === 'pool') {
            const i = pool.findIndex((c) => c.k === k)
            placed.push(...pool.splice(i, 1))
          } else {
            const i = placed.findIndex((c) => c.k === k)
            pool.push(...placed.splice(i, 1))
          }
          buzz(6)
          C.draw()
          C.onAnswer?.()
        })
      },
      grade() {
        const built = placed.map((c) => c.w)
        const alts = [it.words, ...(it.acc || [])]
        const ok = alts.some((a) => a.join('|') === built.join('|'))
        const msgs = []
        const tags = []
        if (!ok) {
          const extraUsed = placed.filter((c) => c.k[0] === 'x').map((c) => c.w)
          const missing = pool.filter((c) => c.k[0] === 'w').map((c) => c.w)
          if (extraUsed.length) {
            msgs.push(`多用了：「${extraUsed.join('」「')}」`)
            extraUsed.forEach((w) => tags.push(['a', 'an'].includes(w) ? 'aan' : ['.', '?'].includes(w) ? 'punct' : BE.includes(w) ? 'be' : 'order'))
          }
          if (missing.length) msgs.push(`少了：「${missing.join('」「')}」`)
          if (!msgs.length) msgs.push(it.lines ? '對話的順序不對：想想誰先開口、誰在回答。' : '字卡都對，但順序不對。')
          tags.push(...(it.tags || []))
        }
        const right = it.lines ? `<ol class="right-lines">${it.words.map((w) => `<li>${esc(w)}</li>`).join('')}</ol>` : esc(joinTokens(it.words))
        return { r: ok ? 'ok' : 'bad', tags: uniq(tags), msgs, given: it.lines ? built.map((w) => it.words.indexOf(w) + 1).join('-') : joinTokens(built), right }
      },
      reveal(res) {
        C.locked = true
        $('.ord-ans', C.el).classList.add(res.r)
        $$('.ord-chip', C.el).forEach((b) => (b.disabled = true))
      },
    }
    return C
  },

  spot(it) {
    let sel = null
    const C = {
      html: `<p class="task">句子裡有一個地方錯了：先點出錯的字，再改正。</p>
        <div class="spot-line">${it.toks.map((t, i) => `<button type="button" class="tok" data-i="${i}">${esc(t)}</button>`).join('')}</div>
        <div class="spot-fix" hidden><label>把「<b class="spot-word"></b>」改成：</label><input class="spot-in" aria-label="改正" ${inputAttrs()}><small>要刪掉這個字，就把格子清空。</small></div>`,
      answered: () => sel !== null,
      mount(el) {
        $('.spot-line', el).addEventListener('click', (e) => {
          const b = e.target.closest('.tok')
          if (!b || C.locked) return
          sel = +b.dataset.i
          $$('.tok', el).forEach((t) => t.classList.toggle('sel', t === b))
          const f = $('.spot-fix', el)
          f.hidden = false
          $('.spot-word', el).textContent = it.toks[sel]
          const inp = $('.spot-in', el)
          inp.value = it.toks[sel]
          inp.focus({ preventScroll: true })
          C.onAnswer?.()
        })
        $('.spot-in', el).addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            C.onEnter?.()
          }
        })
      },
      grade() {
        const fixed = it.toks.map((t, i) => (i === it.bad ? it.acc[0] : t)).filter(Boolean)
        const right = esc(fixed.join(' '))
        if (sel !== it.bad) return { r: 'bad', tags: it.tags || [], msgs: [sel === null ? '還沒有點出錯的地方。' : `錯的地方不是「${it.toks[sel]}」，是「${it.toks[it.bad]}」。`], given: sel === null ? '' : it.toks[sel], right }
        const v = $('.spot-in', C.el).value
        if (it.del) {
          const ok = !v.trim()
          return { r: ok ? 'ok' : 'bad', tags: ok ? [] : it.tags || [], msgs: ok ? [] : ['找對位置了！不過這個字要整個刪掉。'], given: v, right }
        }
        const res = checkText(v, it.acc, { tags: it.tags })
        if (res.r === 'bad') res.msgs = ['找對位置了，但改法不對。', ...res.msgs]
        return { ...res, given: v, right }
      },
      reveal(res) {
        C.locked = true
        $$('.tok', C.el).forEach((t) => {
          const i = +t.dataset.i
          t.disabled = true
          if (i === it.bad) t.classList.add('ok')
          else if (i === sel) t.classList.add('bad')
        })
        const inp = $('.spot-in', C.el)
        inp.disabled = true
        inp.classList.add(res.r)
      },
    }
    return C
  },

  sort(it) {
    const place = it.chips.map(() => null)
    let sel = null
    const chip = (i) => `<button type="button" class="sort-chip${sel === i ? ' sel' : ''}" data-c="${i}">${esc(it.chips[i][0])}${it.say ? `<span class="mini-sp">${ICON.speaker}</span>` : ''}</button>`
    const C = {
      html: `<p class="task">${esc(it.q)}</p><div class="sort-pool"></div><div class="sort-bins" style="--n:${it.bins.length}">${it.bins
        .map((b, k) => `<div class="bin" data-bin="${k}" role="button" tabindex="0" aria-label="放進 ${esc(b)}"><div class="bin-h">${esc(b)}</div><div class="bin-body"></div></div>`)
        .join('')}</div>`,
      draw() {
        const free = it.chips.map((_, i) => i).filter((i) => place[i] === null)
        $('.sort-pool', C.el).innerHTML = free.length ? free.map(chip).join('') : '<span class="ord-ph">全部放好了！可以檢查了。</span>'
        $$('.bin', C.el).forEach((b) => {
          const k = +b.dataset.bin
          $('.bin-body', b).innerHTML = it.chips.map((_, i) => i).filter((i) => place[i] === k).map(chip).join('')
          b.classList.toggle('ready', sel !== null)
        })
      },
      answered: () => place.every((p) => p !== null),
      mount(el) {
        C.draw()
        el.addEventListener('click', (e) => {
          if (C.locked) return
          const c = e.target.closest('.sort-chip')
          const inBin = e.target.closest('.bin')
          // 已經選了一張卡，點到格子（就算點到格子裡的卡）＝ 放進這一格
          if (inBin && sel !== null && !(c && +c.dataset.c === sel)) {
            place[sel] = +inBin.dataset.bin
            sel = null
            buzz(6)
            C.draw()
            C.onAnswer?.()
            return
          }
          if (c) {
            const i = +c.dataset.c
            if (it.say) Voice.speak(it.chips[i][0])
            if (place[i] !== null) {
              place[i] = null
              sel = i
            } else sel = sel === i ? null : i
            C.draw()
            C.onAnswer?.()
            return
          }
          const b = e.target.closest('.bin')
          if (b && sel !== null) {
            place[sel] = +b.dataset.bin
            sel = null
            buzz(6)
            C.draw()
            C.onAnswer?.()
          } else if (b) {
            b.classList.remove('nudge')
            void b.offsetWidth
            b.classList.add('nudge')
          }
        })
      },
      grade() {
        const wrong = it.chips.map((c, i) => ({ c, i })).filter(({ c, i }) => place[i] !== c[1])
        return {
          r: wrong.length ? 'bad' : 'ok',
          tags: wrong.length ? it.tags || [] : [],
          msgs: wrong.slice(0, 4).map(({ c }) => `「${c[0]}」應該放在 ${it.bins[c[1]]}`),
          given: `${it.chips.length - wrong.length}/${it.chips.length}`,
          right: it.bins.map((b, k) => `<b>${esc(b)}</b>：${it.chips.filter((c) => c[1] === k).map((c) => esc(c[0])).join('、')}`).join('<br>'),
        }
      },
      reveal() {
        C.locked = true
        $$('.sort-chip', C.el).forEach((b) => {
          const i = +b.dataset.c
          b.classList.add(place[i] === it.chips[i][1] ? 'ok' : 'bad')
        })
      },
    }
    return C
  },

  place(it) {
    let chosen = null
    const C = {
      html: `<div class="q-text">${qtext(it.q)}</div><p class="task">點一個虛線圈，把 ${it.scene.sub} 放上去。</p><div class="place-box"></div>`,
      draw(result) {
        $('.place-box', C.el).innerHTML = placeScene(it.scene, it.spots, chosen, result)
      },
      answered: () => chosen !== null,
      mount(el) {
        C.draw()
        el.addEventListener('click', (e) => {
          const s = e.target.closest('[data-spot]')
          if (!s || C.locked) return
          chosen = s.dataset.spot
          buzz(6)
          C.draw()
          C.onAnswer?.()
        })
        el.addEventListener('keydown', (e) => {
          const s = e.target.closest?.('[data-spot]')
          if (s && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            s.dispatchEvent(new MouseEvent('click', { bubbles: true }))
          }
        })
      },
      grade() {
        const ok = chosen === it.a
        return {
          r: ok ? 'ok' : 'bad',
          tags: ok ? [] : it.tags || [],
          msgs: ok ? [] : [`你放的位置是 ${REL_LABEL[chosen] || '（沒放）'}，題目要的是 ${REL_LABEL[it.a]}。`],
          given: chosen || '',
          right: `${esc(it.q)}（${REL_LABEL[it.a]}）`,
        }
      },
      reveal() {
        C.locked = true
        C.draw({ a: it.a })
      },
    }
    return C
  },
}

function feedbackHTML(it, res, ctx = {}) {
  const head =
    res.r === 'ok'
      ? ['ok', ctx.guess ? '猜對了！' : pick(['答對了！', '完全正確！', '漂亮！', '沒錯！']), ctx.guess ? '看一下解析，下次就不用猜了。' : ctx.streak >= 3 ? `連對 ${ctx.streak} 題 🔥` : '']
      : res.r === 'care'
        ? ['care', '內容對了，但格式粗心', '段考會被扣分！養成「寫完檢查」的習慣。']
        : ['bad', '再想想', ctx.exam ? '' : ctx.guess ? '這題本來就沒把握，看完解析就學會了。' : '很確定卻答錯？這種題目最值得弄懂。已放進錯題本。']
  const msgs = (res.msgs || []).map((m) => `<li>${esc(m)}</li>`).join('')
  const right = res.r !== 'ok' && res.right ? `<div class="fb-ans"><div class="fb-k">正確答案</div><div class="fb-v">${res.right}</div></div>` : ''
  const yours = res.r !== 'ok' && res.yours ? `<div class="fb-ans you"><div class="fb-k">你的答案</div><div class="fb-v">${res.yours}</div></div>` : ''
  const ex = it.ex ? `<div class="fb-ex">${ICON.bulb}<div>${rich(it.ex)}</div></div>` : ''
  const follow = it.follow ? `<details class="follow"><summary>延伸想一想：${esc(it.follow[0])}</summary><p>${esc(it.follow[1])}</p></details>` : ''
  const tr = it.passage && PASSAGES[it.passage] ? `<button type="button" class="link" data-zh>看文章中文翻譯</button>` : ''
  return `<div class="fb ${head[0]}"><div class="fb-head"><span class="fb-icon">${res.r === 'ok' ? ICON.check : res.r === 'care' ? '!' : ICON.x}</span><div><div class="fb-title">${head[1]}</div>${head[2] ? `<div class="fb-sub">${head[2]}</div>` : ''}</div></div>
    ${msgs ? `<ul class="fb-msgs">${msgs}</ul>` : ''}${yours}${right}${ex}${follow}${tr}</div>`
}
const pick = (a) => a[Math.floor(Math.random() * a.length)]
function revealExtras(C) {
  const el = C.el
  const t = $('.transcript', el)
  if (t) t.hidden = false
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-zh]')) {
      const z = $('.passage .zh', el) || $('.passage .zh', el.closest('.exam-group') || document)
      if (z) {
        z.hidden = !z.hidden
        z.closest('details')?.setAttribute('open', '')
      }
    }
  })
}

// ───────────────────────── 練習（一題一題） ─────────────────────────
let RUN = null // { key, C, hints, guess, checked, streak }
function startModule(mid) {
  const key = 'm:' + mid
  const ids = MODULES[mid].items.map((i) => i.id)
  const pr = S.progress[key]
  if (!pr || pr.done || pr.ids.join() !== ids.join()) S.progress[key] = { ids, i: 0, res: {}, t0: Date.now(), title: MODULES[mid].title, mid }
  save()
  go('#/run/' + encodeURIComponent(key))
}
function startRun(key, title, ids) {
  if (!ids.length) return toast('沒有題目可以練習', '👍')
  S.progress[key] = { ids, i: 0, res: {}, t0: Date.now(), title }
  save()
  go('#/run/' + encodeURIComponent(key))
}

function viewRun(key) {
  const pr = S.progress[key]
  if (!pr) return go('#/')
  if (pr.i >= pr.ids.length) return viewSummary(key)
  const it = ITEM[pr.ids[pr.i]]
  if (!it) {
    pr.i++
    save()
    return viewRun(key)
  }
  const scoredIdx = pr.ids.filter((id) => ITEM[id]?.t !== 'learn')
  const doneN = Object.keys(pr.res).length
  setView(
    `<div class="run">
      <header class="run-bar">
        <button class="icon-btn" data-act="close" aria-label="離開（進度會保留）">${ICON.x}</button>
        <div class="run-mid"><div class="run-title">${esc(pr.title)}</div><div class="run-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${pr.ids.length}" aria-valuenow="${pr.i}"><i style="width:${(pr.i / pr.ids.length) * 100}%"></i></div></div>
        <button class="icon-btn" data-act="notes" aria-label="重點">${ICON.notes}</button>
      </header>
      <div class="run-stage"><div class="run-count">${it.t === 'learn' ? '觀念' : `第 ${doneN + 1}／${scoredIdx.length} 題`}</div><div class="run-card"></div><div class="hint-box" hidden></div></div>
      <footer class="run-actions">
        <div class="ra-left">
          ${it.t === 'learn' ? '' : `<button class="pill" data-act="hint">${ICON.bulb}<span>提示</span></button><button class="pill toggle" data-act="guess" aria-pressed="false">🤔<span>有點猜</span></button>`}
        </div>
        <button class="btn primary big" data-act="check" disabled>${it.t === 'learn' ? '我懂了' : '檢查'}</button>
      </footer>
    </div>`,
    { tabs: false },
  )
  const C = makeItem(it, 'practice')
  $('.run-card').append(C.el)
  RUN = { key, C, it, hints: 0, guess: false, checked: false, streak: RUN?.key === key ? RUN.streak : 0 }
  const btn = $('[data-act=check]')
  C.onAnswer = () => (btn.disabled = !C.answered())
  C.onEnter = () => C.answered() && btn.click()
  if (C.focus && matchMedia('(pointer: fine)').matches) setTimeout(() => C.focus(), 60)
  $('.run').addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')
    if (!a) return
    const act = a.dataset.act
    if (act === 'close') return go('#/')
    if (act === 'notes') return showNotes(pr.mid || it.mid)
    if (act === 'hint') return showHint()
    if (act === 'guess') {
      RUN.guess = !RUN.guess
      a.setAttribute('aria-pressed', RUN.guess)
      return
    }
    if (act === 'check') return RUN.checked || it.t === 'learn' ? nextItem() : checkItem()
  })
}
function showHint() {
  const hs = hintsFor(RUN.it)
  if (RUN.hints >= hs.length) return toast('提示已經全部打開了', '💡')
  RUN.hints++
  const box = $('.hint-box')
  box.hidden = false
  box.innerHTML = hs
    .slice(0, RUN.hints)
    .map((h, i) => `<div class="hint"><span>提示 ${i + 1}</span>${esc(h)}</div>`)
    .join('')
}
function checkItem() {
  const { C, it } = RUN
  if (!C.answered()) return
  const res = C.grade()
  RUN.checked = true
  const pr = S.progress[RUN.key]
  pr.res[it.id] = res.r
  RUN.streak = res.r === 'ok' ? RUN.streak + 1 : 0
  const att = record(it, res, { h: RUN.hints, c: RUN.guess })
  save()
  C.reveal(res)
  const fb = $('.q-feedback', C.el)
  fb.innerHTML = feedbackHTML(it, res, { guess: RUN.guess, streak: RUN.streak })
  if (res.r !== 'ok') {
    fb.insertAdjacentHTML('beforeend', `<div class="why-me"><div class="fb-k">這題我錯在…（點一個，幫自己找原因）</div><div class="chips">${WHY_ME.map(([k, t]) => `<button type="button" class="chip pick" data-w="${k}">${t}</button>`).join('')}</div></div>`)
    $('.why-me', fb).addEventListener('click', (e) => {
      const b = e.target.closest('[data-w]')
      if (!b) return
      att.w = b.dataset.w
      save()
      $$('.why-me .pick', fb).forEach((x) => x.classList.toggle('on', x === b))
      buzz(6)
    })
  }
  fb.hidden = false
  revealExtras(C)
  checkBadges()
  C.el.classList.add('done', 'r-' + res.r)
  $('.ra-left').innerHTML = ''
  const btn = $('[data-act=check]')
  btn.textContent = pr.i + 1 >= pr.ids.length ? '看結果' : '繼續'
  btn.disabled = false
  btn.focus({ preventScroll: true })
  if (res.r === 'ok') buzz(15)
  else buzz([10, 60, 10])
  requestAnimationFrame(() => fb.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'nearest' }))
}
function nextItem() {
  const pr = S.progress[RUN.key]
  pr.i++
  save()
  Voice.stop()
  viewRun(RUN.key)
  $('.run-stage')?.scrollTo(0, 0)
  window.scrollTo(0, 0)
}

function viewSummary(key) {
  const pr = S.progress[key]
  const res = Object.entries(pr.res)
  const total = res.length
  const ok = res.filter(([, r]) => r === 'ok').length
  const care = res.filter(([, r]) => r === 'care').length
  const bad = total - ok - care
  const pct = total ? ok / total : 0
  const st = pct >= 0.9 ? 3 : pct >= 0.7 ? 2 : total ? 1 : 0
  if (!pr.done) {
    pr.done = true
    pr.t1 = Date.now()
    S.sessions.push({ k: key, m: pr.mid || key, title: pr.title, s: Math.round(pct * 100), n: total, ok, care, bad, stars: st, ts: Date.now(), dur: pr.t1 - pr.t0, d: S.profile.id })
    save()
    if (st === 3) setTimeout(celebrate, 350)
    checkBadges()
  }
  const missed = res.filter(([, r]) => r !== 'ok').map(([id]) => id)
  const tags = tagCounts(S.attempts.filter((a) => a.ts >= pr.t0 && missed.includes(a.q)))
  const nextMid = pr.mid ? MOD_ORDER[MOD_ORDER.indexOf(pr.mid) + 1] : null
  setView(
    `<div class="page narrow summary">
      <div class="sum-hero">
        <div class="sum-ring">${ring(pct, 148, 14, 'big')}<div class="sum-pct"><b>${Math.round(pct * 100)}</b><span>%</span></div></div>
        <h1>${pct >= 0.9 ? '太強了！' : pct >= 0.7 ? '很不錯！' : '完成了！'}</h1>
        <p class="muted">${esc(pr.title)} · ${fmtDur((pr.t1 || Date.now()) - pr.t0)}</p>
        ${stars(st)}
      </div>
      <div class="tiles three">
        <div class="tile"><div class="tile-v ok">${ok}</div><div class="tile-k">答對</div></div>
        <div class="tile"><div class="tile-v care">${care}</div><div class="tile-k">格式粗心</div></div>
        <div class="tile"><div class="tile-v bad">${bad}</div><div class="tile-k">答錯</div></div>
      </div>
      ${care ? `<div class="callout care"><b>如果沒有粗心，你可以拿 ${Math.round(((ok + care) / total) * 100)} 分。</b>粗心是可以練掉的：每題寫完，用手指點「開頭、人名、結尾」。</div>` : ''}
      ${tags.length ? `<div class="group"><div class="group-h">這次卡住的地方</div><div class="chips">${tags.map(([t, n]) => `<span class="chip ${FORMAT_TAGS.includes(t) ? 'care' : ''}">${TAGS[t] || t} × ${n}</span>`).join('')}</div></div>` : ''}
      ${
        missed.length
          ? `<div class="group"><div class="group-h">要再看一次的題目</div><div class="list">${missed.map((id) => `<button class="row" data-review="${id}"><span class="row-t">${esc(snippet(ITEM[id]))}</span><span class="row-r ${pr.res[id]}">${pr.res[id] === 'care' ? '粗心' : '錯'}</span>${ICON.chev}</button>`).join('')}</div></div>`
          : ''
      }
      <div class="sum-actions">
        ${missed.length ? `<button class="btn primary big" data-act="retry">重練這 ${missed.length} 題</button>` : ''}
        ${nextMid ? `<button class="btn ${missed.length ? 'ghost' : 'primary'} big" data-act="next">下一單元：${esc(MODULES[nextMid].title)}</button>` : ''}
        <button class="btn ghost big" data-act="home">回首頁</button>
      </div>
    </div>`,
    { tabs: false },
  )
  $('.summary').addEventListener('click', (e) => {
    const r = e.target.closest('[data-review]')
    if (r) return reviewSheet(r.dataset.review)
    const a = e.target.closest('[data-act]')?.dataset.act
    if (a === 'retry') startRun('retry:' + (pr.mid || key), `${pr.title}・重練`, missed)
    if (a === 'next') startModule(nextMid)
    if (a === 'home') go('#/')
  })
}
function snippet(it) {
  const s = it.q || it.toks?.join(' ') || it.words?.join(' ') || it.title || ''
  return s.replace(/\n/g, ' ').replace(/___/g, '＿＿').slice(0, 70)
}
// 看某一題的最後作答與解析（唯讀）
function reviewSheet(id) {
  const it = ITEM[id]
  const last = [...S.attempts].reverse().find((a) => a.q === id)
  const body = sheet(`<h2 class="sheet-title">題目回顧</h2><div class="review-slot"></div>`, { wide: true })
  const C = makeItem(it, 'review')
  $('.review-slot', body).append(C.el)
  const fb = $('.q-feedback', C.el)
  const right = rightAnswerText(it)
  fb.hidden = false
  fb.innerHTML = `<div class="fb ${last?.r || 'bad'}">${last ? `<div class="fb-ans you"><div class="fb-k">上次的答案</div><div class="fb-v">${esc(last.a) || '（空白）'}</div></div>` : ''}<div class="fb-ans"><div class="fb-k">正確答案</div><div class="fb-v">${right}</div></div>${it.ex ? `<div class="fb-ex">${ICON.bulb}<div>${rich(it.ex)}</div></div>` : ''}</div>`
  $$('button, input, textarea', C.el).forEach((b) => {
    if (!b.closest('.audio') && !b.matches('.say')) b.disabled = true
  })
  const t = $('.transcript', C.el)
  if (t) t.hidden = false
}
function rightAnswerText(it) {
  if (it.t === 'mcq') return esc(it.opts[it.a])
  if (it.t === 'multi') return it.a.map((i) => esc(it.opts[i])).join('、')
  if (it.t === 'fill') return it.ans.map((a) => esc(a[0])).join('　/　')
  if (it.t === 'write') return esc(it.acc[0])
  if (it.t === 'order') return it.lines ? it.words.map((w, i) => `${i + 1}. ${esc(w)}`).join('<br>') : esc(joinTokens(it.words))
  if (it.t === 'spot') return esc(it.toks.map((t, i) => (i === it.bad ? it.acc[0] : t)).filter(Boolean).join(' '))
  if (it.t === 'sort') return it.bins.map((b, k) => `<b>${esc(b)}</b>：${it.chips.filter((c) => c[1] === k).map((c) => esc(c[0])).join('、')}`).join('<br>')
  if (it.t === 'place') return REL_LABEL[it.a]
  return ''
}

function celebrate() {
  if (reduceMotion()) return
  const box = document.createElement('div')
  box.className = 'confetti'
  const colors = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#007aff', '#af52de']
  box.innerHTML = Array.from({ length: 36 }, (_, i) => `<i style="--x:${Math.random() * 100}vw;--d:${0.9 + Math.random() * 0.9}s;--r:${Math.random() * 720 - 360}deg;--c:${colors[i % colors.length]};--s:${0.6 + Math.random() * 0.8}"></i>`).join('')
  document.body.append(box)
  setTimeout(() => box.remove(), 2200)
}

// ───────────────────────── 重點 ─────────────────────────
function notesHTML(mid) {
  const m = MODULES[mid]
  const cards = m.items.filter((i) => i.t === 'learn')
  return `<div class="notes-mod"><div class="notes-h"><span class="mod-ic">${m.icon}</span><div><div class="eyebrow">${esc(m.unit)}</div><h2>${esc(m.title)}</h2></div></div>
    ${cards.map((c) => `<section class="note"><h3>${esc(c.title)}</h3>${c.fig && c.fig.k !== 'preps' ? figure(c.fig) : ''}<div class="note-show">${rich(c.show)}</div><div class="note-rule">${rich(c.rule)}</div>${c.tip ? `<div class="tip"><b>易錯提醒</b>${rich(c.tip)}</div>` : ''}</section>`).join('')}</div>`
}
function showNotes(mid) {
  sheet(notesHTML(mid), { wide: true })
}
function viewAllNotes() {
  setView(
    `<div class="page notes-page">
      ${header('重點總整理', '考前一天從頭看一遍；可以列印成講義。', `<button class="btn ghost" data-print>${ICON.doc}<span>列印</span></button>`, true)}
      <div class="callout"><b>交卷前 30 秒檢查清單</b><ol class="check-ol">${CHECKLIST.map((c) => `<li>${esc(c)}</li>`).join('')}</ol></div>
      ${MOD_ORDER.map(notesHTML).join('')}
    </div>`,
  )
  $('[data-print]').onclick = () => window.print()
}

// ───────────────────────── 首頁 ─────────────────────────
function header(title, sub, right = '', back = false) {
  return `<header class="lg-head">${back ? `<button class="back" data-back>${ICON.back}<span>返回</span></button>` : ''}<div class="lg-row"><div><h1>${esc(title)}</h1>${sub ? `<p class="lg-sub">${esc(sub)}</p>` : ''}</div>${right}</div></header>`
}
function examCountdown() {
  if (!S.profile.exam) return ''
  const d = Math.round((dayStart(new Date(S.profile.exam + 'T00:00').getTime()) - dayStart()) / DAY)
  if (isNaN(d)) return ''
  return d > 0 ? `距離段考 <b>${d}</b> 天` : d === 0 ? '<b>今天段考，加油！</b>' : ''
}
function viewHome() {
  const t = todayStats()
  const goal = S.profile.goal || 30
  const book = bookIds().length
  const sd = streakDays()
  const resume = Object.entries(S.progress)
    .filter(([k, p]) => !p.done && p.i > 0 && p.i < p.ids.length)
    .sort((a, b) => (b[1].t0 || 0) - (a[1].t0 || 0))[0]
  const examBest = S.sessions.filter((s) => s.k === 'exam')
  const hour = new Date().getHours()
  const hello = hour < 11 ? '早安' : hour < 18 ? '午安' : '晚安'
  const cd = examCountdown()
  setView(
    `<div class="page home">
      <header class="lg-head"><div class="eyebrow">${new Date().toLocaleDateString('zh-TW', { month: 'long', day: 'numeric', weekday: 'long' })}</div>
        <div class="lg-row"><h1>${hello}</h1>${sd ? `<span class="streak">${ICON.flame}<b>${sd}</b> 天</span>` : ''}</div>
        <p class="lg-sub">翰林版七上｜第一次段考：Starter～Review 1${cd ? '　·　' + cd : ''}</p>
      </header>

      <section class="today card">
        <div class="rings" aria-hidden="true">
          ${ring(t.n / goal, 104, 11, 'r1')}
          <div class="ring-in">${ring(t.n ? t.acc : 0, 78, 11, 'r2')}</div>
          <div class="ring-in2">${ring(t.n ? t.careFree : 0, 52, 11, 'r3')}</div>
        </div>
        <div class="today-txt">
          <div class="today-h">今天</div>
          <div class="today-row"><i class="dot r1"></i>練習<b>${t.n}</b><span>／${goal} 題</span></div>
          <div class="today-row"><i class="dot r2"></i>正確率<b>${t.n ? Math.round(t.acc * 100) : '—'}</b><span>${t.n ? '%' : ''}</span></div>
          <div class="today-row"><i class="dot r3"></i>細心度<b>${t.n ? Math.round(t.careFree * 100) : '—'}</b><span>${t.n ? '%' : ''}</span></div>
        </div>
        ${resume ? `<button class="resume" data-resume="${esc(resume[0])}"><span class="resume-k">繼續上次</span><span class="resume-t">${esc(resume[1].title)}・第 ${resume[1].i + 1} 張</span>${ICON.chev}</button>` : nextStepHTML(book)}
      </section>
      ${planHTML()}

      <section class="quick">
        <button class="qk qk-exam" data-go="#/exam"><span class="qk-ic">${ICON.doc}</span><span class="qk-t">模擬段考</span><span class="qk-s">${examBest.length ? `最高 ${Math.max(...examBest.map((s) => s.s))} 分` : '約 30 題・交卷前要檢查'}</span></button>
        <button class="qk qk-flash" data-go="#/flash"><span class="qk-ic">${ICON.bolt}</span><span class="qk-t">閃電挑戰</span><span class="qk-s">${S.flash.best ? `最高 ${S.flash.best} 題` : '60 秒反應力'}</span></button>
        <button class="qk qk-book" data-go="#/book"><span class="qk-ic">${ICON.book}</span><span class="qk-t">錯題本</span><span class="qk-s">${book ? `${book} 題待複習` : '目前沒有錯題'}</span></button>
        <button class="qk qk-notes" data-go="#/notes"><span class="qk-ic">${ICON.notes}</span><span class="qk-t">重點總整理</span><span class="qk-s">考前一頁看完</span></button>
      </section>

      ${LESSONS.map(
        (L) => `<section class="lesson">
          <div class="sec-h"><div><h2>${esc(L.title)}</h2><p>${esc(L.sub)}</p></div><button class="link" data-plan="${L.id}">上課流程</button></div>
          <div class="mods">${L.modules
            .map((mid) => {
              const m = MODULES[mid]
              const st = moduleStats(mid)
              const p = S.progress['m:' + mid]
              const inProg = p && !p.done && p.i > 0
              return `<button class="mod" data-mod="${mid}">
                <span class="mod-ic">${m.icon}</span>
                <span class="mod-body"><span class="eyebrow">${esc(m.unit)}・${m.min} 分鐘</span><span class="mod-t">${esc(m.title)}</span>
                <span class="mod-bar"><i style="width:${(st.mastered / st.total) * 100}%"></i></span>
                <span class="mod-s">${inProg ? `進行中・第 ${p.i + 1}／${p.ids.length} 張` : st.done ? `精熟 ${st.mastered}／${st.total}` : `${st.total} 題・還沒開始`}</span></span>
                ${st.best ? stars(st.best) : ''}
              </button>`
            })
            .join('')}</div>
        </section>`,
      ).join('')}

      <section class="card checklist-card">
        <div class="sec-h"><div><h2>交卷前 30 秒檢查</h2><p>每次寫完考卷，照順序看一遍。</p></div></div>
        <ol class="check-ol">${CHECKLIST.map((c) => `<li>${esc(c)}</li>`).join('')}</ol>
      </section>
      <p class="foot">內容依翰林版七上課本範圍自編（不含課本原文）· 版本 ${VERSION}</p>
    </div>`,
  )
  const v = $('.home')
  v.addEventListener('click', (e) => {
    const m = e.target.closest('[data-mod]')
    if (m) return startModule(m.dataset.mod)
    const g = e.target.closest('[data-go]')
    if (g) return go(g.dataset.go)
    const r = e.target.closest('[data-resume]')
    if (r) return go('#/run/' + encodeURIComponent(r.dataset.resume))
    const p = e.target.closest('[data-plan]')
    if (p) return planSheet(p.dataset.plan)
    const n = e.target.closest('[data-next]')
    if (n) return n.dataset.next.startsWith('mod:') ? startModule(n.dataset.next.slice(4)) : go(n.dataset.next)
    if (e.target.closest('[data-warm]')) return startRun('warm', '每日暖身', warmIds())
  })
  welcome()
}
function warmIds() {
  const t0 = dayStart()
  const last = lastByItem()
  const book = new Set(bookIds())
  const old = ALL_SCORED.filter((i) => last[i.id] && last[i.id].ts < t0)
  // 優先抽：以前答對、但不在錯題本的（考考看還記不記得）；不夠再補錯題本的
  const ids = [...shuffle(old.filter((i) => !book.has(i.id))), ...shuffle(old.filter((i) => book.has(i.id)))]
  return ids.slice(0, 5).map((i) => i.id)
}
// 第一次打開：像 Apple App 的「歡迎」畫面，告訴學生怎麼用
function welcome() {
  if (S.seen?.intro) return
  sheet(
    `<div class="welcome">
      <img class="w-logo" src="icon.svg" alt="" width="72" height="72">
      <h2>歡迎使用英文段考複習</h2>
      <p class="sheet-p">翰林版七上・第一次段考（Starter～Review 1）</p>
      <div class="w-rows">
        <div class="w-row"><span class="w-ic">💡</span><div><b>先猜，再看重點</b><p>每個單元先用觀念卡讓你猜規則。猜錯也沒關係，自己想過的記得更牢。</p></div></div>
        <div class="w-row"><span class="w-ic">🔎</span><div><b>抓出粗心</b><p>大寫、標點、空格寫錯都會被抓出來，養成「寫完檢查」的習慣。</p></div></div>
        <div class="w-row"><span class="w-ic">📗</span><div><b>錯題會再回來</b><p>答錯的題目收進錯題本，隔一段時間再答對兩次才會畢業。</p></div></div>
        <div class="w-row"><span class="w-ic">📤</span><div><b>紀錄存在這台裝置</b><p>到「紀錄」可以把學習報告或備份檔傳給老師。</p></div></div>
      </div>
      <button class="btn primary big w-go" data-close>開始</button>
    </div>`,
    {
      onClose: () => {
        S.seen = { ...(S.seen || {}), intro: Date.now() }
        save()
      },
    },
  )
}
// 今天的任務：依段考日期，把還沒完成的單元平均分到剩下的天數；錯題本每天先做（間隔複習）；最後兩天做模擬段考
function todayPlan() {
  const t0 = dayStart()
  const examT = S.profile.exam ? dayStart(new Date(S.profile.exam + 'T00:00').getTime()) : null
  const daysLeft = examT == null || isNaN(examT) ? null : Math.round((examT - t0) / DAY)
  const modSess = S.sessions.filter((s) => s.k?.startsWith('m:'))
  const doneMods = new Set(modSess.filter((s) => s.ts < t0).map((s) => s.m))
  const todayKeys = new Set(S.sessions.filter((s) => s.ts >= t0).map((s) => s.k))
  const remaining = MOD_ORDER.filter((m) => !doneMods.has(m))
  const studyDays = daysLeft == null ? 4 : Math.max(1, daysLeft - 1)
  const per = Math.min(remaining.length, Math.max(2, Math.ceil(remaining.length / studyDays)))
  const tasks = []
  const book = bookIds().length
  // 每日暖身：先從「之前的日子」學過的題目抽 5 題（提取練習＋間隔，比重讀筆記有效）
  if (warmIds().length >= 3 || todayKeys.has('warm')) tasks.push({ t: '暖身：之前學過的 5 題', sub: '先回想，再開始新的', done: todayKeys.has('warm'), warm: true })
  if (book || todayKeys.has('book')) tasks.push({ t: '錯題本重練', sub: book ? `還有 ${book} 題` : '今天的錯題清完了', done: todayKeys.has('book') || !book, go: '#/book' })
  if (daysLeft == null || daysLeft >= 1)
    for (const m of remaining.slice(0, per)) tasks.push({ t: `${MODULES[m].icon} ${MODULES[m].title}`, sub: `${MODULES[m].unit}・約 ${MODULES[m].min} 分鐘`, done: todayKeys.has('m:' + m), mod: m })
  if (!remaining.length || (daysLeft != null && daysLeft <= 2)) tasks.push({ t: '模擬段考一回', sub: '交卷前走過檢查清單', done: todayKeys.has('exam'), go: '#/exam' })
  if (daysLeft != null && daysLeft <= 1) tasks.push({ t: '重點總整理看一遍', sub: '考前一天', done: false, go: '#/notes' })
  if (!tasks.length) tasks.push({ t: '閃電挑戰暖暖身', sub: '60 秒', done: todayKeys.has('flash'), go: '#/flash' })
  return { tasks, daysLeft }
}
function planHTML() {
  const { tasks, daysLeft } = todayPlan()
  const done = tasks.filter((t) => t.done).length
  const sub =
    daysLeft == null ? '到「設定」填段考日期，會自動把單元分配到每一天。' : daysLeft > 0 ? `距離段考 ${daysLeft} 天：照這個進度剛剛好。錯題每天先做，隔天再做記得更牢。` : daysLeft === 0 ? '今天段考！看重點、記得檢查清單。' : '段考結束了，辛苦了！'
  return `<section class="card plan-card">
    <div class="sec-h"><div><h2>今天的任務</h2><p>${esc(sub)}</p></div><span class="plan-count${done === tasks.length ? ' all' : ''}">${done === tasks.length ? '全部完成 🎉' : `${done}／${tasks.length}`}</span></div>
    <div class="list flat">${tasks
      .map((t) => `<button class="row task${t.done ? ' done' : ''}" ${t.warm ? 'data-warm' : t.mod ? `data-mod="${t.mod}"` : `data-go="${t.go}"`}><span class="chk-box">${ICON.check}</span><span class="row-t">${esc(t.t)}<small>${esc(t.sub)}</small></span>${ICON.chev}</button>`)
      .join('')}</div>
  </section>`
}

// 下一步建議：錯題（間隔複習）優先 → 還沒做完的單元 → 模擬段考
function nextStepHTML(book) {
  let k = ''
  let t = ''
  let go = ''
  const firstUndone = MOD_ORDER.find((m) => moduleStats(m).done < MODULES[m].scored.length)
  const weakest = MOD_ORDER.map((m) => [m, moduleStats(m)]).filter(([, s]) => s.done).sort((a, b) => a[1].mastered / a[1].total - b[1].mastered / b[1].total)[0]
  if (book >= 5) [k, t, go] = ['建議下一步', `錯題本有 ${book} 題，先複習`, '#/book']
  else if (firstUndone) [k, t, go] = [S.attempts.length ? '建議下一步' : '從這裡開始', `${MODULES[firstUndone].icon} ${MODULES[firstUndone].title}`, 'mod:' + firstUndone]
  else if (book) [k, t, go] = ['建議下一步', `錯題本還有 ${book} 題`, '#/book']
  else if (weakest && weakest[1].mastered < weakest[1].total) [k, t, go] = ['建議加強', `${MODULES[weakest[0]].icon} ${MODULES[weakest[0]].title}`, 'mod:' + weakest[0]]
  else [k, t, go] = ['全部精熟！', '來一回模擬段考', '#/exam']
  return `<button class="resume" data-next="${go}"><span class="resume-k">${k}</span><span class="resume-t">${esc(t)}</span>${ICON.chev}</button>`
}
function planSheet(lid) {
  const L = LESSONS.find((l) => l.id === lid)
  const total = L.modules.reduce((s, m) => s + MODULES[m].min, 0)
  sheet(
    `<h2 class="sheet-title">${esc(L.title)}・上課流程</h2><p class="sheet-p">${esc(L.sub)}　·　全部約 ${total} 分鐘</p>
    <div class="group"><div class="group-h">老師可以這樣帶</div><ul class="plan">${L.plan.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>
    <div class="group"><div class="group-h">單元順序</div><div class="list">${L.modules
      .map((mid, i) => `<button class="row" data-mod="${mid}"><span class="row-n">${i + 1}</span><span class="row-t">${MODULES[mid].icon} ${esc(MODULES[mid].title)}</span><span class="row-r">${MODULES[mid].min} 分</span>${ICON.chev}</button>`)
      .join('')}</div></div>
    <p class="sheet-p small">每個單元都是「觀念卡（先讓學生猜）→ 練習題（提示是一層一層的引導問題）→ 結果」。學生答錯時，先按「提示」讓他自己想，再看解析。</p>
    <div class="sheet-actions"><button class="btn ghost" data-print-lesson="${L.id}">${ICON.doc}<span>列印這一堂的紙本練習卷</span></button></div>`,
  ).addEventListener('click', (e) => {
    const m = e.target.closest('[data-mod]')
    if (m) {
      closeSheet()
      startModule(m.dataset.mod)
    }
    const pl = e.target.closest('[data-print-lesson]')
    if (pl) go('#/print/' + pl.dataset.printLesson)
  })
}

// ───────────────────────── 紙本練習卷（段考是寫在紙上） ─────────────────────────
function paperItem(it) {
  const q = (s) => esc(s).replace(/___/g, '<span class="p-blank"></span>').replace(/\n/g, '<br>')
  const opts = (list) => `<ol class="p-opts${list.every((o) => o.length <= 14) ? ' inline' : ''}" type="A">${list.map((o) => `<li>${esc(o)}</li>`).join('')}</ol>`
  const fig = it.fig ? `<div class="p-fig">${figure(it.fig)}</div>` : ''
  if (it.t === 'mcq') return `${fig}<div>${q(it.q)}</div>${opts(it.opts)}`
  if (it.t === 'multi') return `${fig}<div>${q(it.q)}${it.q.includes('全部') ? '' : '（複選）'}</div>${opts(it.opts)}`
  if (it.t === 'fill') return `${fig}<div class="p-fill">${q(it.q)}</div>`
  if (it.t === 'write') return `${fig}<div class="p-task">${esc(it.task)}</div><div class="p-src">${q(it.q)}</div><div class="p-line"></div>`
  if (it.t === 'order') {
    if (it.lines) {
      const sh = shuffle(it.words)
      return `<div class="p-task">${esc(it.q || '排出正確順序')}（寫代號）</div><ol class="p-opts" type="a">${sh.map((w) => `<li>${esc(w)}</li>`).join('')}</ol><div class="p-line short"></div>`
    }
    return `<div class="p-task">重組句子${it.extra?.length ? '（有多的字）' : ''}：</div><div class="p-src">${shuffle([...it.words, ...(it.extra || [])]).map(esc).join(' / ')}</div><div class="p-line"></div>`
  }
  if (it.t === 'spot') return `<div class="p-task">找出錯誤並改正：</div><div class="p-src">${esc(it.toks.join(' '))}</div><div class="p-fix">錯誤：＿＿＿＿＿＿　→ 改成：＿＿＿＿＿＿</div>`
  if (it.t === 'sort') return `<div class="p-task">${esc(it.q.replace(/[:：].*$/, ''))}</div><div class="p-src">${shuffle(it.chips.map((c) => c[0])).map(esc).join('、')}</div><table class="p-bins"><tr>${it.bins.map((b) => `<th>${esc(b)}</th>`).join('')}</tr><tr>${it.bins.map(() => '<td></td>').join('')}</tr></table>`
  return ''
}
function viewPrint(key) {
  let ids = []
  let title = ''
  const L = LESSONS.find((l) => l.id === key)
  if (key === 'book') {
    ids = bookIds()
    title = '錯題卷'
  } else if (L) {
    ids = L.modules.flatMap((m) => MODULES[m].scored.map((i) => i.id))
    title = `${L.title}練習卷`
  } else if (MODULES[key]) {
    ids = MODULES[key].scored.map((i) => i.id)
    title = `${MODULES[key].title}練習卷`
  }
  const order = new Map(ALL_SCORED.map((it, i) => [it.id, i]))
  const items = ids
    .map((id) => ITEM[id])
    .filter((it) => it && !it.audio && it.t !== 'place' && !(it.t === 'sort' && it.say))
    .sort((a, b) => order.get(a.id) - order.get(b.id))
  const shown = new Set()
  let n = 0
  const body = items
    .map((it) => {
      let pre = ''
      if (it.passage && !shown.has(it.passage)) {
        shown.add(it.passage)
        const p = PASSAGES[it.passage]
        pre = `<div class="p-passage"><b>${esc(p.title)}</b><p>${esc(p.text).replace(/__\((\d)\)__/g, '<u>　($1)　</u>')}</p></div>`
      }
      return `${pre}<li class="p-q">${paperItem(it)}</li>`
    })
    .join('')
  const key2 = items.map((it) => `<li>${rightAnswerText(it)}</li>`).join('')
  n = items.length
  setView(
    `<div class="page narrow paper-page">
      ${header(title, n ? `共 ${n} 題（聽力、放位置這類要在 App 上做的題目不印）` : '目前沒有題目可以印', n ? `<button class="btn primary" data-print>${ICON.doc}<span>列印</span></button>` : '', true)}
      ${n ? `<div class="paper"><div class="p-head"><b>${esc(title)}</b><span>班級：＿＿＿　姓名：＿＿＿＿＿＿　得分：＿＿＿</span></div><ol class="p-list">${body}</ol>
      <div class="p-check"><b>交卷前 30 秒檢查</b>${CHECKLIST.map((c) => `☐ ${esc(c)}`).join('<br>')}</div></div>
      <div class="paper p-answers"><div class="p-head"><b>${esc(title)}・解答</b></div><ol class="p-key">${key2}</ol></div>` : ''}
    </div>`,
  )
  $('[data-print]')?.addEventListener('click', () => window.print())
}

// ───────────────────────── 錯題本 ─────────────────────────
function viewBook() {
  const st = bookState()
  const ids = Object.keys(st).filter((q) => st[q].inBook)
  const grads = Object.keys(st).filter((q) => !st[q].inBook)
  const byMod = {}
  for (const id of ids) (byMod[ITEM[id].mid] ||= []).push(id)
  setView(
    `<div class="page">
      ${header('錯題本', '答錯或粗心的題目會留在這裡。要「隔一段時間再答對兩次」才會畢業：間隔複習，記得最久。')}
      ${
        ids.length
          ? `<div class="book-cta card"><div><div class="book-n">${ids.length}</div><div class="muted">題待複習${grads.length ? `・已畢業 ${grads.length} 題` : ''}</div></div>
            <div class="book-btns"><button class="btn ghost big" data-go="#/print/book">${ICON.doc}<span>列印錯題卷</span></button><button class="btn primary big" data-act="all">開始重練${ids.length > 12 ? '（先做 12 題）' : ''}</button></div></div>
            <p class="muted small pad">題目會打散不同單元的順序（交錯練習），比照段考的感覺。</p>
            ${MOD_ORDER.filter((m) => byMod[m])
              .map(
                (mid) => `<div class="group"><div class="group-h">${MODULES[mid].icon} ${esc(MODULES[mid].unit)}｜${esc(MODULES[mid].title)}</div><div class="list">${byMod[mid]
                  .map((id) => `<button class="row" data-review="${id}"><span class="row-t">${esc(snippet(ITEM[id]))}</span><span class="row-r ${st[id].last.r}">錯 ${st[id].wrong} 次${st[id].oks ? `・已對 ${st[id].oks}` : ''}</span>${ICON.chev}</button>`)
                  .join('')}</div></div>`,
              )
              .join('')}`
          : `<div class="empty card"><div class="empty-ic">📗</div><h2>${grads.length ? '錯題全部畢業了！' : '目前沒有錯題'}</h2><p class="muted">${grads.length ? `已經有 ${grads.length} 題從錯題本畢業。` : '去練習吧，答錯的題目會自動收進來。'}</p><button class="btn primary" data-go="#/">去練習</button></div>`
      }
    </div>`,
  )
  $('.page').addEventListener('click', (e) => {
    const r = e.target.closest('[data-review]')
    if (r) return reviewSheet(r.dataset.review)
    if (e.target.closest('[data-act=all]')) return startRun('book', '錯題重練', shuffle(ids).slice(0, 12))
    const g = e.target.closest('[data-go]')
    if (g) go(g.dataset.go)
  })
}

// ───────────────────────── 模擬段考 ─────────────────────────
let EXAM = null
function buildExam() {
  const last = lastByItem()
  const weak = (list) => shuffle(list).sort((a, b) => (last[a.id]?.r === 'ok') - (last[b.id]?.r === 'ok'))
  const pool = ALL_SCORED
  const take = (list, n) => weak(list).slice(0, n)
  const listen = take(pool.filter((i) => i.audio && i.t === 'mcq'), 5)
  const vocab = take(pool.filter((i) => i.t === 'fill' && !i.audio && !i.passage && !i.fig), 5)
  const grammar = take(pool.filter((i) => i.t === 'mcq' && !i.audio && !i.passage && !i.fig), 8)
  const fix = take(pool.filter((i) => i.t === 'spot' || (i.t === 'order' && !i.lines)), 4)
  const write = take(pool.filter((i) => i.t === 'write' && !i.fig), 4)
  const pid = pick(['leo', 'rita', 'nina'])
  const read = pool.filter((i) => i.passage === pid)
  return [
    { h: '一、聽力測驗', sub: '每題可以重聽', items: listen },
    { h: '二、字彙與拼字', sub: '注意大小寫和拼字', items: vocab },
    { h: '三、文法選擇', sub: '', items: grammar },
    { h: '四、找錯與重組', sub: '', items: fix },
    { h: '五、句型改寫', sub: '整句要寫完整：大寫、標點都算分', items: write },
    { h: '六、閱讀測驗', sub: PASSAGES[pid].title, items: read, passage: pid },
  ]
}
function viewExam() {
  if (!EXAM || EXAM.graded) {
    setView(
      `<div class="page narrow">
        ${header('模擬段考', '', '', true)}
        <div class="card exam-intro">
          <div class="exam-ic">${ICON.doc}</div>
          <h2>約 30 題，比照段考題型</h2>
          <ul class="plain">
            <li>聽力、字彙、文法、找錯重組、句型改寫、閱讀，六大題混在一起考。</li>
            <li>寫的時候<b>不會</b>馬上告訴你對錯，交卷後才一起批改。</li>
            <li>交卷前會出現「30 秒檢查清單」，養成檢查習慣。</li>
            <li>題目會優先挑你還沒精熟的。</li>
          </ul>
          <button class="btn primary big" data-act="start">開始考試</button>
        </div>
        ${examHistory()}
      </div>`,
    )
    $('[data-act=start]').onclick = () => {
      EXAM = { secs: buildExam(), t0: Date.now(), ctrls: [], graded: false }
      viewExam()
    }
    return
  }
  let n = 0
  setView(
    `<div class="exam">
      <header class="run-bar">
        <button class="icon-btn" data-act="quit" aria-label="放棄考試">${ICON.x}</button>
        <div class="run-mid"><div class="run-title">模擬段考</div><div class="exam-meta"><span class="exam-done">0</span>／<span class="exam-total"></span> 題・<span class="exam-time">0:00</span></div></div>
        <span class="icon-btn ghost-space"></span>
      </header>
      <div class="page narrow exam-paper"></div>
      <footer class="run-actions exam-foot"><span class="muted small exam-left"></span><button class="btn primary big" data-act="submit">交卷</button></footer>
    </div>`,
    { tabs: false },
  )
  const paper = $('.exam-paper')
  EXAM.ctrls = []
  for (const sec of EXAM.secs) {
    if (!sec.items.length) continue
    const g = document.createElement('section')
    g.className = 'exam-group'
    g.innerHTML = `<div class="exam-h"><h2>${esc(sec.h)}</h2>${sec.sub ? `<span>${esc(sec.sub)}</span>` : ''}</div>${sec.passage ? passageHTML(sec.passage, 'practice') : ''}`
    for (const it of sec.items) {
      const C = makeItem(it, 'exam')
      C.n = ++n
      C.el.insertAdjacentHTML('afterbegin', `<div class="q-num">${C.n}</div>`)
      C.onAnswer = updateExamCount
      g.append(C.el)
      EXAM.ctrls.push(C)
    }
    paper.append(g)
  }
  $('.exam-total').textContent = n
  updateExamCount()
  clearInterval(EXAM.timer)
  EXAM.timer = setInterval(() => {
    const el = $('.exam-time')
    if (!el) return clearInterval(EXAM.timer)
    const s = Math.floor((Date.now() - EXAM.t0) / 1000)
    el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }, 1000)
  $('.exam').addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act
    if (a === 'quit') confirmSheet('要放棄這次考試嗎？', '寫到一半的答案不會留下紀錄。', '放棄', () => ((EXAM = null), go('#/')), true)
    if (a === 'submit') submitSheet()
  })
}
function updateExamCount() {
  const done = EXAM.ctrls.filter((c) => c.answered()).length
  const left = EXAM.ctrls.length - done
  const d = $('.exam-done')
  if (d) d.textContent = done
  const l = $('.exam-left')
  if (l) l.textContent = left ? `還有 ${left} 題沒寫` : '全部寫完了'
}
function submitSheet() {
  const left = EXAM.ctrls.filter((c) => !c.answered())
  const b = sheet(
    `<h2 class="sheet-title">交卷前 30 秒檢查</h2><p class="sheet-p">真的段考也這樣做：每一項看過，就點一下打勾。</p>
    <div class="list checks">${CHECKLIST.map((c, i) => `<button class="row chk" data-c="${i}" role="checkbox" aria-checked="false"><span class="chk-box">${ICON.check}</span><span class="row-t">${esc(c)}</span></button>`).join('')}</div>
    ${left.length ? `<div class="callout care">還有 <span class="num">${left.length}</span> 題沒寫（第 ${left.slice(0, 6).map((c) => c.n).join('、')}${left.length > 6 ? ' 等' : ''} 題）。<button class="link" data-jump="${left[0].n}">去第 ${left[0].n} 題</button></div>` : ''}
    <div class="sheet-actions"><button class="btn ghost" data-close>回去再檢查</button><button class="btn primary" data-go disabled>全部檢查完，交卷</button></div>`,
  )
  const done = new Set()
  b.addEventListener('click', (e) => {
    const c = e.target.closest('.chk')
    if (c) {
      const i = +c.dataset.c
      done.has(i) ? done.delete(i) : done.add(i)
      c.classList.toggle('on', done.has(i))
      c.setAttribute('aria-checked', done.has(i))
      $('[data-go]', b).disabled = done.size < CHECKLIST.length
      buzz(6)
    }
    const j = e.target.closest('[data-jump]')
    if (j) {
      closeSheet()
      const C = EXAM.ctrls.find((x) => x.n === +j.dataset.jump)
      C?.el.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'center' })
    }
    if (e.target.closest('[data-go]') && done.size >= CHECKLIST.length) {
      closeSheet()
      gradeExam()
    }
  })
}
function gradeExam() {
  clearInterval(EXAM.timer)
  let ok = 0
  let care = 0
  const tags = {}
  for (const C of EXAM.ctrls) {
    const res = C.grade()
    C.res = res
    if (res.r === 'ok') ok++
    else if (res.r === 'care') care++
    for (const t of res.tags || []) if (res.r !== 'ok') tags[t] = (tags[t] || 0) + 1
    record(C.it, res, { x: 'e' })
    C.reveal(res)
    const fb = $('.q-feedback', C.el)
    fb.innerHTML = feedbackHTML(C.it, res, { exam: true })
    fb.hidden = false
    revealExtras(C)
    C.el.classList.add('done', 'r-' + res.r)
  }
  const total = EXAM.ctrls.length
  const score = Math.round((ok / total) * 100)
  const ifCare = Math.round(((ok + care) / total) * 100)
  const dur = Date.now() - EXAM.t0
  S.sessions.push({ k: 'exam', m: 'exam', title: '模擬段考', s: score, n: total, ok, care, bad: total - ok - care, ifCare, stars: score >= 90 ? 3 : score >= 70 ? 2 : 1, ts: Date.now(), dur, d: S.profile.id })
  save()
  checkBadges()
  EXAM.graded = true
  const tagList = Object.entries(tags).sort((a, b) => b[1] - a[1])
  const head = document.createElement('section')
  head.className = 'exam-result card'
  head.innerHTML = `<div class="er-score"><b>${score}</b><span>分</span></div>
    <div class="er-txt"><div>答對 ${ok}・格式粗心 ${care}・答錯 ${total - ok - care}・${fmtDur(dur)}</div>
    ${care ? `<div class="er-care">如果沒有粗心：<b>${ifCare} 分</b>（差 ${ifCare - score} 分）</div>` : ok >= total * 0.6 ? '<div class="er-care ok">零粗心，太讚了！</div>' : ''}
    ${tagList.length ? `<div class="chips">${tagList.slice(0, 6).map(([t, n]) => `<span class="chip ${FORMAT_TAGS.includes(t) ? 'care' : ''}">${TAGS[t] || t} × ${n}</span>`).join('')}</div>` : ''}</div>
    <div class="er-btns"><button class="btn primary" data-act="book">去錯題本</button><button class="btn ghost" data-act="again">再考一次</button></div>`
  $('.exam-paper').prepend(head)
  $('.exam-foot').innerHTML = `<span class="muted small">往下看每一題的解析</span><button class="btn primary big" data-act="home">回首頁</button>`
  $('.exam-foot').addEventListener('click', (e) => e.target.closest('[data-act=home]') && go('#/'))
  head.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act
    if (a === 'book') go('#/book')
    if (a === 'again') {
      EXAM = null
      viewExam()
    }
  })
  window.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' })
  if (score >= 90) setTimeout(celebrate, 300)
}
function examHistory() {
  const list = S.sessions.filter((s) => s.k === 'exam').slice(-8).reverse()
  if (!list.length) return ''
  return `<div class="group"><div class="group-h">考試紀錄</div><div class="list">${list
    .map((s) => `<div class="row static"><span class="row-t">${fmtTime(s.ts)}</span><span class="row-r">${s.s} 分${s.care ? `<small>（沒粗心 ${s.ifCare}）</small>` : ''}</span></div>`)
    .join('')}</div></div>`
}

// ───────────────────────── 閃電挑戰 ─────────────────────────
let FL = null
function flashQ() {
  const kind = pick(['be', 'be', 'aan', 'plural', 'poss'])
  if (kind === 'be') {
    const [s, a] = pick(FLASH.be)
    return { k: 'be 動詞', q: `${s} ___ ...`, opts: ['am', 'is', 'are'], a }
  }
  if (kind === 'aan') {
    const [w, a] = pick(FLASH.aan)
    return { k: 'a / an', q: `___ ${w}`, opts: ['a', 'an'], a }
  }
  if (kind === 'plural') {
    const [w, a, bad] = pick(FLASH.plural)
    return { k: '複數', q: `${w} → ?`, opts: shuffle([a, ...bad]), a }
  }
  const [w, a, bad] = pick(FLASH.poss)
  return { k: '所有格', q: `${w} 的所有格`, opts: shuffle([a, ...bad]), a }
}
function viewFlash() {
  if (!FL || FL.over) {
    setView(
      `<div class="page narrow">
        ${header('閃電挑戰', '', '', true)}
        <div class="card flash-intro">
          <div class="flash-ic">${ICON.bolt}</div>
          <h2>60 秒，答對越多越好</h2>
          <p class="muted">be 動詞、a／an、名詞複數、所有格，混在一起快問快答。答錯不扣分，但連對會有加乘的感覺 🔥</p>
          ${S.flash.best ? `<div class="flash-best">最高紀錄 <b>${S.flash.best}</b> 題</div>` : ''}
          ${FL?.over ? flashResultHTML() : ''}
          <button class="btn primary big" data-act="go">${FL?.over ? '再玩一次' : '開始'}</button>
        </div>
      </div>`,
    )
    $('[data-act=go]').onclick = () => {
      FL = { t0: Date.now(), n: 0, combo: 0, maxCombo: 0, miss: [], q: flashQ(), over: false, lock: false }
      viewFlash()
    }
    return
  }
  setView(
    `<div class="flash">
      <header class="run-bar"><button class="icon-btn" data-act="quit" aria-label="結束">${ICON.x}</button>
        <div class="run-mid"><div class="flash-timer"><i></i></div></div><span class="flash-score">0</span></header>
      <div class="flash-stage"><div class="flash-kind"></div><div class="flash-q"></div><div class="flash-opts"></div><div class="flash-combo"></div></div>
    </div>`,
    { tabs: false },
  )
  drawFlash()
  const bar = $('.flash-timer i')
  const tick = () => {
    if (!FL || FL.over || !bar.isConnected) return
    const left = 1 - (Date.now() - FL.t0) / 60000
    bar.style.transform = `scaleX(${Math.max(0, left)})`
    bar.classList.toggle('low', left < 0.2)
    if (left <= 0) return endFlash()
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  $('.flash').addEventListener('click', (e) => {
    if (e.target.closest('[data-act=quit]')) return endFlash()
    const b = e.target.closest('.flash-opt')
    if (!b || FL.lock) return
    const ok = b.dataset.v === FL.q.a
    if (ok) {
      FL.n++
      FL.combo++
      FL.maxCombo = Math.max(FL.maxCombo, FL.combo)
      b.classList.add('ok')
      buzz(10)
      FL.lock = true
      setTimeout(() => {
        FL.lock = false
        FL.q = flashQ()
        drawFlash()
      }, 180)
    } else {
      FL.combo = 0
      FL.miss.push(FL.q)
      b.classList.add('bad')
      $$('.flash-opt').forEach((o) => o.dataset.v === FL.q.a && o.classList.add('ok'))
      buzz([10, 50, 10])
      FL.lock = true
      setTimeout(() => {
        FL.lock = false
        FL.q = flashQ()
        drawFlash()
      }, 750)
    }
    $('.flash-score').textContent = FL.n
  })
}
function drawFlash() {
  const q = FL.q
  $('.flash-kind').textContent = q.k
  $('.flash-q').textContent = q.q
  $('.flash-opts').innerHTML = q.opts.map((o) => `<button class="flash-opt" data-v="${esc(o)}">${esc(o)}</button>`).join('')
  $('.flash-combo').innerHTML = FL.combo >= 3 ? `${ICON.flame}<b>${FL.combo}</b> 連對` : ''
}
function endFlash() {
  if (!FL || FL.over) return
  FL.over = true
  const rec = FL.n > (S.flash.best || 0)
  FL.record = rec
  if (rec) S.flash.best = FL.n
  S.flash.runs = (S.flash.runs || 0) + 1
  S.sessions.push({ k: 'flash', m: 'flash', title: '閃電挑戰', s: FL.n, n: FL.n + FL.miss.length, ts: Date.now(), dur: Date.now() - FL.t0, d: S.profile.id, combo: FL.maxCombo })
  save()
  viewFlash()
  if (rec && FL.n > 0) setTimeout(celebrate, 200)
  checkBadges()
}
function flashResultHTML() {
  const miss = FL.miss.slice(-6)
  return `<div class="flash-result"><div class="fr-n"><b>${FL.n}</b> 題${FL.record ? '<span class="chip ok">新紀錄！</span>' : ''}</div><div class="muted">最多連對 ${FL.maxCombo} 題</div>
    ${miss.length ? `<div class="group-h">答錯的題目</div><div class="list">${miss.map((q) => `<div class="row static"><span class="row-t">${esc(q.q.replace('___', '＿＿'))}</span><span class="row-r ok">${esc(q.a)}</span></div>`).join('')}</div>` : ''}</div>`
}

// ───────────────────────── 紀錄 ─────────────────────────
let statsFilter = 'all'
function whyCounts(list) {
  const c = {}
  for (const a of list) if (a.w) c[a.w] = (c[a.w] || 0) + 1
  return WHY_ME.filter(([k]) => c[k]).map(([k, t]) => [t, c[k]])
}
function whyHTML(list) {
  const w = whyCounts(list)
  if (!w.length) return ''
  return `<div class="why-sum"><div class="group-h">自己說的錯因</div><div class="chips">${w.map(([t, n]) => `<span class="chip">${t} × ${n}</span>`).join('')}</div></div>`
}
function badgesHTML() {
  const have = S.badges || {}
  const n = BADGES.filter(([id]) => have[id]).length
  return `<section class="card"><div class="sec-h"><div><h2>徽章</h2><p>已經拿到 ${n}／${BADGES.length} 個。</p></div></div>
    <div class="badges">${BADGES.map(
      ([id, ic, name, desc]) => `<div class="badge-item${have[id] ? ' got' : ''}" title="${esc(desc)}"><div class="medal b-${id}"><span>${have[id] ? ic : '🔒'}</span></div><div class="badge-n">${esc(name)}</div><div class="badge-d">${esc(desc)}</div></div>`,
    ).join('')}</div></section>`
}
function viewStats() {
  const mine = statsFilter === 'mine'
  const list = attemptsOf(mine)
  const ok = list.filter((a) => a.r === 'ok').length
  const care = list.filter((a) => a.r === 'care').length
  const sure = list.filter((a) => a.r !== 'ok' && !a.c && a.x !== 'e').length
  const days = new Set(list.map((a) => dayStart(a.ts))).size
  const tc = tagCounts(list)
  const max = tc[0]?.[1] || 1
  const devices = new Set(S.attempts.map((a) => a.d))
  const sess = S.sessions.filter((s) => !mine || s.d === S.profile.id).slice(-12).reverse()
  setView(
    `<div class="page">
      ${header('學習紀錄', S.profile.name ? `${S.profile.name}・${S.profile.device || '這台裝置'}` : '紀錄存在這台裝置；可以匯出給老師或另一台裝置。')}
      ${devices.size > 1 ? `<div class="seg" role="tablist"><button role="tab" class="${!mine ? 'on' : ''}" data-f="all">全部裝置</button><button role="tab" class="${mine ? 'on' : ''}" data-f="mine">只看這台</button></div>` : ''}
      <div class="tiles">
        <div class="tile"><div class="tile-v">${list.length}</div><div class="tile-k">已作答</div></div>
        <div class="tile"><div class="tile-v">${list.length ? Math.round((ok / list.length) * 100) + '<small>%</small>' : '—'}</div><div class="tile-k">正確率</div></div>
        <div class="tile"><div class="tile-v care">${care}</div><div class="tile-k">格式粗心</div></div>
        <div class="tile"><div class="tile-v">${days}</div><div class="tile-k">練習天數</div></div>
      </div>
      ${sure ? `<div class="callout"><b>「很確定」卻答錯：${sure} 題。</b>這類題目代表「以為會、其實不會」，是最值得弄懂的地方（作答時按「有點猜」的題目不算在內）。</div>` : ''}

      <section class="card">
        <div class="sec-h"><div><h2>粗心雷達</h2><p>答錯或粗心時，錯在哪一類。點一列開始專屬特訓。</p></div></div>
        ${
          tc.length
            ? `<div class="bars">${tc
                .map(
                  ([t, n]) => `<button class="bar-row" data-drill="${t}" title="${TAGS[t] || t}：${n} 次"><span class="bar-k">${TAGS[t] || t}${FORMAT_TAGS.includes(t) ? '<em>格式</em>' : ''}</span><span class="bar-track"><i style="width:${(n / max) * 100}%"></i></span><span class="bar-v">${n}</span>${ICON.chev}</button>`,
                )
                .join('')}</div>`
            : '<p class="muted pad">還沒有錯誤紀錄。</p>'
        }
        ${whyHTML(list)}
      </section>

      ${badgesHTML()}

      <section class="card">
        <div class="sec-h"><div><h2>單元精熟度</h2><p>最後一次作答答對 ＝ 精熟。</p></div></div>
        <div class="list flat">${MOD_ORDER.map((mid) => {
          const s = moduleStats(mid)
          return `<button class="row" data-mod="${mid}"><span class="row-ic">${MODULES[mid].icon}</span><span class="row-t">${esc(MODULES[mid].title)} <small class="inl">${esc(MODULES[mid].unit)}</small><span class="mini-bar"><i style="width:${(s.mastered / s.total) * 100}%"></i></span></span><span class="row-r">${s.mastered}/${s.total}</span>${s.best ? stars(s.best) : '<span class="stars-ph"></span>'}</button>`
        }).join('')}</div>
      </section>

      ${
        sess.length
          ? `<section class="card"><div class="sec-h"><div><h2>最近練習</h2></div></div><div class="list flat">${sess
              .map((s) => `<div class="row static"><span class="row-t">${esc(s.title || s.m)}<small>${fmtTime(s.ts)}${s.d !== S.profile.id ? '・其他裝置' : ''}</small></span><span class="row-r">${s.k === 'flash' ? `${s.s} 題` : `${s.s} 分`}</span></div>`)
              .join('')}</div></section>`
          : ''
      }

      <section class="card actions-card">
        <div class="sec-h"><div><h2>紀錄留存</h2><p>老師平板和學生的裝置各自存紀錄。用「備份檔」互傳，再「匯入」就會合併。</p></div></div>
        <div class="list flat">
          <button class="row" data-x="report"><span class="row-ic">${ICON.share}</span><span class="row-t">傳學習報告給老師<small>文字版，可以貼到 LINE</small></span>${ICON.chev}</button>
          <button class="row" data-x="export"><span class="row-ic">${ICON.doc}</span><span class="row-t">匯出備份檔<small>完整紀錄（.json），可以傳到另一台裝置</small></span>${ICON.chev}</button>
          <button class="row" data-x="import"><span class="row-ic">${ICON.list}</span><span class="row-t">匯入備份檔<small>把另一台裝置的紀錄合併進來</small></span>${ICON.chev}</button>
          <button class="row danger" data-x="clear"><span class="row-t">清除這台裝置的所有紀錄</span></button>
        </div>
        <input type="file" accept=".json,application/json" class="file-in" hidden>
      </section>
    </div>`,
  )
  const v = $('.page')
  v.addEventListener('click', (e) => {
    const f = e.target.closest('[data-f]')
    if (f) {
      statsFilter = f.dataset.f
      return viewStats()
    }
    const d = e.target.closest('[data-drill]')
    if (d) return drill(d.dataset.drill)
    const m = e.target.closest('[data-mod]')
    if (m) return startModule(m.dataset.mod)
    const x = e.target.closest('[data-x]')?.dataset.x
    if (x === 'report') shareReport()
    if (x === 'export') exportData()
    if (x === 'import') $('.file-in').click()
    if (x === 'clear') confirmSheet('清除這台裝置的紀錄？', '所有作答紀錄、錯題本、進度都會刪除，而且不能復原。建議先「匯出備份檔」。', '全部清除', () => {
      const p = S.profile
      S = DEF()
      S.profile = p
      save()
      toast('已清除', '🗑️')
      viewStats()
    }, true)
  })
  $('.file-in').addEventListener('change', importData)
}
function drill(tag) {
  const last = lastByItem()
  const pool = ALL_SCORED.filter((i) => (i.tags || []).includes(tag) || S.attempts.some((a) => a.q === i.id && a.r !== 'ok' && (a.t || []).includes(tag)))
  const ids = shuffle(pool)
    .sort((a, b) => (last[a.id]?.r === 'ok') - (last[b.id]?.r === 'ok'))
    .slice(0, 10)
    .map((i) => i.id)
  startRun('drill:' + tag, `專屬特訓：${TAGS[tag] || tag}`, ids)
}

function reportText() {
  const L = S.attempts
  const ok = L.filter((a) => a.r === 'ok').length
  const care = L.filter((a) => a.r === 'care').length
  const tc = tagCounts(L).slice(0, 5)
  const exams = S.sessions.filter((s) => s.k === 'exam')
  const bestExam = exams.sort((a, b) => b.s - a.s)[0]
  const lines = [
    '【英文段考複習・學習報告】',
    `學生：${S.profile.name || '（未填）'}　裝置：${S.profile.device || '未命名'}`,
    `日期：${new Date().toLocaleDateString('zh-TW')}　連續練習：${streakDays()} 天`,
    `已作答 ${L.length} 題，正確率 ${L.length ? Math.round((ok / L.length) * 100) : 0}%，格式粗心 ${care} 次`,
    tc.length ? `最常錯：${tc.map(([t, n]) => `${TAGS[t] || t} ${n}`).join('、')}` : null,
    whyCounts(L).length ? `自己說的錯因：${whyCounts(L).map(([t, n]) => `${t} ${n}`).join('、')}` : null,
    `很確定卻答錯：${L.filter((a) => a.r !== 'ok' && !a.c && a.x !== 'e').length} 題`,
    `錯題本：${bookIds().length} 題待複習`,
    `徽章：${BADGES.filter(([id]) => S.badges?.[id]).map(([, ic, n]) => ic + n).join('、') || '還沒有'}`,
    '',
    '單元精熟（答對／題數）：',
    ...MOD_ORDER.map((mid) => {
      const s = moduleStats(mid)
      return `${s.mastered === s.total ? '✅' : s.done ? '▫️' : '⬜'} ${MODULES[mid].unit}｜${MODULES[mid].title} ${s.mastered}/${s.total}${s.best ? ' ' + '★'.repeat(s.best) : ''}`
    }),
    '',
    bestExam ? `模擬段考最高：${bestExam.s} 分（沒粗心可拿 ${bestExam.ifCare} 分），共考 ${exams.length} 次` : '模擬段考：還沒考',
    S.flash.best ? `閃電挑戰最高：${S.flash.best} 題` : null,
  ]
  return lines.filter((l) => l !== null && l !== undefined).join('\n').replace(/\n{3,}/g, '\n\n')
}
// 先預覽，再分享或複製（貼到 LINE）
function shareReport() {
  const text = reportText()
  const b = sheet(
    `<h2 class="sheet-title">學習報告</h2><p class="sheet-p">可以直接分享，或複製後貼到 LINE 傳給老師。</p>
    <textarea class="report-ta" readonly>${esc(text)}</textarea>
    <div class="sheet-actions"><button class="btn ghost" data-copy>複製</button>${navigator.share ? '<button class="btn primary" data-share>分享</button>' : ''}</div>`,
  )
  $('[data-copy]', b).onclick = async () => {
    const ta = $('.report-ta', b)
    let ok = false
    try {
      await Promise.race([navigator.clipboard.writeText(text), new Promise((_, rej) => setTimeout(rej, 1500))])
      ok = true
    } catch {
      ta.select()
      try {
        ok = document.execCommand('copy')
      } catch {}
    }
    toast(ok ? '已複製，可以貼到 LINE' : '請長按文字框，選「全選」再複製', ok ? '📋' : '✋')
  }
  $('[data-share]', b)?.addEventListener('click', async () => {
    try {
      await navigator.share({ title: '英文段考複習・學習報告', text })
      closeSheet()
    } catch {}
  })
}
async function exportData() {
  const data = { app: 'g7-english-review', v: 1, at: Date.now(), profile: S.profile, attempts: S.attempts, sessions: S.sessions, flash: S.flash }
  const d = new Date()
  const name = `英文複習紀錄-${S.profile.name || '學生'}-${S.profile.device || '裝置'}-${d.getMonth() + 1}${String(d.getDate()).padStart(2, '0')}.json`
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
  const file = new File([blob], name, { type: 'application/json' })
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: '英文複習紀錄' })
      return
    }
  } catch (e) {
    if (e.name === 'AbortError') return
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.append(a)
  a.click()
  setTimeout(() => (URL.revokeObjectURL(a.href), a.remove()), 1000)
  toast('備份檔已下載', '💾')
}
async function importData(e) {
  const f = e.target.files?.[0]
  e.target.value = ''
  if (!f) return
  try {
    const d = JSON.parse(await f.text())
    if (d.app !== 'g7-english-review' || !Array.isArray(d.attempts)) throw new Error('format')
    const key = (a) => `${a.ts}|${a.q}|${a.d}`
    const have = new Set(S.attempts.map(key))
    const add = d.attempts.filter((a) => a && a.q && a.ts && !have.has(key(a)))
    S.attempts.push(...add)
    S.attempts.sort((a, b) => a.ts - b.ts)
    const sk = (s) => `${s.ts}|${s.k}|${s.d}`
    const hs = new Set(S.sessions.map(sk))
    const addS = (d.sessions || []).filter((s) => s && s.ts && !hs.has(sk(s)))
    S.sessions.push(...addS)
    S.sessions.sort((a, b) => a.ts - b.ts)
    if ((d.flash?.best || 0) > (S.flash.best || 0)) S.flash.best = d.flash.best
    if (!S.profile.name && d.profile?.name) S.profile.name = d.profile.name
    save()
    checkBadges(true)
    toast(`已合併：新增 ${add.length} 筆作答、${addS.length} 次練習`, '✅')
    viewStats()
  } catch {
    toast('這個檔案不是本 App 的備份檔', '⚠️')
  }
}

// ───────────────────────── 設定 ─────────────────────────
function viewSettings() {
  const p = S.profile
  const dev = ['老師平板', '學生']
  setView(
    `<div class="page narrow">
      ${header('設定', '')}
      <div class="group"><div class="group-h">學生</div><div class="list form">
        <label class="row field"><span class="row-t">名字</span><input id="f-name" value="${esc(p.name)}" placeholder="例如：Amy" maxlength="20" autocomplete="off"></label>
        <div class="row field"><span class="row-t">這台裝置是</span><div class="seg small" data-seg="device">${dev.map((d) => `<button class="${p.device === d ? 'on' : ''}" data-v="${d}">${d}</button>`).join('')}</div></div>
        <label class="row field"><span class="row-t">段考日期</span><input id="f-exam" type="date" value="${esc(p.exam)}"></label>
      </div><p class="group-f">裝置名稱會寫在學習報告和備份檔上，老師合併紀錄時分得出是誰的。</p></div>

      <div class="group"><div class="group-h">練習</div><div class="list form">
        <div class="row field"><span class="row-t">每日目標</span><div class="seg small" data-seg="goal">${[20, 30, 50].map((g) => `<button class="${+p.goal === g ? 'on' : ''}" data-v="${g}">${g} 題</button>`).join('')}</div></div>
        <div class="row field"><span class="row-t">語音速度</span><div class="seg small" data-seg="rate"><button class="${p.rate === 'slow' ? 'on' : ''}" data-v="slow">慢</button><button class="${p.rate !== 'slow' ? 'on' : ''}" data-v="normal">標準</button></div></div>
        <button class="row" data-x="voice"><span class="row-ic">${ICON.speaker}</span><span class="row-t">試聽語音</span>${ICON.chev}</button>
      </div><p class="group-f">聽力用裝置內建的英文語音。iPad 可以到「設定 → 輔助使用 → 朗讀內容 → 聲音」下載更自然的英文語音（例如 Samantha 加強版）。</p></div>

      <div class="group"><div class="group-h">上課</div><div class="list form">
        <div class="row field"><span class="row-t">先說答案，再看選項<small>選擇題的選項先遮住，學生先口頭回答</small></span><div class="seg small" data-seg="oral"><button class="${p.oral === 'on' ? 'on' : ''}" data-v="on">開</button><button class="${p.oral !== 'on' ? 'on' : ''}" data-v="off">關</button></div></div>
        <div class="row field"><span class="row-t">字體大小</span><div class="seg small" data-seg="size"><button class="${p.size !== 'lg' ? 'on' : ''}" data-v="std">標準</button><button class="${p.size === 'lg' ? 'on' : ''}" data-v="lg">大</button></div></div>
      </div><p class="group-f">「先說答案」：自己想出答案再對照，比直接看選項記得更牢（生成效應）。學生回家自己練時可以關掉。<br>有實體鍵盤時：按 1～4 選選項，Enter 檢查／下一題。</p></div>

      <div class="group"><div class="group-h">App</div><div class="list">
        <button class="row" data-x="update"><span class="row-t">檢查更新</span><span class="row-r">${VERSION}</span>${ICON.chev}</button>
        <button class="row" data-x="install"><span class="row-t">加到主畫面（像 App 一樣打開）</span>${ICON.chev}</button>
      </div></div>
      <p class="foot">題目、文章、聽力稿都是依翰林版七上 Starter～Review 1 的字彙與句型自編，不含課本原文。<br>紀錄只存在這台裝置的瀏覽器裡；清除瀏覽器資料會一起刪除，記得定期匯出備份。</p>
    </div>`,
  )
  const v = $('.page')
  $('#f-name').addEventListener('input', (e) => {
    S.profile.name = e.target.value.trim()
    save()
  })
  $('#f-exam').addEventListener('change', (e) => {
    S.profile.exam = e.target.value
    save()
  })
  v.addEventListener('click', (e) => {
    const b = e.target.closest('[data-seg] button')
    if (b) {
      const k = b.parentElement.dataset.seg
      S.profile[k] = k === 'goal' ? +b.dataset.v : b.dataset.v
      save()
      if (k === 'size') applySize()
      $$('button', b.parentElement).forEach((x) => x.classList.toggle('on', x === b))
      return
    }
    const x = e.target.closest('[data-x]')?.dataset.x
    if (x === 'voice') Voice.speak([['W', 'Hi, I am Jamie. Nice to meet you.'], ['M', 'Nice to meet you, too.']])
    if (x === 'update') checkUpdate()
    if (x === 'install')
      sheet(`<h2 class="sheet-title">加到主畫面</h2><ol class="plan"><li>用 <b>Safari</b> 打開這個網址。</li><li>點上方或下方的「分享」按鈕 ${ICON.share}。</li><li>選「加入主畫面」，再按「新增」。</li></ol><p class="sheet-p">之後從主畫面打開，就像一般 App 一樣全螢幕，沒有網路也能練習（聽力需要裝置語音）。Android 的 Chrome：右上角選單 →「加到主畫面」。</p>`)
  })
}
async function checkUpdate() {
  toast('檢查中…', '⏳')
  let latest = ''
  try {
    const text = await (await fetch('app.js?ts=' + Date.now(), { cache: 'no-store' })).text()
    latest = (text.match(/const VERSION = '([^']+)'/) || [])[1] || ''
  } catch {}
  if (latest && latest === VERSION) return toast(`已經是最新版：${VERSION}`, '✅')
  try {
    for (const r of (await navigator.serviceWorker?.getRegistrations?.()) || []) await r.unregister()
    for (const k of (await caches?.keys?.()) || []) await caches.delete(k)
  } catch {}
  toast('更新中，馬上重新整理', '⬇️')
  setTimeout(() => location.reload(), 600)
}

// ───────────────────────── 路由與外框 ─────────────────────────
const TABS = [
  ['#/', '複習', ICON.home],
  ['#/book', '錯題本', ICON.book],
  ['#/stats', '紀錄', ICON.chart],
  ['#/settings', '設定', ICON.gear],
]
function setView(html, { tabs = true } = {}) {
  closeSheet()
  const root = $('#app')
  root.innerHTML = `<main id="view" class="${tabs ? 'with-tabs' : 'immersive'}">${html}</main>${
    tabs
      ? `<nav class="tabbar" aria-label="主選單">${TABS.map(([h, label, ic]) => {
          const on = (location.hash || '#/') === h || (h === '#/' && !location.hash)
          const badge = h === '#/book' ? bookIds().length : 0
          return `<a href="${h}" class="${on ? 'on' : ''}" ${on ? 'aria-current="page"' : ''}>${ic}<span>${label}</span>${badge ? `<b class="badge">${badge > 99 ? '99+' : badge}</b>` : ''}</a>`
        }).join('')}</nav>`
      : ''
  }`
  $('[data-back]', root)?.addEventListener('click', () => (history.length > 1 ? history.back() : go('#/')))
}
function go(h) {
  if (location.hash === h) route()
  else location.hash = h
}
function route() {
  Voice.stop()
  const h = location.hash || '#/'
  const [, a, b] = h.split('/')
  if (a !== 'exam' && EXAM && !EXAM.graded) clearInterval(EXAM.timer)
  if (a === 'run' && b) return viewRun(decodeURIComponent(b))
  if (a === 'book') return viewBook()
  if (a === 'exam') return viewExam()
  if (a === 'flash') return viewFlash()
  if (a === 'stats') return viewStats()
  if (a === 'settings') return viewSettings()
  if (a === 'notes') return viewAllNotes()
  if (a === 'print' && b) return viewPrint(decodeURIComponent(b))
  viewHome()
}
window.addEventListener('hashchange', () => {
  route()
  window.scrollTo(0, 0)
})
function applySize() {
  document.documentElement.classList.toggle('size-lg', S.profile.size === 'lg')
}
// 實體鍵盤：1～4／A～D 選選項，Enter 檢查／下一題
document.addEventListener('keydown', (e) => {
  if (!RUN || !$('.run') || $('.sheet-wrap') || e.metaKey || e.ctrlKey || e.altKey) return
  if (e.target.closest?.('input, textarea')) return
  const k = e.key.toLowerCase()
  let idx = '1234'.indexOf(k)
  if (idx < 0) idx = 'abcd'.indexOf(k)
  if (k.length === 1 && idx >= 0) {
    if ($('.run .opts-wrap.covered')) return
    const opts = $$('.run .opts .opt')
    if (opts[idx] && !opts[idx].disabled) {
      opts[idx].click()
      e.preventDefault()
    }
  } else if (e.key === 'Enter' && (!e.target.closest?.('button, a, [role=button]') || e.target.closest('.why-me'))) {
    const b = $('[data-act=check]')
    if (b && !b.disabled) {
      b.click()
      e.preventDefault()
    }
  }
})
document.addEventListener('click', (e) => {
  const s = e.target.closest('[data-say]')
  if (s) {
    e.preventDefault()
    s.classList.add('speaking')
    Voice.speak(s.dataset.say).then(() => s.classList.remove('speaking'))
  }
})
applySize()
checkBadges(true)
route()

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker
    .register('sw.js', { updateViaCache: 'none' })
    .then((reg) => {
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && reg.update().catch(() => {}))
    })
    .catch(() => {})
}

// 給測試用
window.__app = { S, ITEM, MODULES, checkText, formatIssues, diagnose, VERSION }
