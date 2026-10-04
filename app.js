// 國一英文段考複習 App（翰林版七上 Starter～Review 1）
// 純前端：紀錄存在這台裝置（localStorage），可以匯出／匯入合併。
import { TAGS, TAG_HINTS, CHECKLIST, LESSONS, PASSAGES, MODULES, FLASH, SPEAK, EXPLAIN } from './content.js'
import { figure, placeScene, REL_LABEL } from './art.js'

const VERSION = '2.6.1（10/4）'
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
// 學生模式：老師的裝置暫時借給某個學生用（紀錄存在另一份，同步到那個學生）；同步設定（S.sync、S.syncQ）存在共用的 SYNC_KEY
const ACTIVE = (() => {
  try {
    return localStorage.getItem('g7review:active') || ''
  } catch {
    return ''
  }
})()
const STORE = ACTIVE ? `${KEY}@${ACTIVE}` : KEY
const SYNC_KEY = 'g7review:sync'
let S = load()
function load() {
  let s = DEF()
  let main = {}
  try {
    main = JSON.parse(localStorage.getItem(KEY) || '{}') || {}
    const d = ACTIVE ? JSON.parse(localStorage.getItem(STORE) || '{}') || {} : main
    s = { ...s, ...d, profile: { ...s.profile, ...(d.profile || {}) }, flash: { ...s.flash, ...(d.flash || {}) } }
  } catch {}
  try {
    const sy = JSON.parse(localStorage.getItem(SYNC_KEY) || 'null')
    s.sync = sy ? sy.sync : main.sync // 2.1 以前：同步設定存在主紀錄裡
    s.syncQ = sy ? sy.syncQ || [] : main.syncQ || []
  } catch {}
  if (!s.sync) delete s.sync
  return s
}
let saveWarned = false
function save() {
  try {
    const { sync, syncQ, ...rest } = S
    localStorage.setItem(STORE, JSON.stringify(rest))
    localStorage.setItem(SYNC_KEY, JSON.stringify({ sync: sync || null, syncQ: syncQ || [] }))
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
// 補上考點與錯誤選項解析（題目本身有寫的優先）
for (const [id, e] of Object.entries(EXPLAIN)) {
  const it = ITEM[id]
  if (!it) continue
  it.kp ||= e.kp
  if (e.why) it.why = { ...e.why, ...(it.why || {}) }
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
function bookState(attempts = S.attempts) {
  const by = {}
  for (const a of [...attempts].sort((x, y) => x.ts - y.ts)) (by[a.q] ||= []).push(a)
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
    const oks = after.filter((a) => a.r === 'ok' && a.x !== 'r') // 看完解析馬上再試一次答對的，不算畢業
    const graduated = oks.length >= 3 || (oks.length >= 2 && oks[oks.length - 1].ts - oks[0].ts >= 8 * 3600000)
    out[q] = { wrong, inBook: !graduated, oks: oks.length, last: list[list.length - 1] }
  }
  return out
}
function bookIds(attempts = S.attempts) {
  const b = bookState(attempts)
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
function streakDays(list = S.attempts) {
  const days = new Set(list.map((a) => dayStart(a.ts)))
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
  Sync.queue('a', a)
  return a
}
// 錯因自評（後設認知：自己說出錯在哪，下次比較不會再錯）
const WHY_ME = [
  ['read', '看錯題目'],
  ['rule', '規則不熟'],
  ['word', '單字不熟'],
  ['rush', '太急了'],
]
function maxStreakDays(list = S.attempts) {
  const days = [...new Set(list.map((a) => dayStart(a.ts)))].sort((a, b) => a - b)
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
  ['careful', '🎯', '零粗心', '一個單元 10 題以上、答對八成，而且沒有格式粗心'],
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
    careful: modSess.some((s) => s.n >= 10 && !s.care && s.ok >= s.n * 0.8),
    days: maxStreakDays() >= 3,
    grad: grads >= 10,
    flash: (S.flash.best || 0) >= 20,
    lesson1: LESSONS[0].modules.every((m) => best(m) === 3),
    lesson2: LESSONS[1].modules.every((m) => best(m) === 3),
    exam: S.sessions.some((s) => s.k === 'exam' && s.s >= 90),
  }
}
function checkBadges(silent = false) {
  checkRecords(silent)
  S.badges ||= {}
  const e = badgeEarned()
  // 1.6 以前「零粗心」條件太寬（全錯也會拿到）：不符合新條件就收回
  if (S.badges.careful && !e.careful) {
    delete S.badges.careful
    save()
  }
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
      toast('這個瀏覽器不支援語音，請用 Safari 或 Chrome 開啟', '🔇')
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
  mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21M8.5 21h7" /></svg>',
  eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></svg>',
  share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4" /><path d="M6 11v8.5h12V11" /></svg>',
  people: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8.5" r="3.3" /><path d="M3 19.5c.6-3.4 3-5.3 6-5.3s5.4 1.9 6 5.3" /><path d="M15.5 5.6a3.1 3.1 0 010 5.8M17.6 14.6c1.8.7 3 2.4 3.4 4.9" /></svg>',
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
// 文章／圖表的內容：一般文章、表格卡片（card）、公告（notice）、訊息（chat）
function passageBody(p, print = false) {
  if (p.kind === 'card') return `<table class="pv-card">${p.rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>`
  if (p.kind === 'notice')
    return `<div class="pv-notice">${esc(p.text)
      .split('\n')
      .map((l) => `<p>${l}</p>`)
      .join('')}</div>`
  if (p.kind === 'chat') return `<div class="pv-chat">${p.msgs.map(([who, t]) => `<div class="pv-msg${who === p.me ? ' me' : ''}"><span class="pv-who">${esc(who)}</span><span class="pv-bubble">${esc(t)}</span></div>`).join('')}</div>`
  return `<p class="en">${esc(p.text).replace(/__\((\d)\)__/g, print ? '<u>　($1)　</u>' : '<span class="cloze">($1)</span>')}</p>`
}
function passageHTML(pid, mode) {
  const p = PASSAGES[pid]
  if (!p) return ''
  return `<details class="passage${p.kind ? ' pv' : ''}" ${mode === 'exam' ? '' : 'open'}><summary>${ICON.doc}<span>${esc(p.title)}</span></summary>${passageBody(p)}<p class="zh" hidden>${esc(p.zh)}</p></details>`
}
// 段考／會考題型（題目上的標籤、模擬段考分大題用）
function secOf(it) {
  if (it.sec) return it.sec
  if (it.audio) {
    if (/回應/.test(it.q)) return '基本問答'
    if (/意思一樣/.test(it.q)) return '辨識句意'
    return Array.isArray(it.audio) ? '言談理解' : '字音辨識'
  }
  if (it.passage) return PASSAGES[it.passage]?.kind ? '圖表題組' : it.passage === 'nina' ? '克漏字' : '閱讀題組'
  return { fill: '字彙', write: '句型改寫', order: '重組', spot: '挑錯', mcq: '單題' }[it.t] || ''
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
  // 標段考／會考題型（聽力、閱讀用藍色），讓學生熟悉考卷長相
  const sec = it.t === 'learn' ? '' : secOf(it)
  const chip = sec ? `<span class="chip${it.audio || it.passage ? ' blue' : ''}">${sec}</span>` : `<span class="chip">${TYPE_LABEL[it.t]}</span>`
  return `<div class="q-meta">${chip}${lv}<span class="q-unit">${esc(m.unit)} · ${esc(m.title)}</span></div>`
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

// 考點＋選項解析（答題回饋、題目回顧、課堂檢視共用）
function explainParts(it, given) {
  // 考點：有寫 kp 用 kp，沒有就用標籤（聽力、閱讀這種大類不算考點）
  const kp = it.kp || uniq((it.tags || []).filter((t) => t !== 'listen' && t !== 'read').map((t) => TAGS[t])).join('、')
  const kpH = kp ? `<div class="fb-kp"><span class="kp-k">考點</span><span>${esc(kp)}</span></div>` : ''
  // 選項解析：每個選項為什麼對、為什麼錯（有寫 why 的選擇題）
  const whyOn = !!(it.t === 'mcq' && it.why && Object.keys(it.why).length)
  const why = whyOn
    ? `<div class="fb-why"><div class="fb-k">選項解析</div><ul>${it.opts
        .map((o, i) => {
          const mine = given === o && i !== it.a
          const r = i === it.a ? '正確答案' : it.why[i]
          return r ? `<li class="${i === it.a ? 'ok' : mine ? 'mine' : ''}"><b>${esc(o)}</b>${mine ? '<em>選了這個</em>' : ''}<span>${esc(r)}</span></li>` : ''
        })
        .join('')}</ul></div>`
    : ''
  return { kpH, why, whyOn }
}
function feedbackHTML(it, res, ctx = {}) {
  const head =
    res.r === 'ok'
      ? ['ok', ctx.guess ? '猜對了！' : pick(['答對了！', '完全正確！', '漂亮！', '沒錯！']), ctx.guess ? '看一下解析，下次就不用猜了。' : ctx.streak >= 3 ? `連對 ${ctx.streak} 題 🔥` : '']
      : res.r === 'care'
        ? ['care', '內容對了，但格式粗心', '段考會被扣分！養成「寫完檢查」的習慣。']
        : ['bad', '再想想', ctx.exam ? '' : ctx.guess ? '這題本來就沒把握，看完解析就學會了。' : '很確定卻答錯？這種題目最值得弄懂。已放進錯題本。']
  const { kpH, why, whyOn } = explainParts(it, res.given)
  const msgs = whyOn ? '' : (res.msgs || []).map((m) => `<li>${esc(m)}</li>`).join('')
  const right = res.r !== 'ok' && res.right ? `<div class="fb-ans"><div class="fb-k">正確答案</div><div class="fb-v">${res.right}</div></div>` : ''
  const yours = res.r !== 'ok' && res.yours ? `<div class="fb-ans you"><div class="fb-k">你的答案</div><div class="fb-v">${res.yours}</div></div>` : ''
  const ex = (it.ex ? `<div class="fb-ex">${ICON.bulb}<div>${rich(it.ex)}</div></div>` : '') + why
  const follow = it.follow ? `<details class="follow"><summary>延伸想一想：${esc(it.follow[0])}</summary><p>${esc(it.follow[1])}</p></details>` : ''
  const tr = it.passage && PASSAGES[it.passage] ? `<button type="button" class="link" data-zh>看文章中文翻譯</button>` : ''
  return `<div class="fb ${head[0]}"><div class="fb-head"><span class="fb-icon">${res.r === 'ok' ? ICON.check : res.r === 'care' ? '!' : ICON.x}</span><div><div class="fb-title">${head[1]}</div>${head[2] ? `<div class="fb-sub">${head[2]}</div>` : ''}</div></div>
    ${kpH}${msgs ? `<ul class="fb-msgs">${msgs}</ul>` : ''}${yours}${right}${ex}${follow}${tr}</div>`
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
let RUN = null // { key, at, C, hints, guess, checked, streak, reviewing }
// 回上一題用：作答完的畫面（SNAPS）、還沒作答就離開時寫到一半的答案（DRAFTS）
const SNAPS = {}
const DRAFTS = {}
function startModule(mid) {
  const key = 'm:' + mid
  const ids = MODULES[mid].items.map((i) => i.id)
  const pr = S.progress[key]
  if (!pr || pr.done || pr.ids.join() !== ids.join()) {
    S.progress[key] = { ids, i: 0, res: {}, t0: Date.now(), title: MODULES[mid].title, mid }
    delete SNAPS[key]
    delete DRAFTS[key]
  }
  save()
  go('#/run/' + encodeURIComponent(key))
}
function startRun(key, title, ids) {
  if (!ids.length) return toast('沒有題目可以練習', '👍')
  S.progress[key] = { ids, i: 0, res: {}, t0: Date.now(), title }
  delete SNAPS[key]
  delete DRAFTS[key]
  save()
  go('#/run/' + encodeURIComponent(key))
}

function runShell(pr, it, at, reviewing) {
  const scored = pr.ids.filter((id) => ITEM[id]?.t !== 'learn')
  const nBefore = pr.ids.slice(0, at).filter((id) => ITEM[id]?.t !== 'learn').length
  const tools = !reviewing && it.t !== 'learn'
  const mainLabel = reviewing ? (at + 1 >= pr.ids.length && pr.i >= pr.ids.length ? '看結果' : '下一題') : it.t === 'learn' ? '我懂了' : '檢查'
  setView(
    `<div class="run${reviewing ? ' reviewing' : ''}">
      <header class="run-bar">
        <button class="icon-btn" data-act="close" aria-label="離開（進度會保留）">${ICON.x}</button>
        <div class="run-mid"><div class="run-title">${esc(pr.title)}</div><div class="run-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${pr.ids.length}" aria-valuenow="${at}"><i style="width:${(at / pr.ids.length) * 100}%"></i></div></div>
        <button class="icon-btn" data-act="notes" aria-label="重點">${ICON.notes}</button>
      </header>
      <div class="run-stage"><div class="run-count">${reviewing ? '<span class="rev-tag">回顧</span>' : ''}${it.t === 'learn' ? '觀念' : `第 ${nBefore + 1}／${scored.length} 題`}</div><div class="run-card"></div><div class="hint-box" hidden></div></div>
      <footer class="run-actions">
        <div class="ra-left">
          ${at > 0 ? `<button class="pill back" data-act="back" aria-label="上一題">${ICON.back}<span>上一題</span></button>` : ''}
          ${tools ? `<button class="pill" data-act="hint">${ICON.bulb}<span>提示</span></button><button class="pill toggle" data-act="guess" aria-pressed="false">🤔<span>有點猜</span></button>` : ''}
        </div>
        <button class="btn primary big" data-act="check" ${reviewing ? '' : 'disabled'}>${mainLabel}</button>
      </footer>
    </div>`,
    { tabs: false },
  )
  Sync.presence({ view: 'run', title: pr.title, n: Math.min(nBefore + 1, scored.length), of: scored.length, q: it.id })
}

function viewRun(key, at) {
  const pr = S.progress[key]
  if (!pr) return go('#/')
  if (at == null || at > pr.i) at = pr.i
  if (at < 0) at = 0
  if (at >= pr.ids.length) return viewSummary(key)
  const it = ITEM[pr.ids[at]]
  if (!it) {
    if (at === pr.i) {
      pr.i++
      save()
    }
    return viewRun(key, at + 1)
  }
  const streak = RUN?.key === key ? RUN.streak : 0
  if (at < pr.i) return viewRunReview(key, at, it, streak)
  runShell(pr, it, at, false)
  const C = makeItem(it, 'practice')
  $('.run-card').append(C.el)
  RUN = { key, at, C, it, hints: 0, guess: false, checked: false, streak }
  const btn = $('[data-act=check]')
  C.onAnswer = () => (btn.disabled = !C.answered())
  C.onEnter = () => C.answered() && btn.click()
  restoreDraft(key, it, C)
  if (C.focus && matchMedia('(pointer: fine)').matches) setTimeout(() => C.focus(), 60)
  $('.run').addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')
    if (!a) return
    const act = a.dataset.act
    if (act === 'close') return leaveRun()
    if (act === 'notes') return showNotes(pr.mid || it.mid)
    if (act === 'back') return goBack()
    if (act === 'retry') return retryItem()
    if (act === 'hint') return showHint()
    if (act === 'guess') {
      RUN.guess = !RUN.guess
      a.setAttribute('aria-pressed', RUN.guess)
      return
    }
    if (act === 'check') return RUN.checked || it.t === 'learn' ? nextItem() : checkItem()
  })
}

// 回顧已經作答過的題目：顯示當時的畫面（答案、對錯、解析），不能重答、不會再記一次
function viewRunReview(key, at, it, streak) {
  const pr = S.progress[key]
  runShell(pr, it, at, true)
  const html = SNAPS[key]?.[it.id]
  let el
  if (html) {
    const t = document.createElement('template')
    t.innerHTML = html
    el = t.content.firstElementChild
    el.classList.add('snap')
    const pb = $('[data-play]:not(.slow)', el)
    if (pb) pb.innerHTML = `${ICON.play}<span>播放</span>`
    el.addEventListener('click', (e) => {
      const w = e.target.closest('[data-w]')
      if (w) {
        const att = [...S.attempts].reverse().find((a) => a.q === it.id && a.ts >= (pr.t0 || 0))
        if (att) {
          att.w = w.dataset.w
          save()
          Sync.queue('a', att)
          $$('.why-me .pick', el).forEach((x) => x.classList.toggle('on', x === w))
          buzz(6)
        }
        return
      }
      const p = e.target.closest('[data-play]')
      if (p && it.audio) Voice.speak(it.audio, p.dataset.play === 'slow')
      if (e.target.closest('[data-zh]')) {
        const z = $('.passage .zh', el)
        if (z) {
          z.hidden = !z.hidden
          z.closest('details')?.setAttribute('open', '')
        }
      }
    })
  } else {
    // 重新整理過就沒有畫面紀錄：改用這次練習的作答紀錄顯示
    const last = [...S.attempts].reverse().find((a) => a.q === it.id && a.ts >= (pr.t0 || 0))
    el = reviewCard(it, last, '你的答案')
  }
  $('.run-card').append(el)
  RUN = { key, at, it, reviewing: true, streak }
  // 回顧到答錯的題目：可以馬上再試一次（在視窗裡作答，不改這次的分數）
  const mine = [...S.attempts].reverse().find((a) => a.q === it.id && a.ts >= (pr.t0 || 0))
  if (mine && mine.r !== 'ok') $('.ra-left').insertAdjacentHTML('beforeend', `<button class="pill" data-act="retry">↻<span>再試一次</span></button>`)
  $('.run').addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act
    if (a === 'close') return leaveRun()
    if (a === 'notes') return showNotes(pr.mid || it.mid)
    if (a === 'back') return goBack()
    if (a === 'retry') return reviewSheet(it.id, { quick: true })
    if (a === 'check') {
      Voice.stop()
      viewRun(key, at + 1)
      window.scrollTo(0, 0)
    }
  })
}

// 作答完的題目存一份畫面（輸入框的值也要寫進 HTML）
function snapCurrent() {
  if (!RUN || RUN.reviewing || !RUN.C?.el) return false
  const { C, it, key } = RUN
  const done = RUN.checked || (it.t === 'learn' && C.answered())
  if (!done) return false
  $$('input', C.el).forEach((i) => i.setAttribute('value', i.value))
  $$('textarea', C.el).forEach((t) => (t.textContent = t.value))
  ;(SNAPS[key] ||= {})[it.id] = C.el.outerHTML
  return true
}
// 還沒作答就往回：把寫到一半的答案先留著
function saveDraft() {
  if (!RUN || RUN.reviewing || RUN.checked || !RUN.C?.el) return
  const el = RUN.C.el
  const vals = $$('input.blank, textarea.write-in', el).map((i) => i.value)
  const sel = $$('.opts .opt.sel', el).map((o) => o.dataset.i)
  if (vals.some(Boolean) || sel.length) DRAFTS[RUN.key] = { id: RUN.it.id, vals, sel, guess: RUN.guess }
}
function restoreDraft(key, it, C) {
  const d = DRAFTS[key]
  if (!d || d.id !== it.id) return
  delete DRAFTS[key]
  $('.cover-btn', C.el)?.click()
  $$('input.blank, textarea.write-in', C.el).forEach((inp, i) => {
    if (d.vals[i] == null) return
    inp.value = d.vals[i]
    inp.dispatchEvent(new Event('input', { bubbles: true }))
  })
  for (const i of d.sel) $(`.opts .opt[data-i="${i}"]`, C.el)?.click()
  if (d.guess) $('[data-act=guess]')?.click()
}
function goBack() {
  const { key, at } = RUN
  if (at <= 0) return
  const pr = S.progress[key]
  if (!RUN.reviewing) {
    // 這一題已經作答完：算完成，看完前面再往前就接著下一題
    if (snapCurrent()) {
      pr.i = Math.max(pr.i, at + 1)
      save()
    } else saveDraft()
  }
  Voice.stop()
  viewRun(key, at - 1)
  window.scrollTo(0, 0)
}
function leaveRun() {
  if (snapCurrent()) {
    const pr = S.progress[RUN.key]
    pr.i = Math.max(pr.i, RUN.at + 1)
    save()
  } else saveDraft()
  go('#/')
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
  // 再試一次：分數照第一次算，紀錄標成 x:'r'（剛看過解析，答對不算錯題本畢業）
  if (!RUN.retry) {
    pr.res[it.id] = res.r
    RUN.streak = res.r === 'ok' ? RUN.streak + 1 : 0
  }
  const att = record(it, res, { h: RUN.hints, c: RUN.guess, ...(RUN.retry ? { x: 'r' } : {}) })
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
      Sync.queue('a', att)
      $$('.why-me .pick', fb).forEach((x) => x.classList.toggle('on', x === b))
      buzz(6)
    })
  }
  fb.hidden = false
  revealExtras(C)
  checkBadges()
  C.el.classList.add('done', 'r-' + res.r)
  $$('.ra-left [data-act=hint], .ra-left [data-act=guess]').forEach((b) => b.remove())
  if (res.r !== 'ok') $('.ra-left').insertAdjacentHTML('beforeend', `<button class="pill" data-act="retry">↻<span>再試一次</span></button>`)
  const btn = $('[data-act=check]')
  btn.textContent = pr.i + 1 >= pr.ids.length ? '看結果' : '繼續'
  btn.disabled = false
  btn.focus({ preventScroll: true })
  if (res.r === 'ok') buzz(15)
  else buzz([10, 60, 10])
  requestAnimationFrame(() => fb.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'nearest' }))
}
// 答錯後馬上再試一次：同一題重新作答（老師的課堂檢視也會跟著換回「正在作答」）
function retryItem() {
  const { key, it } = RUN
  const pr = S.progress[key]
  const C = makeItem(it, 'practice')
  $('.run-card').replaceChildren(C.el)
  const box = $('.hint-box')
  box.hidden = true
  box.innerHTML = ''
  Object.assign(RUN, { C, hints: 0, guess: false, checked: false, retry: true })
  $('.ra-left [data-act=retry]')?.remove()
  $('.ra-left').insertAdjacentHTML('beforeend', `<button class="pill" data-act="hint">${ICON.bulb}<span>提示</span></button><button class="pill toggle" data-act="guess" aria-pressed="false">🤔<span>有點猜</span></button>`)
  const btn = $('[data-act=check]')
  btn.textContent = '檢查'
  btn.disabled = true
  C.onAnswer = () => (btn.disabled = !C.answered())
  C.onEnter = () => C.answered() && btn.click()
  const scored = pr.ids.filter((id) => ITEM[id]?.t !== 'learn')
  const n = pr.ids.slice(0, RUN.at).filter((id) => ITEM[id]?.t !== 'learn').length + 1
  Sync.presence({ view: 'run', title: pr.title, n: Math.min(n, scored.length), of: scored.length, q: it.id })
  if (C.focus && matchMedia('(pointer: fine)').matches) setTimeout(() => C.focus(), 60)
  window.scrollTo(0, 0)
}
function nextItem() {
  const pr = S.progress[RUN.key]
  snapCurrent()
  pr.i = Math.max(pr.i, RUN.at + 1)
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
    addSession({ k: key, m: pr.mid || key, title: pr.title, s: Math.round(pct * 100), n: total, ok, care, bad, stars: st, ts: Date.now(), dur: pr.t1 - pr.t0, d: S.profile.id })
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
    if (r)
      return reviewSheet(r.dataset.review, {
        onDone: (res) => {
          const tag = $('.row-r', r)
          if (!tag) return
          tag.className = `row-r ${res}`
          tag.textContent = res === 'ok' ? '重練對了 ✓' : res === 'care' ? '重練・粗心' : '重練・還要加油'
        },
      })
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
// 結果頁、錯題本點一題：先看上次的答案與解析，可以直接「再練一次」（會記錄、會影響錯題本）
// quick：檢討時「再試一次」（直接作答；剛看過解析，答對不算錯題本畢業）
function reviewSheet(id, { onDone, quick = false } = {}) {
  const it = ITEM[id]
  let retried = null
  const body = sheet(`<h2 class="sheet-title">${quick ? '再試一次' : '題目回顧'}</h2><div class="review-slot"></div><div class="hint-box review-hints" hidden></div><div class="sheet-actions review-acts"></div>`, {
    wide: true,
    onClose: () => retried && onDone?.(retried),
  })
  const slot = $('.review-slot', body)
  const acts = $('.review-acts', body)
  const hintBox = $('.review-hints', body)
  const showReview = () => {
    const last = [...S.attempts].reverse().find((a) => a.q === id)
    slot.replaceChildren(reviewCard(it, last, '上次的答案'))
    acts.innerHTML = `<button class="btn ghost" data-close>關閉</button><button class="btn primary" data-retry>再練一次</button>`
  }
  const practice = () => {
    const C = makeItem(it, 'practice')
    slot.replaceChildren(C.el)
    Sync.presence({ view: 'run', title: '再試一次', n: 1, of: 1, q: it.id })
    hintBox.hidden = true
    hintBox.innerHTML = ''
    let hints = 0
    acts.innerHTML = `<button class="btn ghost" data-hint>${ICON.bulb}<span>提示</span></button><button class="btn primary" data-check disabled>檢查</button>`
    const btn = $('[data-check]', acts)
    C.onAnswer = () => (btn.disabled = !C.answered())
    C.onEnter = () => C.answered() && btn.click()
    $('[data-hint]', acts).onclick = () => {
      const hs = hintsFor(it)
      if (hints >= hs.length) return toast('提示已經全部打開了', '💡')
      hints++
      hintBox.hidden = false
      hintBox.innerHTML = hs.slice(0, hints).map((h, i) => `<div class="hint"><span>提示 ${i + 1}</span>${esc(h)}</div>`).join('')
    }
    btn.onclick = () => {
      if (!C.answered()) return
      const res = C.grade()
      record(it, res, { h: hints, ...(quick ? { x: 'r' } : {}) })
      save()
      retried = res.r
      C.reveal(res)
      const fb = $('.q-feedback', C.el)
      fb.innerHTML = feedbackHTML(it, res, { streak: 0 })
      fb.hidden = false
      revealExtras(C)
      C.el.classList.add('done', 'r-' + res.r)
      checkBadges()
      buzz(res.r === 'ok' ? 15 : [10, 60, 10])
      acts.innerHTML = `<button class="btn ghost" data-retry>再練一次</button><button class="btn primary" data-close>完成</button>`
      requestAnimationFrame(() => fb.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'nearest' }))
    }
    if (matchMedia('(pointer: fine)').matches) C.focus?.()
  }
  acts.addEventListener('click', (e) => {
    if (e.target.closest('[data-retry]')) practice()
  })
  quick ? practice() : showReview()
}
// 唯讀的題目卡：題目＋作答紀錄＋正確答案＋解析
function reviewCard(it, last, label) {
  const C = makeItem(it, 'review')
  if (it.t === 'learn') {
    $$('.opt', C.el).forEach((o) => {
      o.disabled = true
      o.classList.add(+o.dataset.i === it.a ? 'ok' : 'dim')
    })
    const r = $('.learn-rule', C.el)
    if (r) r.hidden = false
    return C.el
  }
  const fb = $('.q-feedback', C.el)
  fb.hidden = false
  const { kpH, why } = explainParts(it, last?.a)
  fb.innerHTML = `<div class="fb ${last?.r || 'bad'}">${kpH}${last ? `<div class="fb-ans you"><div class="fb-k">${label}${last.r === 'ok' ? '（答對）' : last.r === 'care' ? '（格式粗心）' : '（答錯）'}</div><div class="fb-v">${esc(last.a) || '（空白）'}</div></div>` : ''}<div class="fb-ans"><div class="fb-k">正確答案</div><div class="fb-v">${rightAnswerText(it)}</div></div>${it.ex ? `<div class="fb-ex">${ICON.bulb}<div>${rich(it.ex)}</div></div>` : ''}${why}</div>`
  $$('button, input, textarea', C.el).forEach((b) => {
    if (!b.closest('.audio') && !b.matches('.say')) b.disabled = true
  })
  const t = $('.transcript', C.el)
  if (t) t.hidden = false
  return C.el
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
  Sync.presence({ view: 'home' })
  setView(
    `<div class="page home">
      <header class="lg-head"><div class="eyebrow">${new Date().toLocaleDateString('zh-TW', { month: 'long', day: 'numeric', weekday: 'long' })}</div>
        <div class="lg-row"><h1>${hello}</h1>${sd ? `<span class="streak">${ICON.flame}<b>${sd}</b> 天</span>` : ''}</div>
        <p class="lg-sub">翰林版七上｜第一次段考：Starter～Review 1${cd ? '　·　' + cd : ''}</p>
      </header>
      ${hwCardHTML(myRole() === 'parent') || '<section class="hw-card" hidden></section>'}
      ${studentsCardHTML()}

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
      ${liveBannerHTML() || '<div class="live-banner" hidden></div>'}
      ${planHTML()}

      <section class="quick">
        <button class="qk qk-speak" data-go="#/speak"><span class="qk-ic">${ICON.mic}</span><span class="qk-tt"><span class="qk-t">口說練習</span><span class="qk-s">${(() => {
          const sp = S.sessions.filter((s) => s.k === 'speak')
          return sp.length ? `最高 ${Math.max(...sp.map((s) => s.s))} 分・練口說也練聽力` : '跟著念，App 聽你說・練口說也練聽力'
        })()}</span></span>${ICON.chev}</button>
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
  // 作業：做完最後一項就恭喜；太久沒抓就重新抓一次
  hwCelebrate()
  if (Sync.ready() && !Sync.isAdmin() && (!Sync.hwAt || Date.now() - Sync.hwAt > 120000)) Sync.fetchHw()
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
// 第一次進到網站：介紹＋「你是誰」三個大按鈕，點一下就好（不是登入；選錯可以到設定改）
function welcome() {
  if (S.seen?.intro || (S.sync && myRole() !== 'student')) return
  const markSeen = () => {
    S.seen = { ...(S.seen || {}), intro: Date.now() }
    save()
  }
  const b = sheet(
    `<div class="welcome">
      <img class="w-logo" src="icon.svg" alt="" width="64" height="64">
      <h2>歡迎使用英文段考複習</h2>
      <p class="sheet-p">翰林版七上・第一次段考複習</p>
      <div class="w-rows">
        <div class="w-row"><span class="w-ic">💡</span><div><b>先猜，再看重點</b><p>每個單元先用觀念卡讓你猜規則，自己想過的記得更牢。</p></div></div>
        <div class="w-row"><span class="w-ic">🔎</span><div><b>抓出粗心</b><p>大寫、標點、空格寫錯都會被抓出來，養成「寫完檢查」的習慣。</p></div></div>
        <div class="w-row"><span class="w-ic">📗</span><div><b>錯題會再回來</b><p>答錯的題目收進錯題本，隔一段時間再答對才會畢業。</p></div></div>
      </div>
      <div class="w-ask">你是誰？</div>
      <div class="role-pick two">
        <button data-role="student"><span class="rp-ic">🎒</span><b>我是學生</b><small>開始練習</small></button>
        <button data-role="parent"><span class="rp-ic">👪</span><b>我是家長</b><small>看孩子的練習</small></button>
      </div>
      <button class="link w-code" data-code>有老師給的代碼？點這裡輸入</button>
      <p class="w-note">選錯了沒關係，之後到「設定 → 身分」就能改。</p>
    </div>`,
    { onClose: markSeen },
  )
  b.addEventListener('click', (e) => {
    if (e.target.closest('[data-code]')) {
      closeSheet()
      return setTimeout(() => codeSheet(), 350)
    }
    const r = e.target.closest('[data-role]')?.dataset.role
    if (!r) return
    setRole(r)
    closeSheet()
    if (r === 'student') return toast('開始練習吧！加油 💪', '🎒')
    if (S.sync) return go('#/live')
    setTimeout(() => (r === 'teacher' ? teacherStart() : parentStart()), 350)
  })
}
// 設定「這台是誰的」（歡迎畫面、設定頁共用）
function setRole(r) {
  S.profile.role = r
  S.profile.device = r === 'teacher' && S.profile.device === '老師平板' ? '老師平板' : ROLES[r]
  if (S.sync) S.sync.role = r
  save()
  Sync.presence(Sync.last || { view: 'home' })
}
// 老師：開始使用老師後台（建立後就能新增學生）
function teacherStart() {
  const b = sheet(
    `<h2 class="sheet-title">開始使用老師後台？</h2>
    <p class="sheet-p">開始之後可以新增學生，再把 QR Code、連結或代碼給學生和家長。學生每答一題，這裡幾秒內就看得到；每個學生、每個家庭都只看得到自己的紀錄。</p>
    <div class="sheet-actions"><button class="btn ghost" data-close>稍後再說</button><button class="btn primary" data-new>開始使用</button></div>`,
  )
  $('[data-new]', b).onclick = () => startTeacher()
}
function startTeacher() {
  closeSheet()
  Sync.pair(newCode(), 'teacher', { owner: true })
  go('#/students')
}
// 從貼上的文字找出加入連結：#/pair/<班級>/<身分>/<學生代號或鑰匙>
const parsePairLink = (v) => {
  const m = String(v || '').match(/pair\/([a-z0-9]{16,40})(?:\/(student|parent|teacher)(?:\/([a-z0-9]{4,40}))?)?/)
  return m ? `#/pair/${m[1]}${m[2] ? '/' + m[2] + (m[3] ? '/' + m[3] : '') : ''}` : ''
}
// 家長第一次：掃 QR Code、點連結，或輸入代碼
function parentStart() {
  const b = sheet(
    `<h2 class="sheet-title">看孩子的練習</h2>
    <p class="sheet-p">用手機相機掃老師給的 QR Code，或點老師用 LINE 傳的「家長用」連結，就能在這支手機即時看到孩子的練習。</p>
    <div class="list"><button class="row" data-code><span class="row-ic">🔢</span><span class="row-t">輸入代碼<small>老師給的 6 碼代碼</small></span>${ICON.chev}</button>
    <label class="row field"><span class="row-t">或把連結貼在這裡</span><input id="pp-link" placeholder="貼上老師給的連結" autocomplete="off" autocapitalize="off" spellcheck="false"></label></div>
    <div class="sheet-actions"><button class="btn primary" data-close>知道了</button></div>`,
  )
  $('[data-code]', b).onclick = () => {
    closeSheet()
    setTimeout(() => codeSheet('parent'), 350)
  }
  const inp = $('#pp-link', b)
  const onPaste = () => {
    const h = parsePairLink(inp.value.trim())
    if (!h) return toast('連結不對，請貼上老師給的整個連結', '⚠️')
    inp.removeEventListener('change', onPaste)
    inp.blur()
    closeSheet()
    go(h.includes('/student') || h.includes('/parent') ? h : h + '/parent')
  }
  inp.addEventListener('change', onPaste)
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
        pre = `<div class="p-passage"><b>${esc(p.title)}</b>${passageBody(p, true)}</div>`
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
    if (r) return reviewSheet(r.dataset.review, { onDone: () => setTimeout(() => location.hash === '#/book' && !$('.sheet-wrap') && viewBook(), 300) })
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
  // 同一篇文章挑幾題，但照原本的順序排
  const inOrder = (list, n) => take(list, n).sort((a, b) => list.indexOf(a) - list.indexOf(b))
  // 會考聽力三部分：辨識句意、基本問答、言談理解（不夠就用字音辨識補）
  const L = pool.filter((i) => i.audio && i.t === 'mcq')
  let listen = ['辨識句意', '基本問答', '言談理解'].flatMap((s) => take(L.filter((i) => secOf(i) === s), 3))
  if (listen.length < 9) listen = listen.concat(take(L.filter((i) => !listen.includes(i)), 9 - listen.length))
  const vocab = take(pool.filter((i) => i.t === 'fill' && !i.audio && !i.passage && !i.fig), 4)
  const single = [...take(pool.filter((i) => i.sec === '情境單題'), 3), ...take(pool.filter((i) => i.t === 'mcq' && !i.audio && !i.passage && !i.fig && !i.sec), 5)]
  const cloze = pool.filter((i) => i.passage === 'nina')
  const textId = pick(['leo', 'rita'])
  const chartId = pick(['ruby', 'lost', 'chat'])
  const write = [...take(pool.filter((i) => i.t === 'write' && !i.fig), 3), ...take(pool.filter((i) => i.t === 'spot' || (i.t === 'order' && !i.lines)), 2)]
  // 配分合計 100（會考聽力＋閱讀的結構，加上段考的非選擇題）
  return [
    { h: '一、聽力測驗', sub: '辨識句意・基本問答・言談理解（每題可以重聽）', pts: 27, items: listen },
    { h: '二、字彙', sub: '注意大小寫和拼字', pts: 8, items: vocab },
    { h: '三、單題', sub: '情境對話與文法', pts: 16, items: single },
    { h: '四、克漏字', sub: PASSAGES.nina.title, pts: 10, items: cloze, passage: 'nina' },
    { h: '五、閱讀題組', sub: PASSAGES[textId].title, pts: 12, items: inOrder(pool.filter((i) => i.passage === textId), 4), passage: textId },
    { h: '六、圖表題組', sub: PASSAGES[chartId].title, pts: 12, items: pool.filter((i) => i.passage === chartId), passage: chartId },
    { h: '七、非選擇題', sub: '句型改寫・挑錯・重組：大寫、標點都算分', pts: 15, items: write },
  ]
}
function viewExam() {
  if (!EXAM || EXAM.graded) {
    setView(
      `<div class="page narrow">
        ${header('模擬段考', '', '', true)}
        <div class="card exam-intro">
          <div class="exam-ic">${ICON.doc}</div>
          <h2>約 40 題，滿分 100，比照段考＋會考題型</h2>
          <ul class="plain">
            <li>聽力（辨識句意、基本問答、言談理解）、字彙、單題、克漏字、閱讀題組、圖表題組、非選擇題，每大題都有配分。</li>
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
      Sync.presence({ view: 'exam' })
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
    g.innerHTML = `<div class="exam-h"><h2>${esc(sec.h)}${sec.pts ? `<small class="exam-pts">（${sec.pts} 分）</small>` : ''}</h2>${sec.sub ? `<span>${esc(sec.sub)}</span>` : ''}</div>${sec.passage ? passageHTML(sec.passage, 'practice') : ''}`
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
    fb.innerHTML = feedbackHTML(C.it, res, { exam: true }) + (res.r !== 'ok' ? `<button class="btn ghost retry-btn" data-retry="${C.it.id}">↻ 再試一次</button>` : '')
    fb.hidden = false
    revealExtras(C)
    C.el.classList.add('done', 'r-' + res.r)
  }
  const total = EXAM.ctrls.length
  // 依大題配分算分數（每大題的分數平均分給該大題的題目）
  let got = 0
  let gotCare = 0
  let full = 0
  for (const sec of EXAM.secs) {
    if (!sec.items.length) continue
    const w = (sec.pts || sec.items.length) / sec.items.length
    full += w * sec.items.length
    for (const it of sec.items) {
      const r = EXAM.ctrls.find((c) => c.it === it)?.res?.r
      if (r === 'ok') got += w
      if (r === 'ok' || r === 'care') gotCare += w
    }
  }
  const score = Math.round((got / full) * 100)
  const ifCare = Math.round((gotCare / full) * 100)
  const dur = Date.now() - EXAM.t0
  addSession({ k: 'exam', m: 'exam', title: '模擬段考', s: score, n: total, ok, care, bad: total - ok - care, ifCare, stars: score >= 90 ? 3 : score >= 70 ? 2 : 1, ts: Date.now(), dur, d: S.profile.id })
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
  // 檢討時答錯的題目可以馬上再試一次（不改分數）
  $('.exam-paper').addEventListener('click', (e) => {
    const r = e.target.closest('[data-retry]')
    if (r) reviewSheet(r.dataset.retry, { quick: true })
  })
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
      Sync.presence({ view: 'flash' })
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
  addSession({ k: 'flash', m: 'flash', title: '閃電挑戰', s: FL.n, n: FL.n + FL.miss.length, ts: Date.now(), dur: Date.now() - FL.t0, d: S.profile.id, combo: FL.maxCombo })
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
      ${header('學習紀錄', S.profile.name ? `${S.profile.name}・${S.profile.device || ''}` : '紀錄存在這個瀏覽器裡；可以匯出給老師或其他裝置。')}
      ${
        teacherMode()
          ? `<button class="card live-link" data-x="students"><span class="live-pulse${studentIds().some((sid) => isActive(latestLive(sid))) ? '' : ' idle'}"></span><span class="row-t"><b>學生的紀錄</b><small>這一頁是老師自己的練習；學生的紀錄在「學生」分頁</small></span>${ICON.chev}</button>`
          : Sync.ready() && myRole() === 'parent'
            ? `<button class="card live-link" data-x="live"><span class="live-pulse${studentsLive().some(([, l]) => isActive(l)) ? '' : ' idle'}"></span><span class="row-t"><b>即時作答</b><small>${esc(studentsLive().map(([, l]) => `${Sync.stu?.name || l.name || l.dev}：${liveText(l)}`)[0] || '等孩子開始練習')}</small></span>${ICON.chev}</button>`
            : ''
      }
      ${devices.size > 1 ? `<div class="seg" role="tablist"><button role="tab" class="${!mine ? 'on' : ''}" data-f="all">全部</button><button role="tab" class="${mine ? 'on' : ''}" data-f="mine">只看這裡做的</button></div>` : ''}
      <div class="tiles">
        <div class="tile"><div class="tile-v">${list.length}</div><div class="tile-k">已作答</div></div>
        <div class="tile"><div class="tile-v">${list.length ? Math.round((ok / list.length) * 100) + '<small>%</small>' : '—'}</div><div class="tile-k">正確率</div></div>
        <div class="tile"><div class="tile-v care">${care}</div><div class="tile-k">格式粗心</div></div>
        <div class="tile"><div class="tile-v">${days}</div><div class="tile-k">練習天數</div></div>
      </div>
      ${sure ? `<div class="callout"><b>「很確定」卻答錯：${sure} 題。</b>這類題目代表「以為會、其實不會」，是最值得弄懂的地方（作答時按「有點猜」的題目不算在內）。</div>` : ''}
      ${selfRecHTML()}

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
          <button class="row danger" data-x="clear"><span class="row-t">清除所有紀錄</span></button>
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
    if (x === 'live') return go('#/live')
    if (x === 'students') return go('#/students')
    if (x === 'report') shareReport()
    if (x === 'export') exportData()
    if (x === 'import') $('.file-in').click()
    if (x === 'clear') confirmSheet('清除所有紀錄？', '所有作答紀錄、錯題本、進度都會刪除，而且不能復原。建議先「匯出備份檔」。', '全部清除', () => {
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
  const role = myRole()
  setView(
    `<div class="page narrow">
      ${header('設定', '')}
      <div class="group"><div class="group-h">學生</div><div class="list form">
        <label class="row field"><span class="row-t">名字</span><input id="f-name" value="${esc(p.name)}" placeholder="例如：Amy" maxlength="20" autocomplete="off"></label>
        ${
          ACTIVE
            ? ''
            : `<div class="row field"><span class="row-t">身分</span><div class="seg small" data-seg="role">${Object.entries(ROLES)
                .map(([k, t]) => `<button class="${role === k ? 'on' : ''}" data-v="${k}">${t}</button>`)
                .join('')}</div></div>`
        }
        <label class="row field"><span class="row-t">段考日期</span><input id="f-exam" type="date" value="${esc(p.exam)}"></label>
      </div><p class="group-f">「身分」會寫在學習報告和備份檔上；老師、家長是用來看學生練習的。</p></div>

      <div class="group"><div class="group-h">練習</div><div class="list form">
        <div class="row field"><span class="row-t">每日目標</span><div class="seg small" data-seg="goal">${[20, 30, 50].map((g) => `<button class="${+p.goal === g ? 'on' : ''}" data-v="${g}">${g} 題</button>`).join('')}</div></div>
        <div class="row field"><span class="row-t">語音速度</span><div class="seg small" data-seg="rate"><button class="${p.rate === 'slow' ? 'on' : ''}" data-v="slow">慢</button><button class="${p.rate !== 'slow' ? 'on' : ''}" data-v="normal">標準</button></div></div>
        <button class="row" data-x="voice"><span class="row-ic">${ICON.speaker}</span><span class="row-t">試聽語音</span>${ICON.chev}</button>
      </div><p class="group-f">聽力用裝置內建的英文語音。iPad 可以到「設定 → 輔助使用 → 朗讀內容 → 聲音」下載更自然的英文語音（例如 Samantha 加強版）。</p></div>

      <div class="group"><div class="group-h">上課</div><div class="list form">
        <div class="row field"><span class="row-t">先說答案，再看選項<small>選擇題的選項先遮住，學生先口頭回答</small></span><div class="seg small" data-seg="oral"><button class="${p.oral === 'on' ? 'on' : ''}" data-v="on">開</button><button class="${p.oral !== 'on' ? 'on' : ''}" data-v="off">關</button></div></div>
        <div class="row field"><span class="row-t">字體大小</span><div class="seg small" data-seg="size"><button class="${p.size !== 'lg' ? 'on' : ''}" data-v="std">標準</button><button class="${p.size === 'lg' ? 'on' : ''}" data-v="lg">大</button></div></div>
      </div><p class="group-f">「先說答案」：自己想出答案再對照，比直接看選項記得更牢（生成效應）。學生回家自己練時可以關掉。<br>有實體鍵盤時：按 1～4 選選項，Enter 檢查／下一題。</p></div>

      <div id="sync-sec">${syncSettingsHTML(role)}</div>

      <div class="group"><div class="group-h">App</div><div class="list">
        <button class="row" data-x="update"><span class="row-t">檢查更新</span><span class="row-r">${VERSION}</span>${ICON.chev}</button>
        <button class="row" data-x="install"><span class="row-t">加到主畫面（像 App 一樣打開）</span>${ICON.chev}</button>
      </div></div>
      <p class="foot">題目、文章、聽力稿都是依翰林版七上 Starter～Review 1 的字彙與句型自編，不含課本原文。<br>紀錄存在這個瀏覽器裡；清除瀏覽器資料會一起刪除，記得定期匯出備份。</p>
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
  const onPair = (e) => {
    const v = e.target.value.trim()
    const h = parsePairLink(v)
    const code6 = /^[a-z0-9]{3}[\s-]?[a-z0-9]{3}$/i.test(v)
    if (!h && !code6) return toast('連結不對，請貼上老師給的整個連結', '⚠️')
    // 只處理一次（失焦時會再觸發一次 change）
    e.target.removeEventListener('change', onPair)
    e.target.blur()
    if (h) return go(h)
    codeSheet('', v) // 貼到代碼
  }
  $('#f-pair')?.addEventListener('change', onPair)
  v.addEventListener('click', (e) => {
    const b = e.target.closest('[data-seg] button')
    if (b) {
      const k = b.parentElement.dataset.seg
      if (k === 'role') {
        setRole(b.dataset.v)
        return viewSettings()
      }
      S.profile[k] = k === 'goal' ? +b.dataset.v : b.dataset.v
      save()
      if (k === 'size') applySize()
      $$('button', b.parentElement).forEach((x) => x.classList.toggle('on', x === b))
      return
    }
    const x = e.target.closest('[data-x]')?.dataset.x
    if (x === 'newpair') return startTeacher()
    if (x === 'code') return codeSheet()
    if (x === 'students') return go('#/students')
    if (x === 'live') return go('#/live')
    if (x === 'manage') return go('#/manage')
    if (x === 'unpair')
      return confirmSheet(
        Sync.state === 'owner' ? '停用老師後台？' : '退出同步？',
        Sync.state === 'owner' ? '停用之後，這裡就看不到學生的資料（資料還在雲端）。之後要管理，得重新開始使用老師後台。' : '之後不會再同步，已經同步過來的紀錄會留著。',
        Sync.state === 'owner' ? '停用' : '退出',
        () => {
          Sync.unpair()
          toast('已解除', '👋')
          viewSettings()
        },
        true,
      )
    if (x === 'voice') Voice.speak([['W', 'Hi, I am Jamie. Nice to meet you.'], ['M', 'Nice to meet you, too.']])
    if (x === 'update') checkUpdate()
    if (x === 'install')
      sheet(`<h2 class="sheet-title">加到主畫面</h2><ol class="plan"><li>用 <b>Safari</b> 打開這個網址。</li><li>點上方或下方的「分享」按鈕 ${ICON.share}。</li><li>選「加入主畫面」，再按「新增」。</li></ol><p class="sheet-p">之後從主畫面打開，就像一般 App 一樣全螢幕，沒有網路也能練習（聽力需要裝置語音）。Android 的 Chrome：右上角選單 →「加到主畫面」。</p>`)
  })
}
// 設定頁的「即時同步」區塊：依這台的狀態顯示（還沒加入／暫停加入或被移除／已加入／管理裝置）
function syncSettingsHTML(role) {
  const st = Sync.state
  const status = { on: '已連線', connecting: '連線中', error: '重新連線中', off: '未連線' }[Sync.status] || ''
  const dot = `<span class="row-ic"><i class="sync-dot" data-s="${Sync.status}"></i></span>`
  const pend = S.syncQ?.length ? `還有 ${S.syncQ.length} 筆待上傳` : '紀錄都已上傳'
  if (ACTIVE)
    return `<div class="group"><div class="group-h">學生模式</div><div class="list"><div class="row static">${dot}<span class="row-t">學生模式：${esc(S.profile.name || '學生')}<small>${status}・作答會同步到 ${esc(S.profile.name || '這個學生')} 的紀錄・${pend}</small></span></div>
      <button class="row" data-endclass><span class="row-ic">⏹</span><span class="row-t">結束<small>回到老師後台</small></span>${ICON.chev}</button></div></div>`
  let rows
  if (!S.sync?.code) {
    rows = `<button class="row" data-x="code"><span class="row-ic">🔢</span><span class="row-t">輸入代碼<small>老師給的 6 碼代碼</small></span>${ICON.chev}</button>
      <label class="row field"><span class="row-t">貼上連結<small>直接點老師傳的連結、掃 QR Code 也可以</small></span><input id="f-pair" placeholder="貼上老師給的連結" autocomplete="off" autocapitalize="off" spellcheck="false"></label>`
  } else if (['closed', 'removed', 'invalid', 'wait'].includes(st)) {
    const t = { closed: '目前暫停加入', removed: '已經被移出', invalid: '沒辦法加入：連結可能已經失效', wait: '正在更新，老師那邊打開 App 之後就會完成' }[st]
    rows = `<div class="row static"><span class="row-ic">${{ closed: '🔒', removed: '🚫', invalid: '⚠️', wait: '⏳' }[st]}</span><span class="row-t">${t}<small>身分：${ROLES[role]}${S.syncQ?.length ? `・加入後會上傳 ${S.syncQ.length} 筆` : ''}</small></span></div>
      ${st !== 'wait' ? '<button class="row" data-rejoin><span class="row-ic">📨</span><span class="row-t">再試一次</span></button>' : ''}
      ${st === 'invalid' ? `<button class="row" data-x="code"><span class="row-ic">🔢</span><span class="row-t">輸入新的代碼</span>${ICON.chev}</button>` : ''}
      <button class="row danger" data-x="unpair"><span class="row-t">不加入了</span></button>`
  } else if (teacherMode()) {
    const n = pendingCount()
    rows = `<div class="row static">${dot}<span class="row-t">老師後台${st === 'owner' ? '（建立者）' : ''}<small>${status}</small></span></div>
      <button class="row" data-x="students"><span class="row-ic">${ICON.people}</span><span class="row-t">學生<small>新增學生、傳 QR Code／連結／代碼、看即時作答、上課</small></span>${ICON.chev}</button>
      ${Sync.isAdmin() ? `<button class="row" data-x="manage"><span class="row-ic">👥</span><span class="row-t">成員管理<small>看哪些裝置加入了、移除裝置、暫停加入</small></span>${n ? `<b class="row-badge">${n}</b>` : ''}${ICON.chev}</button>` : ''}
      <button class="row danger" data-x="unpair"><span class="row-t">${st === 'owner' ? '停用老師後台' : '退出老師後台'}</span></button>`
  } else {
    const nm = Sync.stu?.name
    rows = `<div class="row static">${dot}<span class="row-t">已連結老師（${role === 'parent' ? `${esc(nm || '孩子')}的家長` : `學生${nm ? '・' + esc(nm) : ''}`}）<small>${status}${role === 'student' ? '・' + pend : ''}</small></span></div>
      ${role === 'parent' ? `<button class="row" data-x="live"><span class="row-ic">📡</span><span class="row-t">即時作答<small>看孩子正在做哪一題、每題答了什麼</small></span>${ICON.chev}</button>` : ''}
      <button class="row danger" data-x="unpair"><span class="row-t">退出同步</span></button>`
  }
  const teacher = S.sync?.code
    ? ''
    : `<div class="group"><div class="group-h">老師專區</div><div class="list"><button class="row" data-x="newpair"><span class="row-ic">📚</span><span class="row-t">開始使用老師後台<small>新增學生，再把 QR Code、連結或代碼給學生和家長</small></span>${ICON.chev}</button></div></div>`
  return `<div class="group"><div class="group-h">${S.sync?.code ? '即時同步' : '連結老師'}</div><div class="list">${rows}</div><p class="group-f">每個學生、每個家庭都只看得到自己的紀錄。學生名字建議用暱稱。</p></div>${teacher}`
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

// ───────────────────────── 口說練習 ─────────────────────────
// 跟讀：先聽、再說。用瀏覽器內建的語音辨識（Chrome、Safari）聽學生念，逐字比對，標出要再練的字
const SR = window.SpeechRecognition || window.webkitSpeechRecognition
const NUM = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(' ')
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
const numWord = (n) => (n < 20 ? NUM[n] : n < 100 ? TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + NUM[n % 10] : '') : String(n))
// 比對看的是「念出來的音」，不是拼字：語音辨識常把 they're 寫成 there、Mr. 寫成 mister，這些都算對
// ① 兩個字的完整寫法併成縮寫（they are ＝ they're），兩邊用同一種寫法比
const SP_JOIN = { 'what is': "what's", 'who is': "who's", 'where is': "where's", 'it is': "it's", 'he is': "he's", 'she is': "she's", 'that is': "that's", 'i am': "i'm", 'you are': "you're", 'we are': "we're", 'they are': "they're", 'let us': "let's" }
// 否定的縮寫先拆開（isn't ＝ is not），這樣 he isn't、he's not、he is not 三種都比得起來
const SP_NEG = { "isn't": ['is', 'not'], "aren't": ['are', 'not'], "don't": ['do', 'not'], "doesn't": ['does', 'not'], "can't": ['can', 'not'], cannot: ['can', 'not'] }
// ② 同音字（念起來一樣）算同一個字
const SP_SAME = { "they're": 'their', there: 'their', "you're": 'your', "it's": 'its', "who's": 'whose', "we're": 'were', too: 'to', two: 'to', four: 'for', write: 'right', eye: 'i', know: 'no', hear: 'here', won: 'one', ate: 'eight', sea: 'see', bye: 'by', buy: 'by', mister: 'mr', missus: 'mrs', misses: 'mrs', miss: 'ms', miz: 'ms', okay: 'ok', grey: 'gray', favourite: 'favorite', colour: 'color', mum: 'mom', ant: 'aunt', sun: 'son', high: 'hi', deer: 'dear' }
// 一個字（或一段話）→ 小寫、去標點、數字轉英文
const spBasic = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\d+/g, (m) => ` ${numWord(+m)} `)
    .replace(/-/g, ' ')
    .replace(/[^a-z' ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((w) => SP_NEG[w] || [w])
// 一串字 → 比對用的寫法（src：每個比對字來自原句的哪幾個字）
function spCanon(list) {
  const out = []
  for (let i = 0; i < list.length; i++) {
    const a = list[i]
    const b = list[i + 1]
    const j = SP_JOIN[a.w] || (b && SP_JOIN[a.w + ' ' + b.w])
    // 最後拿掉撇號：he's → hes、Lee's → lees（兩邊做法一樣，比得起來）
    if (j && !SP_JOIN[a.w] && b) {
      out.push({ w: (SP_SAME[j] || j).replace(/'/g, ''), src: [...a.src, ...b.src] })
      i++
    } else out.push({ w: (SP_SAME[j || a.w] || j || a.w).replace(/'/g, ''), src: a.src })
  }
  return out
}
// 人名不算分（語音辨識常把 Lee 寫成 Li、Leigh）：句中大寫開頭的字，English 和稱謂除外
const SP_NOT_NAME = new Set(['english', 'mr', 'mrs', 'ms', 'i'])
function spIsName(toks, i) {
  const t = toks[i].replace(/[^A-Za-z']/g, '')
  if (!/^[A-Z][a-z]/.test(t) || SP_NOT_NAME.has(t.toLowerCase().replace(/'s$/, ''))) return false
  // 前一個字是句尾（. ! ?）就是新句子的開頭，不是人名；但 Mr. Mrs. Ms. 的點不算句尾
  const prev = toks[i - 1] || ''
  return i > 0 && (!/[.!?]$/.test(prev) || /^(Mr|Mrs|Ms|Dr)\.$/i.test(prev))
}
// 逐字比對（最長共同子序列）；語音辨識給的幾個候選結果，任一個念到就算
function speakScore(target, heards) {
  const toks = target.split(/\s+/)
  const name = toks.map((_, i) => spIsName(toks, i))
  const T = spCanon(toks.flatMap((t, i) => spBasic(t).map((w) => ({ w, src: [i] }))))
  const scored = T.map((x) => !x.src.every((i) => name[i]))
  const hit = new Array(T.length).fill(false)
  let heard = ''
  let bestN = -1
  for (const h of heards || []) {
    const H = spCanon(spBasic(h).map((w) => ({ w, src: [] }))).map((x) => x.w)
    const dp = Array.from({ length: T.length + 1 }, () => new Array(H.length + 1).fill(0))
    for (let i = T.length - 1; i >= 0; i--) for (let j = H.length - 1; j >= 0; j--) dp[i][j] = T[i].w === H[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    let n = 0
    for (let i = 0, j = 0; i < T.length && j < H.length; ) {
      if (T[i].w === H[j]) {
        hit[i] = true
        n++
        i++
        j++
      } else if (dp[i + 1][j] >= dp[i][j + 1]) i++
      else j++
    }
    if (n > bestN) {
      bestN = n
      heard = h
    }
  }
  const total = scored.filter(Boolean).length
  const got = T.filter((_, k) => scored[k] && hit[k]).length
  const words = toks.map((t, i) => ({ t, name: name[i], ok: name[i] || T.every((x, k) => !x.src.includes(i) || hit[k]) }))
  return { score: heards?.length ? Math.round((got / Math.max(1, total)) * 100) : 0, words, heard }
}
const speakWordsHTML = (words) => words.map(({ t, ok, name }) => `<span class="spw ${name ? 'name' : ok ? 'ok' : 'miss'}">${esc(t)}</span>`).join(' ')
const SPEAK_ERR = {
  'not-allowed': '沒有麥克風權限：請允許這個網站使用麥克風（iPhone、iPad：設定 → Safari → 麥克風；也要打開「設定 → 一般 → 鍵盤 → 聽寫」）',
  'service-not-allowed': '語音辨識沒有開：iPhone、iPad 請打開「設定 → 一般 → 鍵盤 → 聽寫」',
  'no-speech': '沒有聽到聲音，請靠近一點再說一次',
  'audio-capture': '找不到麥克風',
  network: '語音辨識需要網路，請檢查網路',
}
// 開始聽：說完會自動停；最多 12 秒
function listen(onInterim) {
  const r = new SR()
  r.lang = 'en-US'
  r.interimResults = true
  r.maxAlternatives = 3
  r.continuous = false
  let alts = []
  let interim = ''
  let err = ''
  const done = new Promise((res) => {
    r.onresult = (e) => {
      const rs = [...e.results]
      const head = rs
        .slice(0, -1)
        .map((x) => x[0].transcript)
        .join(' ')
      const last = rs[rs.length - 1]
      const list = [...last].map((a) => `${head} ${a.transcript}`.trim())
      onInterim?.(list[0])
      if (last.isFinal) alts = list
      else interim = list[0]
    }
    r.onerror = (e) => (err = e.error || 'error')
    r.onend = () => res({ alts: alts.length ? alts : interim ? [interim] : [], err })
  })
  const timer = setTimeout(() => r.stop(), 12000)
  done.then(() => clearTimeout(timer))
  r.start()
  return { stop: () => r.stop(), done }
}

let SP = null // { list, i, res: [{best, tries}], unit, over }
const speakUnits = () => Object.keys(SPEAK)
function speakPool(unit) {
  return (unit === 'all' ? speakUnits() : [unit]).flatMap((u) => SPEAK[u].map(([en, zh, tip]) => ({ en, zh, tip, u })))
}
function viewSpeak() {
  RUN = null
  if (SP && !SP.over) return speakRun()
  const sess = S.sessions.filter((s) => s.k === 'speak')
  const best = sess.length ? Math.max(...sess.map((s) => s.s)) : 0
  let unit = S.profile.speakUnit || 'all'
  let mode = S.profile.speakMode || 'read'
  const MODE_DESC = { read: '看著句子，先聽再跟著說。', blind: '句子先藏起來，只聽聲音再跟著說，說完才看到句子。最能練段考聽力（例如 thirteen／thirty、this／these 聽得出來）。' }
  Sync.presence({ view: 'home' })
  setView(
    `<div class="page narrow speak-intro">
      ${header('口說練習', '先聽，再跟著說。練口說，也練段考聽力。', '', true)}
      ${SR ? '' : '<div class="callout care"><b>這個瀏覽器不能用語音辨識。</b>iPhone、iPad 請用 Safari 打開；電腦和 Android 請用 Chrome。</div>'}
      <div class="card sp-intro">
        <div class="sp-big-ic">${ICON.mic}</div>
        <div class="seg" id="sp-mode"><button data-m="read" class="${mode === 'read' ? 'on' : ''}">看字跟讀</button><button data-m="blind" class="${mode === 'blind' ? 'on' : ''}">不看字（練聽力）</button></div>
        <p class="muted sp-mode-desc">${MODE_DESC[mode]}</p>
        <div class="seg" id="sp-unit">${[...speakUnits(), 'all'].map((u) => `<button data-u="${u}" class="${u === unit ? 'on' : ''}">${u === 'all' ? '全部' : u}</button>`).join('')}</div>
        <p class="muted">每回 8 句。${best ? `目前最高 ${best} 分。` : ''}</p>
        <button class="btn primary big" data-act="go" ${SR ? '' : 'disabled'}>開始</button>
      </div>
      <ul class="sp-how">
        <li>第一次會問能不能用麥克風，請按「允許」。</li>
        <li>環境安靜一點，手機或平板離嘴巴近一點。</li>
        <li>念錯的字會標成紅色，點一下可以聽那個字。</li>
        <li>App 聽的是發音，不是拼字：人名不算分（灰色），同音字（例如 they're／there）、縮寫和完整寫法都算對。</li>
      </ul>
    </div>`,
  )
  $('.speak-intro').addEventListener('click', (e) => {
    const u = e.target.closest('[data-u]')
    if (u) {
      unit = u.dataset.u
      S.profile.speakUnit = unit
      save()
      $$('#sp-unit button').forEach((b) => b.classList.toggle('on', b === u))
    }
    const m = e.target.closest('[data-m]')
    if (m) {
      mode = m.dataset.m
      S.profile.speakMode = mode
      save()
      $$('#sp-mode button').forEach((b) => b.classList.toggle('on', b === m))
      $('.sp-mode-desc').textContent = MODE_DESC[mode]
    }
    if (e.target.closest('[data-act=go]') && SR) {
      SP = { list: shuffle(speakPool(unit)).slice(0, 8), i: 0, res: [], unit, blind: mode === 'blind', peek: [], played: [] }
      speakRun()
    }
    const g = e.target.closest('[data-go]')
    if (g) go(g.dataset.go)
  })
}
function speakRun() {
  const s = SP.list[SP.i]
  const r = SP.res[SP.i]
  // 不看字：說完（或按「看字」）之前，句子、中文、提醒都先藏起來
  const hide = SP.blind && !r && !SP.peek?.[SP.i]
  const tell = (extra = {}) => Sync.presence({ view: 'speak', title: SP.blind ? '口說練習（不看字）' : '口說練習', n: SP.i + 1, of: SP.list.length, text: s.en, ...extra })
  tell(r ? { said: r.heard, sc: r.score } : {})
  setView(
    `<div class="run speak-run">
      <header class="run-bar">
        <button class="icon-btn" data-act="close" aria-label="離開">${ICON.x}</button>
        <div class="run-mid"><div class="run-title">口說練習</div><div class="run-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${SP.list.length}" aria-valuenow="${SP.i}"><i style="width:${(SP.i / SP.list.length) * 100}%"></i></div></div>
        <span class="icon-btn sp-ph" aria-hidden="true"></span>
      </header>
      <div class="run-stage">
        <div class="run-count">第 ${SP.i + 1}／${SP.list.length} 句・${esc(s.u)}</div>
        <section class="card sp-card">
          ${
            hide
              ? `<div class="sp-en sp-hidden" aria-label="句子先藏起來">${s.en
                  .split(/\s+/)
                  .map((w) => `<i style="width:${Math.max(2, w.length) * 0.62}em"></i>`)
                  .join('')}</div><div class="sp-zh muted">先聽，聽懂了就跟著說</div>`
              : `<div class="sp-en" lang="en">${r ? speakWordsHTML(r.words) : esc(s.en)}</div>
          <div class="sp-zh">${esc(s.zh)}</div>
          ${s.tip ? `<div class="sp-tip">${ICON.bulb}<span>${esc(s.tip)}</span></div>` : ''}`
          }
          <div class="sp-listen"><button class="pill" data-act="play">${ICON.speaker}<span>聽</span></button><button class="pill" data-act="slow">🐢<span>慢速</span></button>${hide ? '<button class="pill" data-act="peek">👀<span>看字</span></button>' : ''}</div>
        </section>
        <div class="sp-mic-wrap">
          <button class="sp-mic" data-act="mic" aria-label="${r ? '再說一次' : '開始說'}">${ICON.mic}</button>
          <div class="sp-mic-label">${r ? '再說一次' : hide ? '聽完就跟著說' : '點一下，跟著說'}</div>
          <div class="sp-live" aria-live="polite"></div>
        </div>
        <section class="sp-result card" ${r ? '' : 'hidden'}>${r ? speakResultHTML(r) : ''}</section>
      </div>
      <footer class="run-actions">
        <div class="ra-left">${r ? '' : '<button class="pill" data-act="skip">跳過</button>'}</div>
        <button class="btn primary big" data-act="next" ${r ? '' : 'disabled'}>${SP.i + 1 >= SP.list.length ? '看結果' : '下一句'}</button>
      </footer>
    </div>`,
    { tabs: false },
  )
  // 不看字：每一句第一次出現時自動念一次（在按鈕的點擊裡呼叫，iPhone 才會出聲）
  if (hide && !SP.played[SP.i]) {
    SP.played[SP.i] = true
    Voice.speak(s.en)
  }
  let L = null
  $('.speak-run').addEventListener('click', async (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act
    if (!a) {
      const w = e.target.closest('.spw')
      if (w) Voice.speak(w.textContent.replace(/[^A-Za-z' -]/g, ''))
      return
    }
    if (a === 'close') {
      L?.stop()
      SP.over = true
      return go('#/')
    }
    if (a === 'play' || a === 'slow') return Voice.speak(s.en, a === 'slow')
    if (a === 'peek') {
      SP.peek[SP.i] = true
      return speakRun()
    }
    if (a === 'skip' || a === 'next') {
      L?.stop()
      Voice.stop()
      if (a === 'skip' && !SP.res[SP.i]) SP.res[SP.i] = null
      SP.i++
      return SP.i >= SP.list.length ? speakSummary() : speakRun()
    }
    if (a === 'mic') {
      const mic = $('.sp-mic')
      if (L) return L.stop() // 再按一次＝說完了
      Voice.stop()
      mic.classList.add('on')
      $('.sp-mic-label').textContent = '正在聽…說完會自動停'
      tell({ said: '', listening: 1 })
      L = listen((t) => ($('.sp-live').textContent = t))
      const { alts, err } = await L.done
      L = null
      mic.classList.remove('on')
      if (!alts.length) {
        $('.sp-mic-label').textContent = SP.res[SP.i] ? '再說一次' : '點一下，跟著說'
        $('.sp-live').textContent = ''
        return toast(SPEAK_ERR[err] || '沒聽清楚，請再說一次', '🎤')
      }
      const res = speakScore(s.en, alts)
      const prev = SP.res[SP.i]
      SP.res[SP.i] = { ...res, tries: (prev?.tries || 0) + 1, best: Math.max(prev?.best || 0, res.score) }
      buzz(res.score >= 85 ? 15 : [10, 60, 10])
      speakRun()
    }
  })
}
function speakResultHTML(r) {
  const msg = r.score >= 100 ? '完美！每個字都很清楚' : r.score >= 85 ? '很棒！只差一點點' : r.score >= 65 ? '不錯！紅色的字再念一次' : '先按「聽」，跟著節奏再念一次'
  const miss = r.words.filter((w) => !w.ok).map((w) => w.t.replace(/[^A-Za-z' -]/g, ''))
  return `<div class="sp-score ${r.score >= 85 ? 'ok' : r.score >= 65 ? 'care' : 'bad'}"><b>${r.score}</b><span>分</span></div>
    <div class="sp-res-t"><div class="sp-msg">${msg}</div><div class="sp-heard">我聽到：<span lang="en">${esc(r.heard)}</span></div>
    ${miss.length ? `<div class="chips">${miss.map((w) => `<button class="chip say" data-say="${esc(w)}">${esc(w)} ${ICON.speaker}</button>`).join('')}</div>` : ''}</div>`
}
function speakSummary() {
  const done = SP.list.map((s, i) => ({ s, r: SP.res[i] })).filter((x) => x.r)
  const avg = done.length ? Math.round(done.reduce((n, x) => n + x.r.best, 0) / done.length) : 0
  const weak = uniq(done.flatMap((x) => (x.r.best < 100 ? x.r.words.filter((w) => !w.ok).map((w) => w.t.replace(/[^A-Za-z' -]/g, '').toLowerCase()) : []))).slice(0, 12)
  SP.over = true
  if (done.length) {
    addSession({ k: 'speak', m: 'speak', title: SP.blind ? '口說練習（不看字）' : '口說練習', s: avg, n: done.length, weak, ts: Date.now(), d: S.profile.id })
    save()
    checkBadges()
  }
  const low = done.filter((x) => x.r.best < 85).map((x) => x.s)
  Sync.presence({ view: 'home' })
  setView(
    `<div class="page narrow speak-sum">
      ${header('口說練習', done.length ? `念了 ${done.length} 句` : '這一回沒有念任何一句', '', false)}
      <section class="card sp-sum-head"><div class="sp-score ${avg >= 85 ? 'ok' : avg >= 65 ? 'care' : 'bad'}"><b>${avg}</b><span>分</span></div><div class="sp-res-t"><div class="sp-msg">${avg >= 85 ? '發音很清楚！' : avg >= 65 ? '很不錯，再練幾個字就更好' : '多聽幾次，跟著節奏念'}</div>${weak.length ? `<div class="sp-heard">要再練的字（點一下聽）</div><div class="chips">${weak.map((w) => `<button class="chip say" data-say="${esc(w)}">${esc(w)} ${ICON.speaker}</button>`).join('')}</div>` : ''}</div></section>
      <div class="list sp-sum-list">${done.map((x) => `<div class="row static"><span class="row-t" lang="en">${speakWordsHTML(x.r.words)}</span><span class="row-r">${x.r.best} 分</span></div>`).join('')}</div>
      <div class="sheet-actions">${low.length ? `<button class="btn ghost" data-act="low">再練分數低的 ${low.length} 句</button>` : ''}<button class="btn ghost" data-act="again">再練一回</button><button class="btn primary" data-act="home">回首頁</button></div>
    </div>`,
  )
  $('.speak-sum').addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act
    if (a === 'home') go('#/')
    if (a === 'again') {
      SP = { list: shuffle(speakPool(SP.unit)).slice(0, 8), i: 0, res: [], unit: SP.unit, blind: SP.blind, peek: [], played: [] }
      speakRun()
    }
    if (a === 'low') {
      SP = { list: low, i: 0, res: [], unit: SP.unit, blind: SP.blind, peek: [], played: [] }
      speakRun()
    }
  })
}

// ───────────────────────── 即時同步（Firebase Realtime Database：REST 寫入＋EventSource 串流） ─────────────────────────
// 老師後台：一個隱藏的「班級」，裡面每個學生各自獨立（a/<學生>、s/<學生>、live/<學生>）
// 學生、家長用 QR Code、連結或 6 碼代碼加入；家長只看得到自己的孩子；老師的裝置（管理裝置）看得到全部
// 每台裝置在背景用 Firebase 匿名登入拿一張識別證（不用帳號）；資料庫規則（database.rules.json）只讓名單上的裝置讀寫
const SYNC_DB = 'https://g7-english-review-default-rtdb.asia-southeast1.firebasedatabase.app'
const AUTH_KEY = 'AIzaSyBnoANfTAai_y9C4yyBUKxZwOXByBEbTT4' // Firebase 網頁 API 金鑰（匿名登入用；本來就是公開的，安全靠資料庫規則）
const lsGet = (k) => {
  try {
    return localStorage.getItem(k) || ''
  } catch {
    return ''
  }
}
const dbBase = () => (lsGet('g7review:db') || SYNC_DB).replace(/\/+$/, '')
const ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789' // 沒有 0／o、1／l／i，念、抄都不會看錯
const randStr = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => ALPHA[b % 31]).join('')
const newCode = () => randStr(20)
const newSid = () => randStr(10)
const fmtShort = (k) => String(k || '').toUpperCase().replace(/^(...)(...)$/, '$1 $2')
const deviceKind = () => {
  const u = navigator.userAgent
  if (/iPhone/.test(u)) return 'iPhone'
  if (/iPad/.test(u) || (/Macintosh/.test(u) && navigator.maxTouchPoints > 1)) return 'iPad'
  if (/Android/.test(u)) return /Mobile/.test(u) ? 'Android 手機' : 'Android 平板'
  if (/Macintosh/.test(u)) return 'Mac'
  if (/Windows/.test(u)) return 'Windows 電腦'
  return '其他裝置'
}

// 匿名識別證：第一次自動申請，之後用 refresh token 換新（每小時過期）
const Auth = {
  data: null,
  pending: null,
  key: () => lsGet('g7review:authkey') || AUTH_KEY,
  ok() {
    return !!this.key()
  },
  load() {
    try {
      this.data = JSON.parse(lsGet('g7review:auth') || 'null')
    } catch {
      this.data = null
    }
  },
  store() {
    try {
      localStorage.setItem('g7review:auth', JSON.stringify(this.data))
    } catch {}
  },
  uid() {
    if (!this.data) this.load()
    return this.data?.uid || ''
  },
  async token() {
    if (!this.ok()) return ''
    if (!this.data) this.load()
    if (this.data?.it && this.data.exp > Date.now() + 120000) return this.data.it
    if (this.pending) return this.pending
    const base = lsGet('g7review:authurl')
    this.pending = (async () => {
      try {
        if (this.data?.rt) {
          const r = await fetch(`${base || 'https://securetoken.googleapis.com'}/v1/token?key=${this.key()}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(this.data.rt)}`,
          })
          if (r.ok) {
            const j = await r.json()
            this.data = { uid: j.user_id, rt: j.refresh_token, it: j.id_token, exp: Date.now() + (+j.expires_in || 3600) * 1000 }
            this.store()
            return this.data.it
          }
          if (r.status !== 400) throw new Error('refresh ' + r.status) // 網路問題：不要換新身分
        }
        const r = await fetch(`${base || 'https://identitytoolkit.googleapis.com'}/v1/accounts:signUp?key=${this.key()}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ returnSecureToken: true }),
        })
        if (!r.ok) throw new Error('signup ' + r.status)
        const j = await r.json()
        this.data = { uid: j.localId, rt: j.refreshToken, it: j.idToken, exp: Date.now() + (+j.expiresIn || 3600) * 1000 }
        this.store()
        return this.data.it
      } finally {
        this.pending = null
      }
    })()
    return this.pending
  },
}

// 串流事件套到本機的資料：put 取代、patch 合併（null 代表刪除）
function applyAt(root, segs, data, ev) {
  if (!segs.length) {
    if (ev !== 'patch') return data
    const o = root && typeof root === 'object' ? root : {}
    for (const [k, v] of Object.entries(data || {})) v == null ? delete o[k] : (o[k] = v)
    return o
  }
  const o = root && typeof root === 'object' ? root : {}
  const [k, ...rest] = segs
  const v = applyAt(o[k], rest, data, ev)
  if (v == null) delete o[k]
  else o[k] = v
  return o
}

const Sync = {
  status: 'off', // 連線：off | connecting | on | error
  state: 'off', // 身分：off | owner | member | wait（等管理裝置更新）| closed（暫停加入）| removed（被移出）| invalid（連結失效）
  admin: false,
  es: [],
  keys: null,
  timer: 0,
  flushing: false,
  D: {}, // 管理裝置：整個班級的資料（students、members、a、s、live…）
  live: {}, // 學生、家長：自己這個學生的即時狀態（裝置 → 狀態）
  stu: null, // 學生、家長：自己這個學生的資料（名字）
  loaded: false,
  ver: 0,
  cache: {},
  last: null,
  code: () => S.sync?.code || '',
  sid: () => ACTIVE || S.sync?.sid || '',
  paired: () => !!(dbBase() && S.sync?.code),
  ready() {
    return this.paired() && (this.state === 'owner' || this.state === 'member')
  },
  isAdmin() {
    return this.state === 'owner' || (this.state === 'member' && this.admin)
  },
  get members() {
    return this.D.members || {}
  },
  get blocked() {
    return this.D.blocked || {}
  },
  get students() {
    return this.D.students || {}
  },
  get open() {
    return this.D.open !== false
  },
  akey: (a) => `${a.ts}-${a.q}-${a.d}`.replace(/[.#$[\]/]/g, '_'),
  skey: (s) => `${s.ts}-${s.k}-${s.d}`.replace(/[.#$[\]/:]/g, '_'),
  // top：路徑不在班級底下（例如 codes/<代碼>）
  async url(path, top = false) {
    const t = await Auth.token()
    return `${dbBase()}/${top ? path : `classes/${this.code()}${path ? '/' + path : ''}`}.json${t ? '?auth=' + encodeURIComponent(t) : ''}`
  },
  async req(method, path, body, top = false) {
    const r = await fetch(await this.url(path, top), { method, body: body === undefined ? undefined : JSON.stringify(body) })
    if (!r.ok) {
      const e = new Error('HTTP ' + r.status)
      e.status = r.status
      throw e
    }
    return r.json()
  },
  setStatus(s) {
    this.status = s
    $$('.sync-dot').forEach((d) => (d.dataset.s = s))
  },
  setState(s) {
    if (this.state === s) return
    this.state = s
    onSyncChange('state')
  },
  // 自己的作答＆練習紀錄：排進佇列（沒網路或還沒加入時先存著，之後一次送出）
  queue(kind, obj) {
    if (!this.paired() || !obj || obj.d !== S.profile.id) return
    if (myRole() !== 'student') return // 老師、家長自己按的題目不同步（上課模式算學生）
    if (kind === 'a') this.keys?.add(this.akey(obj))
    ;(S.syncQ ||= []).push([kind, obj, this.sid()])
    save()
    this.flushSoon()
  },
  flushSoon(ms = 300) {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => this.flush(), ms)
  },
  async flush() {
    if (!this.ready() || !S.syncQ?.length || this.flushing || navigator.onLine === false) return
    const def = this.sid()
    this.flushing = true
    const batch = S.syncQ.slice(0, 300)
    const by = {}
    for (const [k, o, sid] of batch) {
      const s = sid || def
      if (!s || !o) continue // 沒有學生可以歸的紀錄（例如舊版老師平板自己的練習）：不上傳
      const g = (by[`${k === 'a' ? 'a' : 's'}/${s}`] ||= {})
      g[k === 'a' ? this.akey(o) : this.skey(o)] = o
    }
    try {
      for (const [path, body] of Object.entries(by)) await this.req('PATCH', path, body)
      S.syncQ.splice(0, batch.length)
      save()
      if (this.status !== 'on' && this.es.length) this.setStatus('on')
      if (!S.syncQ.length && S.sync?.backfill) {
        const n = S.sync.backfill
        delete S.sync.backfill
        save()
        toast(`已把之前的 ${n} 筆作答同步上去`, '☁️')
      }
    } catch (e) {
      this.setStatus('error')
      if (e.status === 401 || e.status === 403) this.recheck()
      else this.flushSoon(15000)
    }
    this.flushing = false
    if (S.syncQ.length && this.ready()) this.flushSoon(1000)
  },
  // 現在在做什麼（老師、家長的「即時作答」會顯示）
  presence(info) {
    if (info.view !== 'away') this.last = info
    const sid = this.sid()
    if (!this.ready() || !sid || (myRole() === 'teacher' && !ACTIVE)) return
    const body = { ...info, dev: ACTIVE ? '老師的裝置' : S.profile.device || '未命名裝置', kind: deviceKind(), name: S.profile.name || '', role: myRole(), ts: Date.now() }
    this.url(`live/${sid}/${S.profile.id}`)
      .then((u) => fetch(u, { method: 'PUT', body: JSON.stringify(body), keepalive: true }))
      .catch(() => {})
  },
  // 開始：確認這台的身分（管理裝置／成員），不在名單上就自動加入
  async start() {
    this.stop()
    if (!this.paired()) return this.setState('off')
    if (!Auth.ok()) {
      this.setStatus('error')
      return this.setState('off')
    }
    this.setStatus('connecting')
    try {
      await Auth.token()
      const uid = Auth.uid()
      if (S.sync.owner) {
        const o = await this.req('GET', 'owner')
        if (!o) {
          await this.req('PUT', 'owner', uid)
          await this.req('PUT', 'open', true)
          await this.req('PUT', 'tkey', newCode())
        } else if (o !== uid) {
          S.sync.owner = false
          save()
        }
        if (S.sync.owner) {
          this.admin = true
          this.setState('owner')
          return this.startData()
        }
      }
      const m = await this.req('GET', 'members/' + uid)
      if (m) {
        this.admin = !!m.admin
        S.sync.member = true
        delete S.sync.removed
        if (m.sid && m.role !== 'teacher') S.sync.sid = m.sid
        save()
        if (this.admin || (m.role !== 'teacher' && m.sid)) {
          this.setState('member')
          return this.startData()
        }
        // 名單上有這台，但還不能看資料（舊版加入的裝置：等管理裝置把它歸到學生）
        this.setStatus('off')
        this.setState('wait')
        await this.listenSelf()
        return this.retry(60000)
      }
      // 以前在名單上、現在不在了＝被移出；不要自己加回去（要使用者按「再試一次」）
      if (S.sync.member || S.sync.removed) {
        S.sync.member = false
        S.sync.removed = true
        save()
        return this.fail(S.sync.fail || 'removed')
      }
      await this.join()
    } catch {
      this.setStatus('error')
      this.retry(20000)
    }
  },
  fail(st) {
    this.setStatus('off')
    this.setState(st)
  },
  // 加入：把這台寫進名單（學生、家長要帶學生代號；老師要帶老師連結裡的鑰匙）
  async join() {
    const role = S.sync.role || 'student'
    const body = { role, name: S.profile.name || '', dev: deviceKind(), pid: S.profile.id, at: Date.now() }
    if (role === 'teacher') {
      if (!S.sync.tkey) return this.fail('invalid')
      Object.assign(body, { key: S.sync.tkey, admin: true })
    } else {
      if (!S.sync.sid)
        try {
          S.sync.sid = (await this.req('GET', 'legacy')) || '' // 2.1 以前的連結沒有學生代號
        } catch {}
      if (!S.sync.sid) {
        // 舊連結、老師的平板還沒更新到 2.1（還沒把紀錄搬到學生）：等一下自動再試，這段時間的作答先存在這台
        this.fail('wait')
        return this.retry(60000)
      }
      body.sid = S.sync.sid
    }
    try {
      await this.req('PUT', 'members/' + Auth.uid(), body)
      this.admin = role === 'teacher'
      S.sync.member = true
      delete S.sync.removed
      delete S.sync.fail
      save()
      this.setState('member')
      return this.startData()
    } catch (e) {
      if (e.status !== 401 && e.status !== 403) {
        this.setStatus('error')
        return this.retry(20000)
      }
      // 同時送了兩次（例如連點）：其實已經在名單上了
      try {
        if (await this.req('GET', 'members/' + Auth.uid())) {
          S.sync.member = true
          save()
          return this.recheck()
        }
      } catch {}
      let open = true
      try {
        open = (await this.req('GET', 'open')) === true
      } catch {}
      if (!open && role !== 'teacher') {
        this.fail('closed')
        return this.retry(60000) // 暫停加入：之後再自動試試看
      }
      S.sync.removed = true
      S.sync.fail = 'invalid'
      save()
      this.fail('invalid')
    }
  },
  async listen(path, fn) {
    const es = new EventSource(await this.url(path))
    const on = (ev) => (e) => {
      try {
        const { path: p, data } = JSON.parse(e.data)
        fn(p, data, ev)
      } catch {}
    }
    es.addEventListener('put', on('put'))
    es.addEventListener('patch', on('patch'))
    es.addEventListener('open', () => this.state !== 'wait' && this.setStatus('on'))
    es.addEventListener('cancel', () => {
      es.close()
      this.recheck()
    })
    es.onerror = () => this.setStatus('error')
    this.es.push(es)
  },
  // 一般成員：盯著自己在名單上的那一筆（被移出、被設為可管理、被歸到學生時馬上重新確認）
  async listenSelf() {
    let first = true
    await this.listen('members/' + Auth.uid(), (p) => {
      if (first && p === '/') return (first = false)
      if (p === '/' || p === '/admin' || p === '/sid') this.recheck()
    })
  },
  // 瀏覽器對同一個網站最多同時開 6 條連線：管理裝置只開 1 條（整個班級），學生、家長開 4 條
  async startData() {
    this.keys = new Set(S.attempts.map((a) => this.akey(a)))
    this.loaded = false
    try {
      if (this.isAdmin()) await this.listen('', (p, d, ev) => this.mergeAll(p, d, ev))
      else {
        const sid = this.sid()
        await this.listen('a/' + sid, (p, d) => this.mergeAttempts(p, d))
        await this.listen('s/' + sid, (p, d) => this.mergeSessions(p, d))
        await this.listen('live/' + sid, (p, d, ev) => {
          this.live = applyAt(this.live, p.split('/').filter(Boolean), d, ev) || {}
          onSyncChange('live')
        })
        await this.listenSelf()
        this.fetchHw()
        this.req('GET', 'students/' + sid)
          .then((st) => {
            this.stu = st
            if (st?.name && myRole() === 'student' && !S.profile.name) {
              S.profile.name = st.name
              save()
            }
            onSyncChange('members')
          })
          .catch(() => {})
      }
    } catch {
      this.setStatus('error')
      return this.retry(20000)
    }
    this.flushSoon(50)
    if (this.last) this.presence(this.last)
    this.retry(50 * 60000) // 識別證一小時過期：快到了就重新開始
  },
  recheck() {
    clearTimeout(this.rc)
    this.rc = setTimeout(() => this.start(), 600)
  },
  retry(ms) {
    clearTimeout(this.rt)
    this.rt = setTimeout(() => this.start(), ms)
  },
  stop() {
    this.es.forEach((e) => e.close())
    this.es = []
    clearTimeout(this.rt)
    clearTimeout(this.rc)
    this.setStatus('off')
  },
  rows(p, data) {
    if (!data) return []
    const seg = p.split('/').filter(Boolean)
    if (!seg.length) return Object.entries(data)
    if (seg.length === 1) return [[seg[0], data]]
    return []
  },
  // 管理裝置：整個班級的串流
  mergeAll(p, data, ev) {
    const seg = p.split('/').filter(Boolean)
    const before = this.loaded ? new Set(Object.keys(this.members)) : null
    this.D = applyAt(this.D, seg, data, ev) || {}
    this.ver++
    this.loaded = true
    const top = seg[0] || ''
    if (before)
      for (const [uid, m] of Object.entries(this.members)) {
        if (before.has(uid) || uid === Auth.uid() || !m) continue
        const nm = this.students[m.sid]?.name
        toast(`新成員加入：${ROLES[m.role] || '成員'}${nm ? `（${nm}）` : ''}・${m.dev || '裝置'}`, ROLE_IC[m.role] || '👋')
      }
    // 上課模式：把這個學生在其他裝置的紀錄也合併進這台
    if (ACTIVE && (!top || top === 'a')) this.mergeAttempts('/', this.D.a?.[ACTIVE])
    if (ACTIVE && (!top || top === 's')) this.mergeSessions('/', this.D.s?.[ACTIVE])
    if (!top || ['a', 's', 'members', 'tkey'].includes(top)) this.migrateSoon()
    if (!top || top === 's' || top === 'hw' || top === 'a') hwNotify(!top)
    onSyncChange(!top ? 'all' : top === 'a' || top === 's' ? 'a' : top === 'live' ? 'live' : 'members')
  },
  attemptsOf(sid) {
    const c = this.cache['a' + sid]
    if (c && c.ver === this.ver) return c.list
    const list = Object.values(this.D.a?.[sid] || {})
      .filter((a) => a && typeof a.q === 'string' && a.ts)
      .sort((x, y) => x.ts - y.ts)
    this.cache['a' + sid] = { ver: this.ver, list }
    return list
  },
  sessionsOf(sid) {
    return Object.values(this.D.s?.[sid] || {})
      .filter((s) => s && s.ts)
      .sort((x, y) => x.ts - y.ts)
  },
  // 2.1 以前只有一個學生，紀錄直接放在 a／s 底下：由建立後台的裝置搬進「學生」
  migrateSoon() {
    if (this.state !== 'owner') return
    clearTimeout(this.mt)
    this.mt = setTimeout(() => this.migrate(), 800)
  },
  async migrate() {
    if (this.migrating || this.state !== 'owner') return
    this.migrating = true
    try {
      const D = this.D
      if (!D.tkey) await this.req('PUT', 'tkey', newCode())
      const flatA = Object.entries(D.a || {}).filter(([, v]) => v && typeof v.q === 'string')
      const flatS = Object.entries(D.s || {}).filter(([, v]) => v && typeof v.k === 'string')
      const flatL = Object.entries(D.live || {}).filter(([, v]) => v && v.ts)
      const noSid = Object.entries(D.members || {}).filter(([, m]) => m && m.role !== 'teacher' && !m.sid)
      const oldT = Object.entries(D.members || {}).filter(([, m]) => m && m.role === 'teacher' && m.admin === undefined)
      if (!flatA.length && !flatS.length && !flatL.length && !noSid.length && !oldT.length) return
      let sid = D.legacy
      // 舊班級（有平放的紀錄、舊成員，或只有舊版的上線狀態）：建立一個學生，舊連結（沒有學生代號）就歸到他
      if (!sid && (flatA.length || flatS.length || noSid.length || flatL.length)) {
        const name = noSid.find(([, m]) => m.role === 'student' && m.name)?.[1].name || flatL.map(([, l]) => l).find((l) => (l.role || 'student') === 'student' && l.name)?.name || '學生'
        sid = newSid()
        await this.req('PUT', 'students/' + sid, { name: name.slice(0, 20), at: Date.now() })
        await this.req('PUT', 'legacy', sid)
      }
      if (sid && flatA.length) {
        await this.req('PATCH', 'a/' + sid, Object.fromEntries(flatA))
        await this.req('PATCH', 'a', Object.fromEntries(flatA.map(([k]) => [k, null])))
      }
      if (sid && flatS.length) {
        await this.req('PATCH', 's/' + sid, Object.fromEntries(flatS))
        await this.req('PATCH', 's', Object.fromEntries(flatS.map(([k]) => [k, null])))
      }
      if (flatL.length) await this.req('PATCH', 'live', Object.fromEntries(flatL.map(([k]) => [k, null])))
      for (const [uid] of noSid) if (sid) await this.req('PUT', `members/${uid}/sid`, sid)
      for (const [uid] of oldT) await this.req('PUT', `members/${uid}/admin`, true) // 2.0 用老師連結加入的裝置：維持看得到全部
    } catch {
      this.migrateSoon() // 規則還沒更新之類的：等下一次變動再試
    } finally {
      this.migrating = false
    }
  },
  mergeAttempts(p, data) {
    let add = 0
    let upd = 0
    for (const [k, a] of this.rows(p, data)) {
      if (!a || typeof a.q !== 'string' || !a.ts || !a.d) continue
      if (this.keys.has(k)) {
        if (a.w) {
          const mine = S.attempts.find((x) => this.akey(x) === k)
          if (mine && mine.w !== a.w) {
            mine.w = a.w
            upd++
          }
        }
        continue
      }
      this.keys.add(k)
      S.attempts.push({ q: a.q, m: a.m || '', r: ['ok', 'care', 'bad'].includes(a.r) ? a.r : 'bad', t: Array.isArray(a.t) ? a.t : [], a: String(a.a ?? ''), h: a.h || 0, c: a.c || 0, x: a.x || 'p', ts: +a.ts, d: String(a.d), ...(a.w ? { w: a.w } : {}) })
      add++
    }
    if (add) S.attempts.sort((x, y) => x.ts - y.ts)
    if (add || upd) {
      save()
      onSyncChange('a', add)
    }
  },
  mergeSessions(p, data) {
    const have = new Set(S.sessions.map((s) => this.skey(s)))
    let add = 0
    for (const [k, s] of this.rows(p, data)) {
      if (!s || !s.ts || !s.d || have.has(k)) continue
      have.add(k)
      S.sessions.push(s)
      add++
    }
    if (add) {
      S.sessions.sort((x, y) => x.ts - y.ts)
      save()
      onSyncChange('s', add)
    }
  },
  // 連結：建立老師後台（owner）或加入（學生、家長帶學生代號 sid；老師帶鑰匙 tkey）
  pair(code, role, { owner = false, sid = '', tkey = '' } = {}) {
    S.sync = { code, role, at: Date.now(), owner, ...(sid ? { sid } : {}), ...(tkey ? { tkey } : {}) }
    S.profile.role = role
    if (!S.profile.device) S.profile.device = role === 'teacher' ? '老師平板' : ROLES[role]
    // 學生：這台以前的紀錄也一起傳上去
    S.syncQ = role === 'student' ? [...S.attempts.filter((a) => a.d === S.profile.id).map((a) => ['a', a, sid]), ...S.sessions.filter((s) => s.d === S.profile.id).map((s) => ['s', s, sid])] : []
    const n = S.syncQ.filter(([k]) => k === 'a').length
    if (n) S.sync.backfill = n
    this.D = {}
    this.live = {}
    this.stu = null
    save()
    return this.start()
  },
  unpair() {
    this.presence({ view: 'away' })
    this.stop()
    delete S.sync
    S.syncQ = []
    this.D = {}
    this.live = {}
    this.stu = null
    save()
    this.setState('off')
  },
  // ── 管理裝置的操作 ──
  async remove(uid) {
    const m = this.members[uid] || {}
    await this.req('PUT', 'blocked/' + uid, { role: m.role || '', name: m.name || '', dev: m.dev || '', sid: m.sid || '', at: Date.now() })
    await this.req('DELETE', 'members/' + uid)
  },
  async unblock(uid) {
    await this.req('DELETE', 'blocked/' + uid)
  },
  async setAdmin(uid, v) {
    await this.req('PUT', `members/${uid}/admin`, !!v)
  },
  async setOpen(v) {
    await this.req('PUT', 'open', !!v)
    this.D.open = !!v
  },
  async addStudent(name) {
    const sid = newSid()
    const st = { name: name.slice(0, 20), at: Date.now() }
    await this.req('PUT', 'students/' + sid, st)
    this.D = applyAt(this.D, ['students', sid], st, 'put')
    return sid
  },
  async renameStudent(sid, name) {
    await this.req('PUT', `students/${sid}/name`, name.slice(0, 20))
  },
  // 刪除學生：這個學生的裝置都移出，紀錄、代碼一起刪掉
  async deleteStudent(sid) {
    const st = this.students[sid] || {}
    for (const [uid, m] of Object.entries(this.members)) if (m?.sid === sid) await this.req('DELETE', 'members/' + uid)
    if (st.code) await this.req('DELETE', 'codes/' + st.code, undefined, true).catch(() => {})
    for (const k of ['a', 's', 'live']) await this.req('DELETE', `${k}/${sid}`)
    await this.req('DELETE', 'students/' + sid)
  },
  // 6 碼代碼（學生、家長共用）：7 天有效，過期或按「重新產生」就換一組
  async ensureCode(sid, force = false) {
    const st = this.students[sid]
    if (!st) throw new Error('no student')
    if (!force && st.code && (st.codeExp || 0) > Date.now() + DAY) return st
    const old = st.code // 先記下來：寫入後串流會馬上把 st 改成新代碼
    for (let i = 0; i < 3; i++) {
      const k = randStr(6)
      const exp = Date.now() + 7 * DAY
      try {
        await this.req('PUT', 'codes/' + k, { c: this.code(), s: sid, exp }, true)
      } catch (e) {
        if (e.status === 401 || e.status === 403) continue // 剛好撞到別人的代碼：換一組
        throw e
      }
      await this.req('PATCH', 'students/' + sid, { code: k, codeExp: exp })
      if (old && old !== k) this.req('DELETE', 'codes/' + old, undefined, true).catch(() => {})
      this.D = applyAt(this.D, ['students', sid], { code: k, codeExp: exp }, 'patch')
      return this.students[sid]
    }
    throw new Error('code')
  },
  async resetTeacherKey() {
    await this.req('PUT', 'tkey', newCode())
  },
  // ── 作業 ──
  async addHw(sid, h) {
    const id = Date.now().toString(36)
    await this.req('PUT', `hw/${sid}/${id}`, h)
    this.D = applyAt(this.D, ['hw', sid, id], h, 'put')
    onSyncChange('members')
  },
  async delHw(sid, id) {
    await this.req('DELETE', `hw/${sid}/${id}`)
  },
  // 學生、家長：抓自己這個學生的作業（作業不常變，打開 App、回到 App 時抓一次就好，不多開一條連線）
  async fetchHw() {
    const sid = this.sid()
    if (!sid || this.isAdmin() || !this.ready()) return
    try {
      this.hw = (await this.req('GET', 'hw/' + sid)) || {}
      this.hwAt = Date.now()
      S.hwCache = this.hw
      save()
      onSyncChange('hw')
    } catch {}
  },
}
function addSession(s) {
  S.sessions.push(s)
  Sync.queue('s', s)
}
// 代碼 → 班級、學生
async function lookupCode(raw) {
  const k = String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
  if (k.length !== 6) return { err: '代碼是 6 個英文字母或數字' }
  try {
    const d = await Sync.req('GET', 'codes/' + k, undefined, true)
    if (!d || !d.c || !d.s) return { err: '找不到這個代碼，請再確認一次' }
    if (d.exp < Date.now()) return { err: '這個代碼已經過期了，請老師重新產生' }
    return d
  } catch {
    return { err: '現在連不上，請檢查網路再試一次' }
  }
}
// 這台是老師後台（建立後台或用老師連結加入），而且不在上課模式
const teacherMode = () => !ACTIVE && !!S.sync?.code && myRole() === 'teacher'
// 管理裝置：還沒看過的新成員（首頁通知、設定分頁的紅點）
function newMembers() {
  if (!Sync.isAdmin() || ACTIVE) return []
  const seen = S.sync?.seenAt || S.sync?.at || 0
  return Object.entries(Sync.members).filter(([uid, m]) => m && uid !== Auth.uid() && (m.at || 0) > seen)
}
const pendingCount = () => newMembers().length
// 同步收到新資料或身分改變：在相關畫面上就地更新
let syncRedraw = 0
let syncKinds = new Set() // 250 毫秒內收到的變動種類都要記住（不能只留最後一個）
function onSyncChange(k) {
  syncKinds.add(k)
  clearTimeout(syncRedraw)
  syncRedraw = setTimeout(() => {
    const ks = syncKinds
    syncKinds = new Set()
    const kind = ks.has('state') ? 'state' : ks.has('all') ? 'all' : ks.has('members') ? 'members' : ks.has('a') || ks.has('s') ? 'a' : [...ks][0]
    const h = location.hash || '#/'
    const tb = $('.tabbar a[href="#/settings"]')
    if (tb) {
      const n = pendingCount()
      const bd = $('.badge', tb)
      if (n && !bd) tb.insertAdjacentHTML('beforeend', `<b class="badge">${n}</b>`)
      else if (n) bd.textContent = n
      else bd?.remove()
    }
    const sh = $('.join-status')
    if (sh) sh.innerHTML = joinStatusHTML()
    // 「暫停加入」的說明還開著，結果加入成功了：收起來
    if (kind === 'state' && Sync.ready() && $('.sheet .join-status')) {
      closeSheet()
      toast('加入完成！', '✅')
    } else if (sheetClose) {
      // 上面有開著的視窗：只更新設定頁的同步區塊，不要整頁重畫（會把視窗關掉）
      const sec = h === '#/settings' && $('#sync-sec')
      if (sec && (kind === 'state' || kind === 'members' || kind === 'all')) sec.innerHTML = syncSettingsHTML(myRole())
      return
    }
    const any = kind === 'state' || kind === 'all'
    if (h === '#/live') return viewLive(true)
    if (h === '#/students') return viewStudents(true)
    if (h.startsWith('#/student/')) return viewStudent(h.split('/')[2], true)
    if (h.startsWith('#/watch/')) return kind === 'members' ? undefined : viewWatch(h.split('/')[2], true)
    // 成員管理：只在名單變動時重畫（避免按鈕在手指下被換掉）
    if (h === '#/manage') return kind === 'members' || any ? viewManage(true) : undefined
    if (h === '#/settings' && (kind === 'members' || any)) return viewSettings()
    if ((kind === 'a' || kind === 's' || any) && (h === '#/stats' || h === '#/book')) return route(true)
    if (h === '#/' || h === '') {
      const b = $('.live-banner')
      if (b) b.outerHTML = liveBannerHTML() || '<div class="live-banner" hidden></div>'
      const c = $('.stu-card')
      if (c) c.outerHTML = studentsCardHTML() || '<div class="stu-card" hidden></div>'
      const hc = $('.hw-card')
      if (hc) hc.outerHTML = hwCardHTML(myRole() === 'parent') || '<section class="hw-card" hidden></section>'
      if (kind === 'a' || kind === 'all') hwCelebrate()
    }
  }, 250)
}
const agoText = (ts) => {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000))
  return s < 60 ? '剛剛' : s < 3600 ? `${Math.floor(s / 60)} 分鐘前` : s < 86400 ? `${Math.floor(s / 3600)} 小時前` : fmtTime(ts)
}
function liveText(l) {
  if (!l) return '還沒有上線'
  const fresh = Date.now() - l.ts < 10 * 60000
  const where = l.dev === '老師的裝置' || l.dev === '上課平板' ? '（在老師的裝置上）' : ''
  if (l.view === 'run' && fresh) return `正在做：${l.title}・第 ${l.n}／${l.of} 題${where}`
  if (l.view === 'exam' && fresh) return `正在寫模擬段考${where}`
  if (l.view === 'flash' && fresh) return `正在玩閃電挑戰${where}`
  if (l.view === 'speak' && fresh) return `正在練口說・第 ${l.n}／${l.of} 句${where}`
  if (l.view === 'away' || !fresh) return `離開 App（${agoText(l.ts)}）`
  return `在 App 裡${where}（${agoText(l.ts)}）`
}
const isActive = (l) => !!l && l.view !== 'away' && Date.now() - l.ts < 10 * 60000
// 身分：學生的裝置會被「看」；老師、家長的裝置是用來看學生的
const ROLES = { student: '學生', teacher: '老師', parent: '家長' }
const ROLE_IC = { student: '🎒', teacher: '📚', parent: '👪' }
const myRole = () => (ACTIVE ? 'student' : S.sync?.role || S.profile.role || 'student')
// 學生、家長：同一個學生的其他裝置
function studentsLive() {
  return Object.entries(Sync.live || {}).filter(([id, l]) => id !== S.profile.id && l && (l.role || 'student') === 'student')
}
// 管理裝置：某個學生最近的狀態
function latestLive(sid) {
  return Object.values(Sync.D.live?.[sid] || {})
    .filter((l) => l && (l.role || 'student') === 'student')
    .sort((a, b) => b.ts - a.ts)[0]
}
const studentIds = () =>
  Object.entries(Sync.students)
    .filter(([, s]) => s)
    .sort((a, b) => (a[1].at || 0) - (b[1].at || 0))
    .map(([sid]) => sid)
// 首頁橫幅：新成員加入（管理裝置）＞ 學生正在練習
function liveBannerHTML() {
  const nm = newMembers()
  if (nm.length) {
    const m = nm[nm.length - 1][1]
    const sn = Sync.students[m.sid]?.name
    return `<button class="live-banner card req" data-go="#/manage"><span class="req-ic">🔔</span><span class="lb-t"><b>新成員加入</b>　${esc(`${ROLES[m.role] || '成員'}${sn ? `（${sn}）` : ''}・${m.dev || '裝置'}`)}${nm.length > 1 ? ` 等 ${nm.length} 位` : ''}</span><span class="lb-go">查看 ${ICON.chev}</span></button>`
  }
  if (!Sync.ready() || myRole() === 'student') return ''
  if (Sync.isAdmin()) {
    const act = studentIds()
      .map((sid) => [sid, latestLive(sid)])
      .filter(([, l]) => isActive(l))
      .sort((a, b) => b[1].ts - a[1].ts)
    if (!act.length) return ''
    const [sid, l] = act[0]
    return `<button class="live-banner card" data-stu="${sid}"><span class="live-pulse"></span><span class="lb-t"><b>${esc(Sync.students[sid]?.name || '學生')}</b>　${esc(liveText(l))}</span><span class="lb-go">看即時作答 ${ICON.chev}</span></button>`
  }
  const act = studentsLive().filter(([, l]) => isActive(l))
  if (!act.length) return ''
  const [, l] = act.sort((a, b) => b[1].ts - a[1].ts)[0]
  return `<button class="live-banner card" data-go="#/live"><span class="live-pulse"></span><span class="lb-t"><b>${esc(Sync.stu?.name || l.name || l.dev)}</b>　${esc(liveText(l))}</span><span class="lb-go">看即時作答 ${ICON.chev}</span></button>`
}
// 老師後台：學生列表的一列
function stuRowHTML(sid) {
  const st = Sync.students[sid] || {}
  const list = Sync.attemptsOf(sid)
  const t0 = dayStart()
  const today = list.filter((a) => a.ts >= t0)
  const ok = today.filter((a) => a.r === 'ok').length
  const l = latestLive(sid)
  const last = list[list.length - 1]
  // 最新一份還沒做完的作業
  const hw = hwOf(sid)
    .map(([, h]) => hwStatus(h, Sync.sessionsOf(sid), list))
    .find((x) => !x.all)
  return `<button class="row stu-row" data-stu="${sid}"><span class="ld-dot${isActive(l) ? ' on' : ''}"></span><span class="row-t"><b>${esc(st.name || '學生')}</b><small>${esc(isActive(l) ? liveText(l) : last ? `最後練習：${agoText(last.ts)}` : '還沒有練習紀錄')}${hw ? `・作業 ${hw.done}／${hw.total}` : ''}</small></span><span class="row-r">${today.length ? `今天 ${today.length} 題・對 ${Math.round((ok / today.length) * 100)}%` : ''}</span>${ICON.chev}</button>`
}
function studentsCardHTML() {
  if (!teacherMode()) return ''
  const ids = studentIds()
  return `<section class="card stu-card"><div class="sec-h"><div><h2>學生</h2><p>${!Sync.loaded ? '載入中…' : ids.length ? `${ids.length} 位・點一位看即時作答` : '還沒有學生'}</p></div><button class="link" data-go="#/students">全部</button></div>
    ${ids.length ? `<div class="list flat">${ids.slice(0, 6).map(stuRowHTML).join('')}</div>` : Sync.loaded ? '<button class="btn primary" data-go="#/students">新增第一個學生</button>' : ''}</section>`
}
// 沒辦法加入時的說明
function joinStatusHTML() {
  const st = Sync.state
  const stu = myRole() === 'student'
  if (st === 'closed') return `<div class="js-ic">🔒</div><h2>目前暫停加入</h2><p class="muted">請跟老師說一聲。開放加入之後會自動加入，不用再點一次連結。</p><button class="btn primary" data-rejoin>現在再試一次</button>`
  if (st === 'removed') return `<div class="js-ic">🚫</div><h2>已經被移出</h2><p class="muted">如果是誤會，請跟老師說一聲；老師允許之後，再按下面的按鈕就能重新加入。</p><button class="btn primary" data-rejoin>再試一次</button>`
  if (st === 'invalid') return `<div class="js-ic">⚠️</div><h2>沒辦法加入</h2><p class="muted">這個連結可能已經失效，或已經被移出。請跟老師要新的連結或代碼。</p><button class="btn primary" data-rejoin>再試一次</button>`
  if (st === 'wait') return `<div class="js-ic">⏳</div><h2>正在更新</h2><p class="muted">老師那邊打開 App 之後就會完成，不用做任何事。</p>`
  if (st === 'member' || st === 'owner') return `<div class="js-ic">✅</div><h2>已加入</h2><p class="muted">${stu ? '你做的題目，老師都會即時看到。' : '可以在這裡即時看到學生的練習。'}</p>`
  return `<div class="js-ic">📡</div><h2>連線中…</h2><p class="muted">網路不穩時會自動重試。</p>`
}
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-rejoin]')) {
    if (S.sync) {
      delete S.sync.removed
      delete S.sync.fail
      S.sync.member = false
      save()
    }
    Sync.start()
    toast('再試一次…', '📨')
  }
  const s = e.target.closest('[data-stu]')
  if (s) go('#/student/' + s.dataset.stu)
  if (e.target.closest('[data-endclass]')) endClass()
})

// 一個學生的作答紀錄（即時更新；點一題看完整題目與解析）
function feedHTML(list) {
  const feed = list.slice(-40).reverse()
  return feed.length
    ? `<div class="list flat live-feed">${feed
        .map((a) => {
          const it = ITEM[a.q]
          if (!it) return ''
          return `<button class="row live-row" data-att="${esc(Sync.akey(a))}"><span class="lr-r ${a.r}">${a.r === 'ok' ? ICON.check : a.r === 'care' ? '!' : ICON.x}</span><span class="row-t"><span class="lr-q">${esc(snippet(it))}</span><small>${esc(a.a || '（空白）')}${a.w ? `・自評：${WHY_ME.find((w) => w[0] === a.w)?.[1] || ''}` : ''}${a.c ? '・有點猜' : ''}${a.h ? `・看了 ${a.h} 個提示` : ''}</small></span><span class="row-r">${new Date(a.ts).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}</span>${ICON.chev}</button>`
        })
        .join('')}</div>`
    : '<p class="muted pad">還沒有作答紀錄。</p>'
}
function feedClick(e, list) {
  const r = e.target.closest('[data-att]')
  if (!r) return
  const a = list.find((x) => Sync.akey(x) === r.dataset.att)
  if (!a) return
  const b = sheet(`<h2 class="sheet-title">學生的作答</h2><p class="sheet-p">${esc(fmtTime(a.ts))}</p><div class="review-slot"></div>`, { wide: true })
  $('.review-slot', b).append(reviewCard(ITEM[a.q], a, '學生的答案'))
}
const syncPill = () => `<span class="sync-pill"><i class="sync-dot" data-s="${Sync.status}"></i>${{ on: '已連線', connecting: '連線中', error: '重新連線中', off: '未連線' }[Sync.status] || ''}</span>`

// 家長（和學生的其他裝置）：這個學生正在做哪一題、每一題答了什麼
function viewLive(keepScroll = false) {
  if (teacherMode()) return viewStudents(keepScroll)
  const y = window.scrollY
  if (!Sync.ready()) {
    setView(
      `<div class="page narrow">${header('即時作答', '', '', true)}
      ${
        Sync.paired()
          ? `<div class="empty card join-status">${joinStatusHTML()}</div>`
          : `<div class="empty card"><div class="empty-ic">📡</div><h2>還沒有連結老師</h2><p class="muted">點老師傳來的連結、掃 QR Code，或到「設定」輸入代碼，就能在這裡即時看到孩子的練習。</p><button class="btn primary" data-go="#/settings">去設定</button></div>`
      }</div>`,
    )
    $('.page').addEventListener('click', (e) => e.target.closest('[data-go]') && go(e.target.closest('[data-go]').dataset.go))
    if (keepScroll) window.scrollTo(0, y)
    return
  }
  const t0 = dayStart()
  const list = S.attempts
  const today = list.filter((a) => a.ts >= t0)
  const ok = today.filter((a) => a.r === 'ok').length
  const care = today.filter((a) => a.r === 'care').length
  const l = studentsLive().sort((a, b) => b[1].ts - a[1].ts)[0]?.[1]
  const name = Sync.stu?.name || l?.name || '學生'
  setView(
    `<div class="page narrow live-page">
      ${header('即時作答', '每答一題，這裡幾秒內就會更新。點一題可以看完整題目與解析。', syncPill(), true)}
      ${hwCardHTML(true)}
      <section class="card live-dev">
        <div class="ld-head"><span class="ld-dot${isActive(l) ? ' on' : ''}"></span><div class="ld-who"><b>${esc(name)}</b><span>${esc(liveText(l))}</span></div>
          <div class="ld-today"><b>${today.length}</b> 題<span>今天・對 ${ok}${care ? `・粗心 ${care}` : ''}</span></div></div>
        ${feedHTML(list)}
      </section>
      ${selfRecHTML(list, S.sessions)}
    </div>`,
  )
  if (keepScroll) window.scrollTo(0, y)
  $('.live-page').addEventListener('click', (e) => feedClick(e, list))
}

// 老師後台：學生列表
function viewStudents(keepScroll = false) {
  const y = window.scrollY
  if (!Sync.isAdmin()) {
    if (teacherMode()) setView(`<div class="page narrow">${header('學生', '', '', false)}<div class="empty card join-status">${joinStatusHTML()}</div></div>`)
    else go('#/settings')
    return
  }
  const ids = studentIds()
  setView(
    `<div class="page narrow stu-page">
      ${header('學生', '每個學生各自獨立：學生和家長只看得到自己的紀錄。', syncPill())}
      ${ids.length ? `<div class="list stu-list">${ids.map(stuRowHTML).join('')}</div>` : `<div class="empty card"><div class="empty-ic">🎒</div><h2>${Sync.loaded ? '還沒有學生' : '載入中…'}</h2><p class="muted">新增學生之後，把 QR Code、連結或代碼給學生和家長，就能即時看到練習。</p></div>`}
      <div class="sheet-actions"><button class="btn primary big" data-add>＋ 新增學生</button></div>
      <div class="group"><div class="list">
        <button class="row" data-go="#/manage"><span class="row-ic">👥</span><span class="row-t">成員管理<small>看哪些裝置加入了、移除裝置、暫停加入</small></span>${pendingCount() ? `<b class="row-badge">${pendingCount()}</b>` : ''}${ICON.chev}</button>
      </div></div>
    </div>`,
  )
  if (keepScroll) window.scrollTo(0, y)
  $('.stu-page').addEventListener('click', (e) => {
    if (e.target.closest('[data-add]')) return addStudentSheet()
    const g = e.target.closest('[data-go]')
    if (g) go(g.dataset.go)
  })
}
function addStudentSheet() {
  const b = sheet(`<h2 class="sheet-title">新增學生</h2>
    <div class="list form"><label class="row field"><span class="row-t">暱稱<small>學生和家長會看到，可以用英文名字</small></span><input id="ns-name" placeholder="例如：Amy" maxlength="20" autocomplete="off"></label></div>
    <div class="sheet-actions"><button class="btn ghost" data-close>取消</button><button class="btn primary" data-ok>新增</button></div>`)
  const inp = $('#ns-name', b)
  setTimeout(() => inp.focus(), 300)
  const ok = async () => {
    const n = inp.value.trim()
    if (!n) return inp.focus()
    $('[data-ok]', b).disabled = true
    try {
      const sid = await Sync.addStudent(n)
      closeSheet()
      go('#/student/' + sid)
      setTimeout(() => shareStudent(sid, 'student'), 350)
    } catch {
      $('[data-ok]', b).disabled = false
      toast('沒有成功，請檢查網路再試一次', '⚠️')
    }
  }
  $('[data-ok]', b).onclick = ok
  inp.addEventListener('keydown', (e) => e.key === 'Enter' && ok())
}

// 老師後台：一個學生的詳細（即時作答、常錯的地方、跟自己比、上課、傳連結）
function viewStudent(sid, keepScroll = false) {
  if (!Sync.isAdmin()) return viewStudents()
  const st = Sync.students[sid]
  if (!st) {
    if (Sync.loaded) return go('#/students')
    return setView(`<div class="page narrow">${header('學生', '', '', true)}<div class="empty card"><div class="empty-ic">📡</div><h2>載入中…</h2></div></div>`)
  }
  const y = window.scrollY
  const list = Sync.attemptsOf(sid)
  const sess = Sync.sessionsOf(sid)
  const t0 = dayStart()
  const today = list.filter((a) => a.ts >= t0)
  const ok = today.filter((a) => a.r === 'ok').length
  const l = latestLive(sid)
  const devs = Object.values(Sync.members).filter((m) => m?.sid === sid)
  const nS = devs.filter((m) => m.role === 'student').length
  const nP = devs.filter((m) => m.role === 'parent').length
  const tc = tagCounts(list.filter((a) => a.ts >= Date.now() - 14 * DAY)).slice(0, 5)
  const max = tc[0]?.[1] || 1
  setView(
    `<div class="page narrow stu-detail">
      ${header(st.name || '學生', `學生的裝置 ${nS} 台・家長的裝置 ${nP} 台`, syncPill(), true)}
      <div class="stu-actions">
        <button class="btn primary" data-go="#/watch/${sid}">${ICON.eye}<span>課堂檢視</span></button>
        <button class="btn primary" data-assign>📌<span>派作業</span></button>
        <button class="btn ghost" data-share="student">傳給學生</button>
        <button class="btn ghost" data-share="parent">傳給家長</button>
      </div>
      ${hwTeacherHTML(sid)}
      <section class="card live-dev">
        <div class="ld-head"><span class="ld-dot${isActive(l) ? ' on' : ''}"></span><div class="ld-who"><b>即時作答</b><span>${esc(liveText(l))}</span></div>
          <div class="ld-today"><b>${today.length}</b> 題<span>今天${today.length ? `・對 ${Math.round((ok / today.length) * 100)}%` : ''}</span></div></div>
        ${feedHTML(list)}
      </section>
      ${
        tc.length
          ? `<section class="card"><div class="sec-h"><div><h2>最近兩週常錯的地方</h2><p>上課可以從這裡開始講。</p></div></div><div class="bars">${tc
              .map(([t, n]) => `<div class="bar-row static"><span class="bar-k">${TAGS[t] || t}${FORMAT_TAGS.includes(t) ? '<em>格式</em>' : ''}</span><span class="bar-track"><i style="width:${(n / max) * 100}%"></i></span><span class="bar-v">${n}</span></div>`)
              .join('')}</div></section>`
          : ''
      }
      ${selfRecHTML(list, sess)}
      <div class="group"><div class="list">
        <button class="row" data-class><span class="row-ic">📱</span><span class="row-t">學生模式<small>學生沒帶平板時，用老師的平板或手機練習；作答算在 ${esc(st.name || '這個學生')} 的紀錄</small></span>${ICON.chev}</button>
        <button class="row" data-rename><span class="row-ic">✏️</span><span class="row-t">改暱稱</span>${ICON.chev}</button>
        <button class="row" data-go="#/manage"><span class="row-ic">👥</span><span class="row-t">裝置管理<small>看這個學生、家長有哪些裝置，可以移除</small></span>${ICON.chev}</button>
        <button class="row danger" data-delstu><span class="row-t">刪除這個學生</span></button>
      </div><p class="group-f">刪除後，這個學生和家長的裝置都會被移出，雲端的練習紀錄也會刪掉（各自裝置上的紀錄還在）。</p></div>
    </div>`,
  )
  if (keepScroll) window.scrollTo(0, y)
  $('.stu-detail').addEventListener('click', (e) => {
    feedClick(e, list)
    const sh = e.target.closest('[data-share]')
    if (sh) return shareStudent(sid, sh.dataset.share)
    if (e.target.closest('[data-class]')) return enterClass(sid)
    if (e.target.closest('[data-assign]')) return assignSheet(sid)
    const dh = e.target.closest('[data-delhw]')
    if (dh)
      return confirmSheet('刪除這份作業？', '學生那邊也會看不到這份作業（已經做的練習紀錄還在）。', '刪除', async () => {
        try {
          await Sync.delHw(sid, dh.dataset.delhw)
          toast('已刪除', '🗑️')
        } catch {
          toast('沒有成功，請檢查網路再試一次', '⚠️')
        }
      }, true)
    const g = e.target.closest('[data-go]')
    if (g) return go(g.dataset.go)
    if (e.target.closest('[data-rename]')) {
      const b = sheet(`<h2 class="sheet-title">改暱稱</h2><div class="list form"><label class="row field"><span class="row-t">暱稱</span><input id="rn" value="${esc(st.name || '')}" maxlength="20" autocomplete="off"></label></div><div class="sheet-actions"><button class="btn ghost" data-close>取消</button><button class="btn primary" data-ok>儲存</button></div>`)
      $('[data-ok]', b).onclick = async () => {
        const n = $('#rn', b).value.trim()
        if (!n) return
        closeSheet()
        try {
          await Sync.renameStudent(sid, n)
        } catch {
          toast('沒有成功，請檢查網路再試一次', '⚠️')
        }
      }
    }
    if (e.target.closest('[data-delstu]'))
      confirmSheet(
        `刪除 ${st.name || '這個學生'}？`,
        '這個學生和家長的裝置都會被移出，雲端的練習紀錄也會刪掉，沒辦法復原。',
        '刪除',
        async () => {
          try {
            await Sync.deleteStudent(sid)
            toast('已刪除', '🗑️')
            go('#/students')
          } catch {
            toast('沒有成功，請檢查網路再試一次', '⚠️')
          }
        },
        true,
      )
  })
}

// 課堂檢視：學生用自己的裝置上課時，老師在自己的裝置上跟著看（現在這一題、題目、正確答案；學生一按檢查，答案和對錯馬上出現）
let WAKE = null // 螢幕保持開著
let watchFresh = ''
function viewWatch(sid, keepScroll = false) {
  if (!Sync.isAdmin()) return viewStudents()
  const st = Sync.students[sid]
  if (!st) return Sync.loaded ? go('#/students') : setView(`<div class="page narrow">${header('課堂檢視', '', '', true)}<div class="empty card"><div class="empty-ic">📡</div><h2>載入中…</h2></div></div>`)
  if (!WAKE && navigator.wakeLock && document.visibilityState === 'visible')
    navigator.wakeLock
      .request('screen')
      .then((w) => {
        WAKE = w
        w.addEventListener('release', () => (WAKE = null))
      })
      .catch(() => {})
  const y = window.scrollY
  const list = Sync.attemptsOf(sid)
  const l = latestLive(sid)
  const it = isActive(l) && l.view === 'run' && ITEM[l.q]
  // 這一題作答了沒：在「進到這一題」之後才有的作答（兩個時間都來自學生的裝置，不會有時差）
  const ans = it ? [...list].reverse().find((a) => a.q === l.q && a.ts >= l.ts) : null
  // 這一輪（同一個單元、最近一小時）的對錯
  const run = it ? list.filter((a) => a.m === it.mid && a.ts > Date.now() - 3600000 && a.x !== 'e') : []
  const t0 = dayStart()
  const today = list.filter((a) => a.ts >= t0)
  const ok = today.filter((a) => a.r === 'ok').length
  const name = st.name || '學生'
  const statusTxt = !l ? `${name} 還沒有上線` : !isActive(l) ? `${name} 現在沒有在練習（${agoText(l.ts)}）` : l.view === 'run' ? '' : l.view === 'exam' ? `${name} 正在寫模擬段考（交卷後看得到作答）` : l.view === 'flash' ? `${name} 正在玩閃電挑戰` : `${name} 在 App 的首頁`
  // 口說：正在念哪一句、念完的分數與漏掉的字
  const sp = isActive(l) && l.view === 'speak' && l.text
  const spKey = sp && l.said ? `sp${l.ts}` : ''
  const spCls = sp && l.said ? (l.sc >= 85 ? 'ok' : l.sc >= 65 ? 'care' : 'bad') : ''
  setView(
    `<div class="page narrow watch-page">
      ${header(name, it ? `${l.title}・第 ${l.n}／${l.of} 題` : sp ? `${l.title}・第 ${l.n}／${l.of} 句` : '課堂檢視', syncPill(), true)}
      ${
        sp
          ? `<section class="card watch-q watch-sp${spCls ? ' answered ' + spCls : ''}${spKey && spKey !== watchFresh ? ' fresh' : ''}">
              <div class="wq-h"><span class="ld-dot on"></span>${l.listening ? '正在說…' : l.said ? `${l.sc} 分` : '準備跟著說'}<small>口說練習</small></div>
              <div class="sp-en" lang="en">${l.said ? speakWordsHTML(speakScore(l.text, [l.said]).words) : esc(l.text)}</div>
              ${l.said ? `<div class="sp-heard">聽到：<span lang="en">${esc(l.said)}</span></div>` : ''}
            </section>`
          : it
          ? `<div class="watch-run">${run.map((a) => `<i class="wr ${a.r}" title="${esc(snippet(ITEM[a.q] || {}))}"></i>`).join('')}<span>今天 ${today.length} 題・對 ${today.length ? Math.round((ok / today.length) * 100) : 0}%</span></div>
            <section class="card watch-q${ans ? ' answered ' + ans.r : ''}${ans && Sync.akey(ans) !== watchFresh ? ' fresh' : ''}">
              <div class="wq-h"><span class="ld-dot on"></span>${ans ? (ans.r === 'ok' ? '答對了' : ans.r === 'care' ? '格式粗心' : '答錯了') + `<small>${ans.c ? '有點猜・' : ''}${ans.h ? `看了 ${ans.h} 個提示・` : ''}${new Date(ans.ts).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}</small>` : '正在作答…'}</div>
              <div class="watch-slot"></div>
            </section>`
          : `<div class="empty card"><div class="empty-ic">${isActive(l) ? '📱' : '💤'}</div><h2>${esc(statusTxt)}</h2><p class="muted">${name} 開始做題目時，這裡會自動顯示那一題。</p></div>`
      }
      <section class="card"><div class="sec-h"><div><h2>剛剛的作答</h2></div></div>${feedHTML(list.slice(-10))}</section>
    </div>`,
  )
  if (it) {
    const card = reviewCard(it, ans, `${name} 的答案`)
    // 選擇題：學生選的那個直接標顏色（對＝綠、錯＝紅）
    if (ans && it.t === 'mcq')
      $$('.opt', card).forEach((o) => {
        const i = +o.dataset.i
        if (i === it.a) o.classList.add('ok')
        else if (it.opts[i] === ans.a) o.classList.add('bad')
      })
    $('.watch-slot').append(card)
  }
  if (ans) watchFresh = Sync.akey(ans)
  if (spKey) watchFresh = spKey
  if (keepScroll) window.scrollTo(0, y)
  $('.watch-page').addEventListener('click', (e) => feedClick(e, list))
}

// ───────────────────────── 派作業 ─────────────────────────
// 老師在學生頁派作業（單元、模擬段考、口說、錯題本）；學生首頁最上面看得到；做完自動打勾（看練習紀錄），老師收到通知
// 資料：classes/<班級>/hw/<學生>/<作業> ＝ { title, tasks: [{ k: 'mod', id } | { k: 'exam' } | { k: 'speak' } | { k: 'book' }], at, due, note }
const hwTaskName = (t) => (t.k === 'mod' ? `${MODULES[t.id]?.icon || ''} ${MODULES[t.id]?.title || t.id}` : { exam: '📝 模擬段考', speak: '🎤 口說練習', book: '📕 錯題本複習' }[t.k] || '')
const hwSessKey = (t) => (t.k === 'mod' ? 'm:' + t.id : t.k)
// 一項作業的完成狀況：派出之後有沒有那個練習的紀錄（錯題本已經清空也算完成）
function hwStatus(h, sess, attempts) {
  const res = (h.tasks || []).map((t) => {
    const hit = sess.filter((s) => s.k === hwSessKey(t) && s.ts >= h.at)
    const s = hit[hit.length - 1] || null
    const empty = t.k === 'book' && !s && !bookIds(attempts).length
    return { t, s, ok: !!s || empty, empty }
  })
  const done = res.filter((x) => x.ok).length
  return { res, done, total: res.length, all: res.length > 0 && done === res.length }
}
// 這個學生的作業（新的在前）：管理裝置看整個班級；學生、家長用自己抓下來的
function hwOf(sid) {
  const src = Sync.isAdmin() ? Sync.D.hw?.[sid] : Sync.hw || S.hwCache
  return Object.entries(src || {})
    .filter(([, h]) => h && Array.isArray(h.tasks))
    .sort((a, b) => b[1].at - a[1].at)
}
const dueText = (t) => {
  const d = new Date(t)
  return `${d.getMonth() + 1}/${d.getDate()}（${'日一二三四五六'[d.getDay()]}）前`
}
// 學生首頁（和家長頁）的「老師的作業」：還沒做完、或做完不到一天的
function hwCardHTML(readonly = false) {
  const sid = Sync.sid()
  if (!sid || (!Sync.ready() && !S.hwCache)) return ''
  const list = hwOf(sid)
    .map(([id, h]) => [id, h, hwStatus(h, S.sessions, S.attempts)])
    .filter(([, h, st]) => !st.all || Date.now() - Math.max(...st.res.map((x) => x.s?.ts || 0)) < DAY)
  if (!list.length) return ''
  return `<section class="card hw-card"><div class="sec-h"><div><h2>📌 老師的作業</h2><p>${readonly ? '孩子做完會自動打勾' : '做完會自動打勾，老師也看得到'}</p></div></div>
    ${list
      .map(
        ([id, h, st]) => `<div class="hw-item${st.all ? ' all' : ''}"><div class="hw-top"><b>${esc(h.title)}</b><span class="${!st.all && h.due && Date.now() > h.due ? 'late' : ''}">${st.all ? '✓ 全部完成' : `${st.done}／${st.total}${h.due ? '・' + dueText(h.due) : ''}`}</span></div>
        ${h.note ? `<p class="hw-note">💬 ${esc(h.note)}</p>` : ''}
        <div class="list flat">${st.res
          .map(({ t, s, ok, empty }) =>
            readonly
              ? `<div class="row static hw-task${ok ? ' ok' : ''}"><span class="hw-chk">${ok ? ICON.check : ''}</span><span class="row-t">${esc(hwTaskName(t))}</span><span class="row-r">${s ? (s.k === 'flash' ? `${s.s} 題` : `${s.s} 分`) : empty ? '已清空' : ''}</span></div>`
              : `<button class="row hw-task${ok ? ' ok' : ''}" data-hw="${esc(JSON.stringify(t))}"><span class="hw-chk">${ok ? ICON.check : ''}</span><span class="row-t">${esc(hwTaskName(t))}</span><span class="row-r">${s ? `${s.s} 分` : empty ? '已清空' : '開始'}</span>${ICON.chev}</button>`,
          )
          .join('')}</div></div>`,
      )
      .join('')}</section>`
}
// 學生點作業裡的一項：直接開始那個練習
function startHwTask(t) {
  if (t.k === 'mod' && MODULES[t.id]) return startModule(t.id)
  if (t.k === 'exam') return go('#/exam')
  if (t.k === 'speak') return go('#/speak')
  if (t.k === 'book') {
    const ids = bookIds()
    if (!ids.length) return toast('錯題本已經清空了，這項算完成 👍', '📕')
    return startRun('book', '錯題重練', shuffle(ids).slice(0, 12))
  }
}
document.addEventListener('click', (e) => {
  const h = e.target.closest('[data-hw]')
  if (!h) return
  try {
    startHwTask(JSON.parse(h.dataset.hw))
  } catch {}
})
// 學生做完最後一項：恭喜一下（每份作業只一次）
function hwCelebrate() {
  const sid = Sync.sid()
  if (!sid || myRole() !== 'student') return
  S.hwDone ||= []
  for (const [id, h] of hwOf(sid)) {
    if (S.hwDone.includes(id)) continue
    if (hwStatus(h, S.sessions, S.attempts).all) {
      S.hwDone.push(id)
      save()
      toast(`作業完成：${h.title}！老師會看到 👏`, '📌')
      setTimeout(celebrate, 200)
    }
  }
}
// 老師端：學生做完作業時通知（第一次載入時已完成的不通知）
function hwNotify(first = false) {
  if (!Sync.isAdmin() || ACTIVE || !S.sync) return
  const seen = new Set(S.sync.hwSeen || [])
  let changed = false
  for (const sid of studentIds())
    for (const [id, h] of hwOf(sid)) {
      const key = sid + '/' + id
      if (seen.has(key) || !hwStatus(h, Sync.sessionsOf(sid), Sync.attemptsOf(sid)).all) continue
      seen.add(key)
      changed = true
      if (!first) toast(`${Sync.students[sid]?.name || '學生'} 完成作業：${h.title}`, '📌')
    }
  if (changed) {
    S.sync.hwSeen = [...seen].slice(-200)
    save()
  }
}
// 自動挑：最近兩週錯最多的考點 → 那些考點最多的單元（還沒精熟的優先）＋錯題本
function hwAutoPick(sid) {
  const list = Sync.attemptsOf(sid)
  const recent = list.filter((a) => a.ts >= Date.now() - 14 * DAY)
  const top = tagCounts(recent)
    .map(([t]) => t)
    .filter((t) => !['listen', 'read', 'sound'].includes(t))
    .slice(0, 2)
  const last = lastByItem(list)
  const picks = []
  if (top.length) {
    const score = MOD_ORDER.map((mid) => {
      const items = MODULES[mid].scored
      const hit = items.filter((it) => (it.tags || []).some((t) => top.includes(t))).length
      const mastered = items.filter((it) => last[it.id]?.r === 'ok').length
      return [mid, hit, mastered / Math.max(1, items.length)]
    })
      .filter(([, hit]) => hit)
      .sort((a, b) => b[1] - a[1] || a[2] - b[2])
    picks.push(...score.slice(0, 2).map(([id]) => ({ k: 'mod', id })))
  } else {
    // 還沒有錯誤紀錄：照順序挑還沒做完的單元
    const doneMods = new Set(Sync.sessionsOf(sid).map((s) => s.k))
    picks.push(
      ...MOD_ORDER.filter((mid) => !doneMods.has('m:' + mid))
        .slice(0, 2)
        .map((id) => ({ k: 'mod', id })),
    )
  }
  if (bookIds(list).length) picks.push({ k: 'book' })
  return { picks, top }
}
function assignSheet(sid) {
  const st = Sync.students[sid] || {}
  const due = new Date(dayStart() + 3 * DAY)
  const ymd = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`
  const sel = new Set()
  const chip = (key, label) => `<button type="button" class="chip pick hw-pick" data-t="${key}">${esc(label)}</button>`
  const b = sheet(
    `<h2 class="sheet-title">派作業給 ${esc(st.name || '學生')}</h2>
    <div class="list form">
      <label class="row field"><span class="row-t">截止日</span><input type="date" id="hw-due" value="${ymd}"></label>
      <label class="row field"><span class="row-t">給學生的話<small>可以不填</small></span><input id="hw-note" maxlength="60" placeholder="例如：複數字尾要特別注意" autocomplete="off"></label>
    </div>
    <button type="button" class="btn ghost hw-auto" data-auto>✨ 依最近的錯誤自動挑</button>
    <p class="hw-auto-why muted" hidden></p>
    <div class="hw-groups">
      ${LESSONS.map((L) => `<div class="hw-g"><div class="group-h">${esc(L.title)}</div><div class="chips">${L.modules.map((mid) => chip('mod:' + mid, `${MODULES[mid].icon} ${MODULES[mid].title}`)).join('')}</div></div>`).join('')}
      <div class="hw-g"><div class="group-h">綜合</div><div class="chips">${chip('exam', '📝 模擬段考')}${chip('speak', '🎤 口說練習')}${chip('book', '📕 錯題本複習')}</div></div>
    </div>
    <div class="sheet-actions"><button class="btn ghost" data-close>取消</button><button class="btn primary" data-ok disabled>派出</button></div>`,
    { wide: true },
  )
  const draw = () => {
    $$('.hw-pick', b).forEach((c) => c.classList.toggle('on', sel.has(c.dataset.t)))
    const ok = $('[data-ok]', b)
    ok.disabled = !sel.size
    ok.textContent = sel.size ? `派出（${sel.size} 項）` : '派出'
  }
  b.addEventListener('click', async (e) => {
    const c = e.target.closest('.hw-pick')
    if (c) {
      sel.has(c.dataset.t) ? sel.delete(c.dataset.t) : sel.add(c.dataset.t)
      return draw()
    }
    if (e.target.closest('[data-auto]')) {
      const { picks, top } = hwAutoPick(sid)
      sel.clear()
      picks.forEach((t) => sel.add(t.k === 'mod' ? 'mod:' + t.id : t.k))
      const w = $('.hw-auto-why', b)
      w.hidden = false
      w.textContent = top.length ? `最近兩週最常錯：${top.map((t) => TAGS[t] || t).join('、')}，挑了這些考點最多的單元。` : '還沒有錯誤紀錄，先挑還沒做完的單元。'
      if (!sel.size) w.textContent += '（沒有可以挑的，請自己選）'
      return draw()
    }
    if (e.target.closest('[data-ok]') && sel.size) {
      const tasks = [...sel].map((k) => (k.startsWith('mod:') ? { k: 'mod', id: k.slice(4) } : { k }))
      const d = $('#hw-due', b).value
      const dueTs = d ? new Date(d + 'T23:59:59').getTime() : 0
      const h = { title: `${fmtDate(Date.now())} 的作業`, tasks, at: Date.now(), ...(dueTs ? { due: dueTs } : {}), ...($('#hw-note', b).value.trim() ? { note: $('#hw-note', b).value.trim().slice(0, 60) } : {}) }
      try {
        await Sync.addHw(sid, h)
        closeSheet()
        toast(`已派給 ${st.name || '學生'}：${tasks.length} 項`, '📌')
      } catch (err) {
        toast(err.status === 401 || err.status === 403 ? '派作業需要先更新 Firebase 的資料庫規則' : '沒有成功，請檢查網路再試一次', '⚠️')
      }
    }
  })
}
// 學生頁的「作業」區塊（老師看）
function hwTeacherHTML(sid) {
  const sess = Sync.sessionsOf(sid)
  const att = Sync.attemptsOf(sid)
  const list = hwOf(sid).slice(0, 6)
  return `<section class="card hw-card"><div class="sec-h"><div><h2>📌 作業</h2><p>${list.length ? '做完會自動打勾，並通知你' : '還沒有派作業'}</p></div><button class="btn primary small-btn" data-assign>＋ 派作業</button></div>
    ${list
      .map(([id, h]) => {
        const st = hwStatus(h, sess, att)
        const late = !st.all && h.due && Date.now() > h.due
        return `<div class="hw-item${st.all ? ' all' : ''}"><div class="hw-top"><b>${esc(h.title)}</b><span class="${late ? 'late' : ''}">${st.all ? '✓ 全部完成' : `${st.done}／${st.total}${h.due ? '・' + (late ? '已過期限' : dueText(h.due)) : ''}`}</span><button class="link hw-del" data-delhw="${id}">刪除</button></div>
        ${h.note ? `<p class="hw-note">💬 ${esc(h.note)}</p>` : ''}
        <div class="list flat">${st.res
          .map(({ t, s, ok, empty }) => `<div class="row static hw-task${ok ? ' ok' : ''}"><span class="hw-chk">${ok ? ICON.check : ''}</span><span class="row-t">${esc(hwTaskName(t))}${s ? `<small>${fmtTime(s.ts)}${s.n ? `・${s.n} 題` : ''}</small>` : ''}</span><span class="row-r">${s ? `${s.s} 分` : empty ? '已清空' : '還沒做'}</span></div>`)
          .join('')}</div></div>`
      })
      .join('')}</section>`
}

// 跟自己比：本週 vs 上週、連續天數、模擬段考、閃電挑戰（不跟別人比）
const weekStart = (t = Date.now()) => {
  const d = dayStart(t)
  return d - ((new Date(d).getDay() + 6) % 7) * DAY
}
function selfRecHTML(list = S.attempts, sess = S.sessions) {
  if (!list.length && !sess.length) return ''
  const w0 = weekStart()
  const thisW = list.filter((a) => a.ts >= w0).length
  const lastW = list.filter((a) => a.ts >= w0 - 7 * DAY && a.ts < w0).length
  const sd = streakDays(list)
  const best = maxStreakDays(list)
  const ex = sess.filter((s) => s.k === 'exam')
  const fl = sess.filter((s) => s.k === 'flash')
  const diff = thisW - lastW
  const cell = (v, k, sub) => `<div class="sr-cell"><div class="sr-v">${v}</div><div class="sr-k">${k}</div><div class="sr-sub">${sub}</div></div>`
  return `<section class="card self-rec"><div class="sec-h"><div><h2>跟自己比</h2><p>不跟別人比，只看有沒有比自己進步。</p></div></div>
    <div class="sr-grid">
      ${cell(`${thisW}<small> 題</small>`, '這週', lastW ? `上週 ${lastW} 題${diff > 0 ? `・<b class="up">多 ${diff} 題</b>` : ''}` : '上週沒有練習')}
      ${cell(`${sd}<small> 天</small>`, '連續練習', `最長 ${best} 天${sd > 1 && sd >= best ? '・<b class="up">追平紀錄</b>' : ''}`)}
      ${cell(ex.length ? `${Math.max(...ex.map((s) => s.s))}<small> 分</small>` : '—', '模擬段考最高', ex.length ? `最近一次 ${ex[ex.length - 1].s} 分` : '還沒寫過')}
      ${cell(fl.length ? `${Math.max(...fl.map((s) => s.s))}<small> 題</small>` : '—', '閃電挑戰最高', fl.length ? `玩了 ${fl.length} 次` : '還沒玩過')}
      ${(() => {
        const sp = sess.filter((s) => s.k === 'speak')
        return sp.length ? cell(`${Math.max(...sp.map((s) => s.s))}<small> 分</small>`, '口說最高', `最近一次 ${sp[sp.length - 1].s} 分`) : ''
      })()}
    </div></section>`
}
// 破紀錄提醒（只跟自己比）
function checkRecords(silent = false) {
  const r = (S.rec ||= {})
  const w0 = weekStart()
  const thisW = S.attempts.filter((a) => a.ts >= w0).length
  const lastW = S.attempts.filter((a) => a.ts >= w0 - 7 * DAY && a.ts < w0).length
  const sd = streakDays()
  if (silent || r.streak == null) {
    r.streak = Math.max(r.streak || 0, maxStreakDays())
    if (thisW > lastW) r.week = w0
    return
  }
  if (lastW >= 10 && thisW > lastW && r.week !== w0) {
    r.week = w0
    toast(`這週已經做了 ${thisW} 題，比上週的 ${lastW} 題還多！`, '📈')
  }
  if (sd > r.streak && sd >= 2) {
    r.streak = sd
    toast(`連續練習 ${sd} 天，新紀錄！`, '🔥')
  }
}

// 成員管理（管理裝置才看得到）：依學生分組的名單、移除、允許重新加入、暫停加入、老師的其他裝置
function viewManage(keepScroll = false) {
  const y = window.scrollY
  if (!Sync.isAdmin()) return go('#/settings')
  const seen = S.sync?.seenAt || S.sync?.at || 0
  const me = Auth.uid()
  const mems = Object.entries(Sync.members)
    .filter(([uid, m]) => m && uid !== me)
    .sort((a, b) => (b[1].at || 0) - (a[1].at || 0))
  const blk = Object.entries(Sync.blocked).filter(([, b]) => b)
  const last = (m) => {
    const l = Sync.D.live?.[m.sid]?.[m.pid]
    return l?.ts ? `最後上線 ${agoText(l.ts)}` : '還沒上線'
  }
  const row = ([uid, m]) =>
    `<div class="row mg-row"><span class="mg-ic">${ROLE_IC[m.role] || '❔'}</span><span class="row-t"><b>${esc(ROLES[m.role] || '成員')}${(m.at || 0) > seen ? '<em class="mg-new">新加入</em>' : ''}${m.admin ? '<em class="mg-admin">可管理</em>' : ''}</b><small>${esc(m.dev || '裝置')}・${fmtDate(m.at || 0)} 加入${m.role !== 'teacher' ? '・' + last(m) : ''}</small></span>${m.role === 'teacher' ? `<button class="btn ghost small-btn" data-admin="${uid}" data-v="${m.admin ? 0 : 1}">${m.admin ? '取消管理' : '設為可管理'}</button>` : ''}<button class="btn ghost small-btn danger-t" data-remove="${uid}">移除</button></div>`
  const ids = studentIds()
  const teachers = mems.filter(([, m]) => m.role === 'teacher')
  const loose = mems.filter(([, m]) => m.role !== 'teacher' && !Sync.students[m.sid])
  setView(
    `<div class="page narrow manage-page">
      ${header('成員管理', '看得到練習紀錄的裝置都列在這裡，可以隨時移除。大家都加入之後，把「開放加入」關掉，連結和代碼就算被轉傳也加不進來。', '', true)}
      <div class="group"><div class="list form">
        <div class="row field"><span class="row-t">開放加入<small>${Sync.open ? '現在用連結、QR Code、代碼都能加入' : '現在不能加入（已加入的不受影響）'}</small></span><div class="seg small" id="open-seg"><button class="${Sync.open ? 'on' : ''}" data-open="1">開</button><button class="${Sync.open ? '' : 'on'}" data-open="0">關</button></div></div>
      </div></div>
      ${ids
        .map((sid) => {
          const rows = mems.filter(([, m]) => m.sid === sid && m.role !== 'teacher')
          return `<div class="group"><div class="group-h">${esc(Sync.students[sid]?.name || '學生')}（${rows.length}）</div><div class="list">${rows.length ? rows.map(row).join('') : '<div class="row static"><span class="row-t muted">還沒有裝置加入</span></div>'}</div></div>`
        })
        .join('')}
      ${loose.length ? `<div class="group"><div class="group-h">還沒分到學生（${loose.length}）</div><div class="list">${loose.map(row).join('')}</div></div>` : ''}
      <div class="group"><div class="group-h">老師的裝置（${teachers.length + (Sync.state === 'owner' ? 1 : 2)}）</div><div class="list">
        <div class="row static mg-row"><span class="mg-ic">📚</span><span class="row-t"><b>${esc(S.profile.device || '老師')}（目前使用中）</b><small>${Sync.state === 'owner' ? '建立後台的管理裝置' : '管理裝置'}</small></span></div>
        ${Sync.state === 'owner' ? '' : '<div class="row static mg-row"><span class="mg-ic">📚</span><span class="row-t"><b>老師</b><small>建立後台的管理裝置</small></span></div>'}
        ${teachers.map(row).join('')}
        <button class="row" data-share-teacher><span class="row-ic">${ICON.share}</span><span class="row-t">加入老師的其他裝置<small>QR Code 或連結；加入後看得到所有學生</small></span>${ICON.chev}</button>
      </div></div>
      ${
        blk.length
          ? `<div class="group"><div class="group-h">已移除（${blk.length}）</div><div class="list">${blk
              .map(
                ([uid, b]) => `<div class="row mg-row"><span class="mg-ic">🚫</span><span class="row-t"><b>${esc(ROLES[b.role] || '裝置')}${Sync.students[b.sid]?.name ? `（${esc(Sync.students[b.sid].name)}）` : ''}</b><small>${esc(b.dev || '裝置')}・${fmtDate(b.at || 0)} 移除</small></span><button class="btn ghost small-btn" data-unblock="${uid}">允許重新加入</button></div>`,
              )
              .join('')}</div><p class="group-f">被移除的裝置不能自己加回來；按「允許重新加入」之後，對方再點一次連結或輸入代碼就能加入。</p></div>`
          : ''
      }
      <p class="foot">被移除的裝置會立刻看不到任何資料；之前同步到那台裝置上的紀錄會留在那台，但不會再更新。</p>
    </div>`,
  )
  if (keepScroll) window.scrollTo(0, y)
  // 看過名單：新成員的通知就收起來
  if (S.sync) {
    const latest = Math.max(0, ...mems.map(([, m]) => m.at || 0))
    if (latest > seen) {
      S.sync.seenAt = latest
      save()
      setTimeout(() => onSyncChange('seen'), 0)
    }
  }
  $('.manage-page').addEventListener('click', async (e) => {
    const t = e.target.closest('button')
    if (!t) return
    try {
      if (t.dataset.remove) {
        const m = Sync.members[t.dataset.remove] || {}
        const sn = Sync.students[m.sid]?.name
        return confirmSheet(
          '移除這個成員？',
          `${esc(ROLES[m.role] || '成員')}${sn ? `（${esc(sn)}）` : ''}・${esc(m.dev || '裝置')} 會立刻看不到任何資料，也不能自己再加回來（之後可以在「已移除」按允許重新加入）。`,
          '移除',
          async () => {
            try {
              await Sync.remove(t.dataset.remove)
              toast('已移除', '🚫')
            } catch {
              toast('沒有成功，請檢查網路再試一次', '⚠️')
            }
          },
          true,
        )
      }
      if (t.dataset.unblock) {
        t.disabled = true
        await Sync.unblock(t.dataset.unblock)
        toast('已允許重新加入', '✅')
      }
      if (t.dataset.admin) {
        t.disabled = true
        await Sync.setAdmin(t.dataset.admin, t.dataset.v === '1')
        toast(t.dataset.v === '1' ? '已設為可管理' : '已取消管理權限', '✅')
      }
      if (t.dataset.open) {
        await Sync.setOpen(t.dataset.open === '1')
        toast(t.dataset.open === '1' ? '已開放加入' : '已暫停加入：連結和代碼暫時不能用', t.dataset.open === '1' ? '🔓' : '🔒')
        viewManage(true)
      }
      if (t.matches('[data-share-teacher]')) shareTeacher()
    } catch {
      toast('沒有成功，請檢查網路再試一次', '⚠️')
      t.disabled = false
    }
  })
}

// ── 分享：QR Code、連結、代碼 ──
function pairLink(role, x = '') {
  return `${location.origin}${location.pathname}#/pair/${Sync.code()}/${role}${x ? '/' + x : ''}`
}
let QR = null
async function qrSVG(text) {
  QR ||= (await import('./qrcode.js')).default
  const q = QR(0, 'M')
  q.addData(text)
  q.make()
  return q.createSvgTag({ cellSize: 4, margin: 8, scalable: true })
}
async function copyLink(link) {
  try {
    await Promise.race([navigator.clipboard.writeText(link), new Promise((_, r) => setTimeout(r, 1500))])
    toast('已複製連結', '📋')
  } catch {
    sheet(`<h2 class="sheet-title">請長按複製</h2><div class="pair-link">${esc(link)}</div>`)
  }
}
// 傳給某個學生（或他的家長）：三種方式擺在一起
function shareStudent(sid, role = 'student') {
  const st = Sync.students[sid] || {}
  const b = sheet(
    `<h2 class="sheet-title">傳給 ${esc(st.name || '學生')}</h2>
    <div class="seg" id="sh-role"><button data-r="student">學生用</button><button data-r="parent">家長用</button></div>
    <div class="share-grid">
      <div class="qr-box"><div class="qr" role="img" aria-label="加入用的 QR Code"></div><small>用手機相機掃描</small></div>
      <div class="share-side">
        <div class="sh-block"><div class="sh-k">連結</div><p class="sh-p">點一下就加入，可以用 LINE 傳</p><div class="sh-actions"><button class="btn ghost small-btn" data-copy>複製</button>${navigator.share ? '<button class="btn primary small-btn" data-send>傳送</button>' : ''}</div></div>
        <div class="sh-block"><div class="sh-k">代碼</div><div class="code-big" aria-live="polite">產生中…</div><p class="sh-p sh-exp"></p><button class="link" data-regen>重新產生</button></div>
      </div>
    </div>
    <p class="sheet-p sh-how"></p>`,
    { wide: true },
  )
  const draw = async () => {
    $$('#sh-role button', b).forEach((x) => x.classList.toggle('on', x.dataset.r === role))
    $('.sh-how', b).textContent =
      role === 'student'
        ? `學生用：加入後，${st.name || '學生'} 在那台做的題目會即時同步，之前做過的也會一起傳上來。代碼在 App 的「設定 → 連結老師 → 輸入代碼」使用。`
        : `家長用：加入後只看得到 ${st.name || '這個學生'} 的練習，看不到其他學生。代碼在 App 的「設定 → 連結老師 → 輸入代碼」使用。`
    try {
      $('.qr', b).innerHTML = await qrSVG(pairLink(role, sid))
    } catch {
      $('.qr', b).textContent = 'QR Code 載入失敗'
    }
  }
  const code = async (force) => {
    $('.code-big', b).textContent = '產生中…'
    try {
      const s = await Sync.ensureCode(sid, force)
      $('.code-big', b).textContent = fmtShort(s.code)
      $('.sh-exp', b).textContent = `學生、家長都能用・${fmtDate(s.codeExp)} 前有效`
    } catch {
      $('.code-big', b).textContent = '—'
      $('.sh-exp', b).textContent = '現在連不上，請稍後再試'
    }
  }
  draw()
  code(false)
  b.addEventListener('click', (e) => {
    const r = e.target.closest('[data-r]')
    if (r) {
      role = r.dataset.r
      return draw()
    }
    if (e.target.closest('[data-copy]')) return copyLink(pairLink(role, sid))
    if (e.target.closest('[data-send]')) return navigator.share({ title: '英文段考複習', text: role === 'student' ? `${st.name || ''}：點這個連結開始練習` : `點這個連結，就能看到${st.name || '孩子'}的練習`, url: pairLink(role, sid) }).catch(() => {})
    if (e.target.closest('[data-regen]')) return code(true)
  })
}
// 老師的其他裝置（例如手機）：QR Code 或連結（不提供代碼）
function shareTeacher() {
  const link = pairLink('teacher', Sync.D.tkey || '')
  const b = sheet(
    `<h2 class="sheet-title">加入老師的其他裝置</h2>
    <div class="share-grid">
      <div class="qr-box"><div class="qr" role="img" aria-label="加入用的 QR Code"></div><small>用手機相機掃描</small></div>
      <div class="share-side"><div class="sh-block"><div class="sh-k">連結</div><p class="sh-p">用這個連結加入的裝置看得到所有學生，也能管理成員。只傳給老師的裝置。</p><div class="sh-actions"><button class="btn ghost small-btn" data-copy>複製</button></div></div>
      <div class="sh-block"><button class="link danger-t" data-reset>重設老師連結</button><p class="sh-p">重設後，舊的老師連結就不能用了（已經加入的裝置不受影響）。</p></div></div>
    </div>`,
    { wide: true },
  )
  if (!Sync.D.tkey) $('.qr', b).textContent = '載入中…'
  else qrSVG(link).then((s) => ($('.qr', b).innerHTML = s)).catch(() => {})
  b.addEventListener('click', async (e) => {
    if (e.target.closest('[data-copy]')) return copyLink(link)
    if (e.target.closest('[data-reset]'))
      try {
        await Sync.resetTeacherKey()
        closeSheet()
        toast('已重設老師連結', '🔑')
      } catch {
        toast('沒有成功，請檢查網路再試一次', '⚠️')
      }
  })
}
// 輸入代碼（學生、家長）
function codeSheet(role, prefill = '') {
  role = role || (S.profile.role === 'parent' ? 'parent' : 'student')
  const b = sheet(`<h2 class="sheet-title">輸入老師給的代碼</h2>
    <div class="list form"><div class="row field"><span class="row-t">身分</span><div class="seg small" id="cs-role"><button data-r="student">學生</button><button data-r="parent">家長</button></div></div></div>
    <input id="cs-code" class="code-input" placeholder="例如 K7M 4QP" maxlength="9" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="代碼">
    <p class="cs-err" role="alert"></p>
    <div class="sheet-actions"><button class="btn ghost" data-close>取消</button><button class="btn primary" data-ok>連結</button></div>`)
  const draw = () => $$('#cs-role button', b).forEach((x) => x.classList.toggle('on', x.dataset.r === role))
  draw()
  const inp = $('#cs-code', b)
  inp.value = prefill
  setTimeout(() => inp.focus(), 300)
  $('#cs-role', b).addEventListener('click', (e) => {
    const r = e.target.closest('[data-r]')
    if (r) {
      role = r.dataset.r
      draw()
    }
  })
  const ok = async () => {
    const btn = $('[data-ok]', b)
    btn.disabled = true
    $('.cs-err', b).textContent = ''
    const d = await lookupCode(inp.value)
    btn.disabled = false
    if (d.err) return ($('.cs-err', b).textContent = d.err)
    closeSheet()
    if (S.sync?.code && (S.sync.code !== d.c || S.sync.sid !== d.s || myRole() !== role))
      return confirmSheet('換成新的連結？', '已經連結了另一個學生或老師。換成這一個之後，舊的那一個不會再同步。', '換成這一個', () => finishPair(d.c, role, { sid: d.s }))
    finishPair(d.c, role, { sid: d.s })
  }
  $('[data-ok]', b).onclick = ok
  inp.addEventListener('keydown', (e) => e.key === 'Enter' && ok())
}
// 打開加入連結：#/pair/<班級>/<身分>/<學生代號或老師鑰匙>
function viewPair(code, preset, x = '') {
  if (!/^[a-z0-9]{16,40}$/.test(code)) {
    toast('這個連結不完整', '⚠️')
    return go('#/')
  }
  if (ACTIVE) {
    toast('學生模式中：請先按上面的「結束」', '⚠️')
    return go('#/')
  }
  // 老師後台的裝置點到學生、家長的連結：不要把這台換掉
  if (S.sync?.code === code && myRole() === 'teacher' && preset !== 'teacher') {
    toast('這是給學生或家長的連結，請傳給對方', '💡')
    return go('#/students')
  }
  const opt = preset === 'teacher' ? { tkey: x } : x ? { sid: x } : {}
  if (ROLES[preset]) {
    if (S.sync?.code === code && myRole() === preset && (preset === 'teacher' || !x || S.sync.sid === x)) {
      if (!Sync.ready()) {
        Sync.start()
        return showJoin()
      }
      toast('已經加入了', '✅')
      return go(preset === 'student' ? '#/' : '#/live')
    }
    if (S.sync?.code) {
      viewHome()
      return confirmSheet('換成新的連結？', '已經連結了另一個學生或老師。換成這一個之後，舊的那一個不會再同步。', '換成這一個', () => finishPair(code, preset, opt))
    }
    return finishPair(code, preset, opt)
  }
  // 1.8 以前沒有身分的連結：選學生或家長
  viewHome()
  let role = S.profile.role === 'parent' ? 'parent' : 'student'
  const b = sheet(
    `<h2 class="sheet-title">連結老師</h2>
    <div class="list form"><div class="row field"><span class="row-t">身分</span><div class="seg small" id="pair-role"><button data-r="student">學生</button><button data-r="parent">家長</button></div></div></div>
    <p class="sheet-p pair-desc" style="margin-top:12px"></p>
    <div class="sheet-actions"><button class="btn ghost" data-close>先不要</button><button class="btn primary" data-ok>加入</button></div>`,
  )
  const draw = () => {
    $$('#pair-role button', b).forEach((y) => y.classList.toggle('on', y.dataset.r === role))
    $('.pair-desc', b).textContent = role === 'student' ? '加入之後，你的作答會即時同步，以前做過的題目也會一起傳上去。' : '加入之後，就能即時看到孩子正在做哪一題、每題答了什麼。'
  }
  draw()
  $('#pair-role', b).addEventListener('click', (e) => {
    const r = e.target.closest('[data-r]')
    if (!r) return
    role = r.dataset.r
    draw()
  })
  $('[data-ok]', b).onclick = () => {
    closeSheet()
    finishPair(code, role, opt)
  }
}
// 點連結、掃 QR Code、輸入代碼之後
async function finishPair(code, role, opt = {}) {
  const mine = S.attempts.filter((a) => a.d === S.profile.id).length
  S.profile.device = ROLES[role]
  if (role === 'student') S.seen = { ...(S.seen || {}), intro: S.seen?.intro || Date.now() }
  go(role === 'student' ? '#/' : '#/live')
  await Sync.pair(code, role, opt)
  if (Sync.ready()) {
    if (role === 'teacher') return toast('加入完成！可以看到所有學生的練習', '📡')
    if (role === 'parent') return toast('連結完成！這裡可以即時看到孩子的練習', '📡')
    if (mine) return toast(`連結完成！正在把你之前的 ${mine} 筆作答同步上去`, '📡')
    return setTimeout(noRecordsHint, 350)
  }
  showJoin()
}
function showJoin() {
  sheet(`<div class="empty join-status">${joinStatusHTML()}</div><div class="sheet-actions"><button class="btn ghost" data-close>知道了</button></div>`)
}
function noRecordsHint() {
  sheet(`<h2 class="sheet-title">連結完成 ✅</h2><p class="sheet-p">之後在這裡做的題目，老師都會即時看到。</p>
    <div class="callout care"><b>這裡沒有找到你之前的練習紀錄。</b>如果你之前是用別的方式打開 App（例如 LINE 裡的連結、Safari、主畫面的圖示），請用「那個方式」再點一次連結或輸入代碼，之前做的題目才會同步上來。</div>
    <div class="sheet-actions"><button class="btn primary" data-close>知道了</button></div>`)
}

// ── 學生模式：老師的裝置暫時借給一個學生用（題目、錯題本、紀錄都是那個學生的，作答同步到他那裡） ──
function enterClass(sid) {
  const st = Sync.students[sid] || {}
  try {
    const key = `${KEY}@${sid}`
    const d = JSON.parse(localStorage.getItem(key) || 'null') || DEF()
    d.profile = { ...d.profile, name: st.name || '', role: 'student', device: '老師的裝置', exam: d.profile.exam || S.profile.exam || '', oral: S.profile.oral, size: S.profile.size }
    d.seen = { ...(d.seen || {}), intro: d.seen?.intro || Date.now() }
    localStorage.setItem(key, JSON.stringify(d))
    localStorage.setItem('g7review:active', sid)
  } catch {
    return toast('這個瀏覽器沒辦法切換（可能是無痕模式）', '⚠️')
  }
  location.hash = '#/'
  location.reload()
}
function endClass() {
  Sync.presence({ view: 'away' })
  try {
    localStorage.removeItem('g7review:active')
  } catch {}
  location.hash = ACTIVE ? '#/student/' + ACTIVE : '#/students'
  location.reload()
}
const classBarHTML = () => (ACTIVE ? `<div class="class-bar"><span>學生模式：<b>${esc(S.profile.name || '學生')}</b></span><button class="btn ghost small-btn" data-endclass>結束</button></div>` : '')

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
  // 老師後台多一個「學生」分頁
  const list = teacherMode() ? [['#/students', '學生', ICON.people], ...TABS] : TABS
  const cur = location.hash || '#/'
  root.innerHTML = `<main id="view" class="${tabs ? 'with-tabs' : 'immersive'}">${tabs ? classBarHTML() : ''}${html}</main>${
    tabs
      ? `<nav class="tabbar" aria-label="主選單">${list.map(([h, label, ic]) => {
          const on = cur === h || (h === '#/students' && (cur.startsWith('#/student/') || cur.startsWith('#/watch/') || cur === '#/manage'))
          const badge = h === '#/book' ? bookIds().length : h === '#/settings' ? pendingCount() : 0
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
  if (a !== 'watch' && WAKE) WAKE.release().catch(() => {})
  if (a === 'watch' && b) return viewWatch(b)
  if (a === 'run' && b) return viewRun(decodeURIComponent(b))
  if (a === 'book') return viewBook()
  if (a === 'exam') return viewExam()
  if (a === 'flash') return viewFlash()
  if (a === 'speak') return viewSpeak()
  if (a === 'stats') return viewStats()
  if (a === 'settings') return viewSettings()
  if (a === 'notes') return viewAllNotes()
  if (a === 'print' && b) return viewPrint(decodeURIComponent(b))
  if (a === 'live') return viewLive()
  if (a === 'students') return viewStudents()
  if (a === 'student' && b) return viewStudent(b)
  if (a === 'manage') return viewManage()
  if (a === 'pair' && b) return viewPair(decodeURIComponent(b), h.split('/')[3], h.split('/')[4] || '')
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
  if (e.key === 'ArrowLeft') {
    $('[data-act=back]')?.click()
    e.preventDefault()
    return
  }
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
// 2.0 以前建立配對碼的老師平板：升級後自動成為班級的管理裝置
if (S.sync && S.sync.role === 'teacher' && S.sync.owner === undefined && !S.sync.joined) {
  S.sync.owner = true
  save()
}
Sync.start()
route()
// 同步：有網路就把排隊的紀錄送出；離開 App 時告訴老師「離開」，回來時再更新
window.addEventListener('online', () => (Sync.ready() ? Sync.flushSoon(100) : Sync.paired() && Sync.start()))
document.addEventListener('visibilitychange', () => {
  if (!Sync.paired()) return
  if (document.visibilityState === 'hidden') return Sync.presence({ view: 'away' })
  if (Sync.ready()) {
    Sync.presence(Sync.last || { view: 'home' })
    Sync.flushSoon(100)
    Sync.fetchHw() // 回到 App：看看老師有沒有派新作業
  }
  // 連線斷了（或在背景太久、識別證過期）：重新開始
  const dead = Sync.es.some((e) => e.readyState === 2) || (!Sync.es.length && Sync.state !== 'removed')
  if (dead || (Auth.ok() && Auth.data?.exp && Auth.data.exp < Date.now() + 120000)) Sync.start()
})

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker
    .register('sw.js', { updateViaCache: 'none' })
    .then((reg) => {
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && reg.update().catch(() => {}))
    })
    .catch(() => {})
}

// 給測試用
window.__app = { S, ITEM, MODULES, checkText, formatIssues, diagnose, VERSION, Sync, Auth, speakScore }
