// 2.23 每天晚上的通知（GitHub Actions 排程執行：.github/workflows/push.yml，台灣時間 19:37～22:07 每 30 分鐘一次）
// 一天最多一則、固定時間（老師 10/11：通知要少、時間固定）：
//   學生 19:30：今天還沒練、或作業快到期還沒做完才發
//   家長 每週日 20:00：孩子這週的練習摘要
//   老師 21:00：今天哪些學生有練習、作業做完了沒、幾天沒練（有事才發）
// 排程可能晚幾分鐘到半小時：時間到了、今天還沒處理過就處理（pushlog 記錄），太晚（22:30 以後）就不發
// 先記再發：發之前先寫 pushlog（中途出錯也不會在下一輪重發；寧可漏一則，不要一晚收好幾次）；「今天不用發」也記，同一天不再重算
// 讀資料庫用服務帳戶（GitHub Secrets 的 FIREBASE_SA）；通知用 VAPID（GitHub Secrets 的 VAPID_PRIVATE）
// GitHub 公開專案的執行紀錄別人看得到：只印數量，不印名字、班級代碼、通知位址、金鑰
//
// MODE=run（排程）｜dry（不管時間，算出每一種要發幾則，不發、不寫資料庫）｜test（馬上發一則測試通知給老師的裝置）
// 測試用：DB=http://127.0.0.1:5190（模擬資料庫，不用服務帳戶）、NOW=<毫秒>、PUSH_ALLOW_LOCAL=1、PUSH_OUT=<檔案>
import crypto from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { b64u, ub64, vapidKeys, sendPush } from './webpush.mjs'

const MODE = ['run', 'dry', 'test'].includes(process.env.MODE) ? process.env.MODE : 'run'
const DB = (process.env.DB || 'https://g7-english-review-default-rtdb.asia-southeast1.firebasedatabase.app').replace(/\/+$/, '')
const LOCAL = /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(DB + '/')
const SUBJECT = 'https://xiaoyu-1201.github.io/g7-english-review/'
const NOW = +process.env.NOW || Date.now()
const DAY = 86400000
const TZ = 8 * 3600000 // 台灣時間（沒有日光節約）
const tw = (t) => new Date(t + TZ) // 用 getUTC* 讀出來＝台灣的時鐘
const dayStart = (t = NOW) => {
  const d = tw(t)
  d.setUTCHours(0, 0, 0, 0)
  return d.getTime() - TZ
}
const ymd = (t = NOW) => tw(t).toISOString().slice(0, 10)
const daysAgo = (ts) => Math.round((dayStart() - dayStart(ts)) / DAY)
const AT = { student: 19 * 60 + 30, parent: 20 * 60, teacher: 21 * 60 }
const LATE = 22 * 60 + 30
const TTL = { student: 2 * 3600, parent: 12 * 3600, teacher: 3 * 3600, test: 3600 } // 手機沒開機太久就不用送了（「今天還沒練」隔天才到會很怪）
const PLANT = new Set(['plant', 'grow']) // 花園的紀錄不算練習
const MAX_DEVS = 5 // 一個身分最多留 5 台（亂寫一堆的會被刪掉）
// 只送到瀏覽器的推播服務（Apple、Google、Mozilla、Microsoft）：訂閱的位址是使用者給的，不能讓排程去連任意網址
const PUSH_HOST = /(^|\.)(push\.apple\.com|fcm\.googleapis\.com|android\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com)$/
class Msg extends Error {} // 自己寫的錯誤訊息（可以印出來）；其他錯誤只印種類，避免把金鑰片段印進公開紀錄

const due = (role) => {
  if (MODE === 'test') return role === 'teacher'
  if (MODE === 'dry') return true
  const d = tw(NOW)
  const m = d.getUTCHours() * 60 + d.getUTCMinutes()
  return m >= AT[role] && m < LATE && (role !== 'parent' || d.getUTCDay() === 0)
}

// ── Firebase ──
let TOKEN = ''
async function accessToken(sa) {
  const now = Math.floor(Date.now() / 1000)
  const h = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const aud = sa.token_uri || 'https://oauth2.googleapis.com/token'
  const c = b64u(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email', aud, iat: now, exp: now + 3600 }))
  let sig
  try {
    sig = crypto.sign('sha256', Buffer.from(`${h}.${c}`), sa.private_key)
  } catch {
    throw new Msg('FIREBASE_SA 裡的私鑰讀不出來：請重新下載服務帳戶金鑰，整份貼到 GitHub Secrets')
  }
  const r = await fetch(aud, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${h}.${c}.${b64u(sig)}` }), signal: AbortSignal.timeout(15000) })
  if (!r.ok) throw new Msg(`服務帳戶換不到權杖（HTTP ${r.status}）：檢查 GitHub Secrets 的 FIREBASE_SA 是不是整份 JSON`)
  return (await r.json()).access_token
}
async function db(method, path, body, query = '') {
  const q = [query, TOKEN ? 'access_token=' + encodeURIComponent(TOKEN) : ''].filter(Boolean).join('&')
  const r = await fetch(`${DB}/${path}.json${q ? '?' + q : ''}`, { method, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) })
  if (!r.ok) throw new Msg(`資料庫 ${method} 失敗（HTTP ${r.status}）`)
  return r.json()
}
const byKey = (q) => `orderBy=${encodeURIComponent('"$key"')}&${q}`
const byKeyFrom = (from) => byKey(`startAt=${encodeURIComponent(JSON.stringify(String(from)))}`)

// ── 題庫（錯題本要跟 App 一樣：已經不在題庫裡的題目不算） ──
let KNOWN
async function known() {
  if (KNOWN !== undefined) return KNOWN
  try {
    const c = await import('../../content.js')
    KNOWN = new Set()
    for (const mid of c.LESSONS.flatMap((l) => l.modules)) {
      let L = 0
      for (const it of c.MODULES[mid].items) KNOWN.add(it.t === 'learn' ? `${mid}-L${++L}` : it.id)
    }
  } catch {
    KNOWN = null // 讀不到題庫：全部的題目都算（少數情況會多提醒一次，不會少提醒）
  }
  return KNOWN
}

// ── 班級、學生的資料（同一次執行裡共用） ──
async function loadClass(c) {
  const ks = ['owner', 'members', 'blocked', 'students', 'hw', 'notify', 'notifyRun']
  const v = await Promise.all(ks.map((k) => db('GET', `classes/${c}/${k}`)))
  const o = Object.fromEntries(ks.map((k, i) => [k, v[i]]))
  return { owner: o.owner || '', members: o.members || {}, blocked: o.blocked || {}, students: o.students || {}, hw: o.hw || {}, notify: o.notify === true, notifyRun: +o.notifyRun || 0 }
}
const STU = {}
function stu(c, sid) {
  return (STU[`${c}/${sid}`] ||= (async () => {
    const since = dayStart() - 7 * DAY
    // 作答只抓最近 8 天（key 開頭是時間）＋最後一筆（算幾天沒練）；練習紀錄筆數少，全部抓（作業要看派出後有沒有做）
    const [a, s, lastA] = await Promise.all([db('GET', `classes/${c}/a/${sid}`, undefined, byKeyFrom(since)), db('GET', `classes/${c}/s/${sid}`), db('GET', `classes/${c}/a/${sid}`, undefined, byKey('limitToLast=1'))])
    const att = Object.values(a || {}).filter((x) => x && x.ts >= since).sort((x, y) => x.ts - y.ts)
    const sess = Object.values(s || {}).filter((x) => x && x.ts).sort((x, y) => x.ts - y.ts)
    const real = sess.filter((x) => !PLANT.has(x.k))
    const last = Math.max(0, ...Object.values(lastA || {}).map((x) => x?.ts || 0), ...att.map((x) => x.ts), ...real.map((x) => x.ts))
    let book
    // 錯題本清空了沒（作業裡有「錯題本複習」、派出後又還沒做過才需要；要全部的作答，用到才抓，一次執行最多一次）
    const bookEmpty = async () => {
      if (book !== undefined) return book
      const K = await known()
      const all = Object.values((await db('GET', `classes/${c}/a/${sid}`)) || {}).filter((x) => x && x.q && (!K || K.has(x.q)))
      const by = {}
      for (const x of all.sort((p, q) => p.ts - q.ts)) (by[x.q] ||= []).push(x)
      book = !Object.values(by).some((list) => {
        const lw = list.filter((x) => x.r !== 'ok').pop()
        if (!lw) return false
        const oks = list.filter((x) => x.ts > lw.ts && x.r === 'ok' && x.x !== 'r') // 看完解析馬上再試一次答對的，不算畢業
        return !(oks.length >= 3 || (oks.length >= 2 && oks[oks.length - 1].ts - oks[0].ts >= 8 * 3600000))
      })
      return book
    }
    return { att, sess, real, last, bookEmpty }
  })())
}
// 作業的完成狀況（跟 App 的 hwStatus 一樣：派出之後有沒有那個練習的紀錄；錯題本已經清空也算）
const hwKey = (t) => (t.k === 'mod' ? 'm:' + t.id : t.k)
async function hwStatus(h, st) {
  let done = 0
  let lastTs = 0
  const tasks = (h.tasks || []).filter((t) => t && t.k)
  for (const t of tasks) {
    const hit = st.sess.filter((s) => s.k === hwKey(t) && s.ts >= h.at && (!t.ex || (s.ex || 'e1') === t.ex))
    const s = hit[hit.length - 1]
    if (s) lastTs = Math.max(lastTs, s.ts)
    if (s || (t.k === 'book' && (t.n0 === 0 || (await st.bookEmpty())))) done++
  }
  return { done, total: tasks.length, all: tasks.length > 0 && done === tasks.length, lastTs }
}
// 最近 21 天派的作業（新的在前）：更早的不管了（老師可能忘了刪）
const hwList = (cl, sid) =>
  Object.values(cl.hw[sid] || {})
    .filter((h) => h && Array.isArray(h.tasks) && h.kind !== 'note' && h.at >= NOW - 21 * DAY)
    .sort((a, b) => b.at - a.at)
const clip = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s))
const clock = (t) => {
  const d = tw(t)
  const h = d.getUTCHours()
  const m = d.getUTCMinutes()
  if (h === 23 && m === 59) return '晚上 12 點'
  return `${h < 12 ? '上午' : h < 18 ? '下午' : '晚上'} ${h % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : ' 點'}`
}
const dueWord = (t) => {
  const d = Math.round((dayStart(t) - dayStart()) / DAY)
  return `${d === 0 ? '今天' : d === 1 ? '明天' : `${tw(t).getUTCMonth() + 1}/${tw(t).getUTCDate()}`}${clock(t)}`
}
const listNames = (arr, n = 3) => (arr.length > n ? `${arr.slice(0, n).join('、')} 等 ${arr.length} 位` : arr.join('、'))

// ── 三種通知的內容（null＝今天不用發） ──
async function studentMsg(c, cl, sid) {
  const st = await stu(c, sid)
  const t0 = dayStart()
  const today = st.att.some((a) => a.ts >= t0) || st.real.some((s) => s.ts >= t0)
  const open = []
  for (const h of hwList(cl, sid)) {
    const s = await hwStatus(h, st)
    if (!s.all) open.push({ h, s })
  }
  const left = open.reduce((n, x) => n + x.s.total - x.s.done, 0)
  const soon = open.filter((x) => x.h.due && x.h.due >= NOW - 2 * DAY && x.h.due - NOW < 36 * 3600000).sort((a, b) => a.h.due - b.h.due)[0]
  if (today && !soon) return null
  if (left) {
    const late = soon && soon.h.due < NOW
    return {
      title: late ? '作業過期限了' : soon ? '作業快到期了' : '老師的作業還沒做完',
      body: `還剩 ${left} 項${late ? '，現在補做也可以' : soon ? `，${dueWord(soon.h.due)}前要完成` : ''}。點這裡直接開始。`,
      url: './#/',
    }
  }
  // 今天還沒練、也沒有作業：很久沒練的學生每 3 天提醒一次就好（不要天天吵，學生才不會把通知關掉）
  const idle = daysAgo(st.last || cl.students[sid]?.at || NOW)
  if (idle >= 7 && idle % 3) return null
  let streak = 0
  for (let d = 1; d <= 7; d++) {
    const a = t0 - d * DAY
    if (!st.att.some((x) => x.ts >= a && x.ts < a + DAY) && !st.real.some((x) => x.ts >= a && x.ts < a + DAY)) break
    streak++
  }
  return {
    title: '今天還沒練英文',
    body: streak >= 7 ? '已經連續練習一週以上了，今天做一組就能接下去！' : streak >= 2 ? `已經連續練習 ${streak} 天了，今天做一組就能接下去！` : '做一組就好，幾分鐘就能完成。點這裡開始。',
    url: './#/',
  }
}
async function parentMsg(c, cl, sid) {
  const st = await stu(c, sid)
  const since = dayStart() - 6 * DAY // 這 7 天＝今天加前 6 個日曆天
  const week = st.att.filter((a) => a.ts >= since)
  const ok = week.filter((a) => a.r === 'ok').length
  const days = new Set([...week.map((a) => dayStart(a.ts)), ...st.real.filter((s) => s.ts >= since).map((s) => dayStart(s.ts))]).size
  const h = hwList(cl, sid).find((x) => x.at >= since || (x.due && x.due >= NOW))
  let hw = ''
  if (h) {
    const s = await hwStatus(h, st)
    hw = `作業「${clip(h.title || '作業', 14)}」${s.all ? '全部完成' : `完成 ${s.done}／${s.total}`}。`
  }
  const name = clip(cl.students[sid]?.name || '孩子', 12)
  const nums = week.length ? `練習 ${days} 天、${week.length} 題，答對 ${Math.round((ok / week.length) * 100)}%。` : days ? `練習了 ${days} 天。` : '這週還沒有練習紀錄。'
  return { title: `${name}這週的英文練習`, body: `${nums}${hw}點開看學習進度。`, url: './#/live/home' }
}
async function teacherMsg(c, cl) {
  const t0 = dayStart()
  const did = []
  const hwDone = []
  const idle = []
  for (const [sid, s] of Object.entries(cl.students)) {
    const st = await stu(c, sid)
    const name = clip(s?.name || '學生', 10)
    const n = st.att.filter((a) => a.ts >= t0).length
    if (n || st.real.some((x) => x.ts >= t0)) did.push(n ? `${name} ${n} 題` : name)
    for (const h of hwList(cl, sid)) {
      const hs = await hwStatus(h, st)
      if (hs.all && hs.lastTs >= t0) {
        hwDone.push(name)
        break
      }
    }
    const d = st.last ? daysAgo(st.last) : null
    if ([5, 7, 14].includes(d)) idle.push(`${name} ${d} 天沒練習`) // 只在第 5、7、14 天提一次，不要每天重複
  }
  if (!did.length && !hwDone.length && !idle.length) return null
  const parts = []
  if (did.length) parts.push(listNames(did))
  if (hwDone.length) parts.push(`${listNames(hwDone)}的作業做完了`)
  if (idle.length) parts.push(listNames(idle, 2))
  return { title: did.length ? `今天 ${did.length} 位學生有練習` : '今天沒有學生練習', body: parts.join('；') + '。', url: './#/students' }
}
const TEST_MSG = { title: '測試通知', body: '通知設定好了：之後每天晚上 9 點會收到今天的學生摘要。', url: './#/students' }

const keyLen = (s, n) => {
  try {
    return ub64(s).length === n
  } catch {
    return false
  }
}
function problem(cl, uid, rec) {
  if (!rec || typeof rec.e !== 'string' || typeof rec.p !== 'string' || typeof rec.a !== 'string') return 'bad'
  if (!keyLen(rec.p, 65) || !keyLen(rec.a, 16)) return 'bad'
  let host = ''
  const allowLocal = LOCAL && process.env.PUSH_ALLOW_LOCAL === '1'
  try {
    const u = new URL(rec.e)
    host = u.protocol === 'https:' || (allowLocal && u.protocol === 'http:') ? u.hostname : ''
  } catch {}
  if (!host || !(PUSH_HOST.test(host) || (allowLocal && host === '127.0.0.1'))) return 'bad'
  if (rec.role === 'teacher') return cl.owner && cl.owner === uid ? '' : 'gone'
  const m = cl.members[uid]
  if (!m || cl.blocked[uid] || m.role !== rec.role || m.sid !== rec.sid || !cl.students[rec.sid]) return 'gone'
  return ''
}

async function main() {
  const roles = ['student', 'parent', 'teacher'].filter(due)
  const out = { 模式: MODE, 時間: tw(NOW).toISOString().slice(0, 16).replace('T', ' '), 要發: roles.join('、') || '（現在沒有要發的）', 訂閱: 0, 已發: 0, 不用發: 0, 已經處理過: 0, 金鑰舊了: 0, 重複刪除: 0, 失效刪除: 0, 失敗: 0, 狀態碼: {} }
  if (!roles.length) return console.log(JSON.stringify(out))
  // 排程上線了、老師還沒把服務帳戶貼到 GitHub：先安靜跳過（不要每 30 分鐘寄一封失敗通知）；手動執行才報錯
  if (!LOCAL && !process.env.FIREBASE_SA && MODE === 'run') return console.log('還沒設定 FIREBASE_SA（GitHub Secrets），先不發')
  const priv = process.env.VAPID_PRIVATE || ''
  if (MODE !== 'dry' && !priv) throw new Msg('沒有 VAPID_PRIVATE（GitHub Secrets）')
  let keys = null
  if (priv)
    try {
      keys = vapidKeys(priv)
    } catch {
      throw new Msg('VAPID_PRIVATE 的格式不對')
    }
  if (keys && !LOCAL) {
    // 金鑰跟 App 裡的公鑰要是一對（不然手機收不到）
    const app = readFileSync(new URL('../../app.js', import.meta.url), 'utf8')
    const pub = (app.match(/const PUSH_KEY = '([^']+)'/) || [])[1]
    if (pub !== keys.pub) throw new Msg('VAPID_PRIVATE 跟 app.js 的 PUSH_KEY 不是一對')
  }
  if (!LOCAL) {
    if (!process.env.FIREBASE_SA) throw new Msg('沒有 FIREBASE_SA（GitHub Secrets）')
    let sa
    try {
      sa = JSON.parse(process.env.FIREBASE_SA)
    } catch {
      throw new Msg('FIREBASE_SA 不是完整的 JSON：請把下載的金鑰檔整份複製，重新貼到 GitHub Secrets')
    }
    if (!sa?.client_email || !sa?.private_key) throw new Msg('FIREBASE_SA 少了 client_email 或 private_key：請貼「服務帳戶」的金鑰檔')
    TOKEN = await accessToken(sa)
  }
  const day = ymd()
  const all = (await db('GET', 'push')) || {}
  const sentLog = MODE === 'run' ? (await db('GET', `pushlog/${day}`)) || {} : {}
  const logged = (c, uid, dev, role) => sentLog?.[c]?.[uid]?.[dev]?.[role] !== undefined
  const dels = []
  const outList = []
  // 整理所有訂閱：同一支手機（同一個推播位址）只留最新的一筆；一個身分最多留 MAX_DEVS 台
  const subs = []
  for (const [c, users] of Object.entries(all)) {
    if (!/^[a-z0-9]{16,40}$/.test(c) || !users || typeof users !== 'object') continue
    for (const [uid, devs] of Object.entries(users)) {
      const list = Object.entries(devs || {})
        .filter(([, rec]) => rec && typeof rec === 'object')
        .sort((a, b) => (+b[1].at || 0) - (+a[1].at || 0))
      list.forEach(([dev, rec], i) => (i < MAX_DEVS ? subs.push({ c, uid, dev, rec }) : dels.push(`push/${c}/${uid}/${dev}`)))
    }
  }
  out.訂閱 = subs.length
  subs.sort((a, b) => (+b.rec.at || 0) - (+a.rec.at || 0))
  const seenEp = new Set()
  const byClass = {}
  for (const s of subs) {
    if (seenEp.has(s.rec.e)) {
      out.重複刪除++
      dels.push(`push/${s.c}/${s.uid}/${s.dev}`)
      continue
    }
    seenEp.add(s.rec.e)
    ;(byClass[s.c] ||= []).push(s)
  }
  const mark = (c, uid, dev, role, v) => db('PATCH', `pushlog/${day}`, { [`${c}/${uid}/${dev}/${role}`]: v })
  for (const [c, list] of Object.entries(byClass)) {
    // 這個班級要處理的都處理過了：連班級資料都不用抓（省下載量）
    if (MODE === 'run' && list.every(({ uid, dev, rec }) => !roles.includes(rec.role) || logged(c, uid, dev, rec.role))) {
      out.已經處理過 += list.filter(({ rec }) => roles.includes(rec.role)).length
      out.不用發 += list.filter(({ rec }) => !roles.includes(rec.role)).length
      continue
    }
    try {
      const cl = await loadClass(c)
      const msgs = {}
      const none = {} // 今天判斷過、不用發：一次寫進 pushlog（值 0）
      for (const { uid, dev, rec } of list) {
        if (problem(cl, uid, rec)) {
          out.失效刪除++
          dels.push(`push/${c}/${uid}/${dev}`)
          continue
        }
        const role = rec.role
        if (!roles.includes(role) || (role !== 'teacher' && !cl.notify)) {
          out.不用發++
          continue
        }
        if (logged(c, uid, dev, role)) {
          out.已經處理過++
          continue
        }
        // 金鑰換過了：這台下次打開 App 會自己重新訂閱，現在發也收不到
        if (keys && rec.k && rec.k !== keys.pub.slice(0, 16)) {
          out.金鑰舊了++
          continue
        }
        const mk = `${role}/${rec.sid || ''}`
        const msg = MODE === 'test' ? TEST_MSG : await (msgs[mk] ||= role === 'student' ? studentMsg(c, cl, rec.sid) : role === 'parent' ? parentMsg(c, cl, rec.sid) : teacherMsg(c, cl))
        if (!msg) {
          out.不用發++
          if (MODE === 'run') none[`${c}/${uid}/${dev}/${role}`] = 0
          continue
        }
        const payload = { ...msg, tag: MODE === 'test' ? 'test' : 'daily-' + role }
        if (MODE === 'dry') {
          out.已發++
          outList.push({ c, uid, dev, role, msg: payload, code: 0 })
          continue
        }
        if (MODE === 'run') await mark(c, uid, dev, role, NOW) // 先記再發
        let code = 0
        try {
          code = await sendPush(rec, payload, keys, { sub: SUBJECT, ttl: TTL[MODE === 'test' ? 'test' : role] })
        } catch {
          code = -1 // 逾時或連不上：不知道送到沒，保留紀錄（不重發）
        }
        out.狀態碼[code] = (out.狀態碼[code] || 0) + 1
        outList.push({ c, uid, dev, role, msg: payload, code })
        if (code >= 200 && code < 300) out.已發++
        else if (code === 404 || code === 410) {
          out.失效刪除++
          dels.push(`push/${c}/${uid}/${dev}`)
        } else {
          out.失敗++
          // 推播服務明確說失敗（不是逾時）：拿掉紀錄，下一輪再試
          if (MODE === 'run' && code > 0) await mark(c, uid, dev, role, null).catch(() => {})
        }
      }
      if (MODE === 'run' && Object.keys(none).length) await db('PATCH', `pushlog/${day}`, none)
      // 老師的 App 用這個知道排程還有在跑（停了會提醒）
      if (MODE === 'run' && NOW - cl.notifyRun > 6 * 3600000) await db('PUT', `classes/${c}/notifyRun`, NOW)
    } catch (e) {
      out.失敗++ // 一個班級出錯不要拖垮其他班級
      console.error('有一個班級沒處理完：' + (e instanceof Msg ? e.message : e?.name || 'Error'))
    }
  }
  if (MODE === 'run') {
    for (const p of dels) await db('DELETE', p).catch(() => {})
    // 發送紀錄只留 8 天
    const days = Object.keys((await db('GET', 'pushlog', undefined, 'shallow=true').catch(() => null)) || {})
    for (const d of days) if (/^\d{4}-\d\d-\d\d$/.test(d) && d < ymd(NOW - 8 * DAY)) await db('DELETE', `pushlog/${d}`).catch(() => {})
  }
  if (process.env.PUSH_OUT && LOCAL) writeFileSync(process.env.PUSH_OUT, JSON.stringify({ out, list: outList }))
  console.log(JSON.stringify(out))
  if (out.失敗 && !out.已發) process.exitCode = 1 // 全部失敗：讓 GitHub 寄信通知
}

main().catch((e) => {
  console.error('發通知失敗：' + (e instanceof Msg ? e.message : `（${e?.name || 'Error'}）`))
  process.exitCode = 1
})
