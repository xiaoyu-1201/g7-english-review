// 畫筆（2.28，老師 10/17「畫筆模式可以」）：Apple Pencil 直接在重點卡、題目卡上寫，像 Goodnotes
// 從試寫頁（pen-test.html）搬進來。筆跡存在這台裝置（localStorage，學生模式分開存），存「卡片寬度的比例」，轉向、換視窗會跟著卡片縮放
// 用法：initPen({ key }) 一次就好；之後畫面換了（換頁、開視窗、題目卡放進來）MutationObserver 會自己幫 .pen-target[data-ink] 畫上筆跡，不用再呼叫
import { getStroke } from './vendor/perfect-freehand.mjs'

const TOOLS = { black: 'pen', red: 'pen', blue: 'pen', hl: 'hl' }
const SIZES = [
  { k: '細', pen: 2.2, hl: 12, bar: 2 },
  { k: '中', pen: 3.2, hl: 18, bar: 4 },
  { k: '粗', pen: 4.8, hl: 26, bar: 7 },
]
const TAPPABLE = 'button, a, input, select, textarea, [role="button"], [role="radio"]'
const TAP_MOVE = 8 // px：移動超過這個距離就算在寫字
const TAP_MS = 400
const PALM_MS = 350 // 筆正在寫或剛離開螢幕：手指／手掌碰到卡片上的按鈕不算（code review：太長會吃掉真的點擊）
const MAX_STROKES = 80 // 一張卡最多留幾筆（超過丟最舊的；筆跡跟作答紀錄共用同一個 5MB 的儲存空間）
const MAX_KEYS = 400 // 最多幾張卡有筆跡
const FIELD = 'input, textarea, select, [contenteditable]' // 輸入框：筆點下去要能打字、能用 iPad 的手寫輸入，不攔
const NS = 'http://www.w3.org/2000/svg'
const r4 = (n) => Math.round(n * 1000) / 1000 // 卡片寬度的千分之一（400px 的卡＝0.4px），夠細，存檔小一些
const $ = (s, r = document) => r.querySelector(s)
const $$ = (s, r = document) => [...r.querySelectorAll(s)]
const okStroke = (s) => s && (s.t === 'pen' || s.t === 'hl') && Number.isFinite(s.w) && Array.isArray(s.p) && s.p.length > 0 && s.p.every((q) => Array.isArray(q) && q.length >= 2 && q.every(Number.isFinite))

let KEY = 'g7review:ink'
let ink = {}
const undo = []
let cur = null // 正在畫的這一筆
let erasing = null
const st = { on: false, tool: 'black', lastPen: 'black', finger: false, size: 1, ready: false }
let bar = null
let fab = null
let ro = null
let onChange = null // 外面想知道有沒有筆跡（例如列印）可以掛

function load() {
  ink = {}
  try {
    const raw = localStorage.getItem(KEY)
    let d = {}
    try {
      d = JSON.parse(raw || '{}')
    } catch {
      localStorage.setItem(`${KEY}:bad`, raw) // 讀不懂的原文留一份（只留最新一份，不要越積越多）
    }
    if (d && typeof d === 'object' && !Array.isArray(d)) for (const [k, l] of Object.entries(d)) if (Array.isArray(l)) ink[k] = l.filter(okStroke)
  } catch {}
}
let savedT
function save() {
  refreshUndo()
  // 上限：一張卡最多 MAX_STROKES 筆、最多 MAX_KEYS 張卡（超過丟最舊的）
  for (const [k, l] of Object.entries(ink)) {
    if (!l?.length) delete ink[k]
    else if (l.length > MAX_STROKES) ink[k] = l.slice(-MAX_STROKES)
  }
  const keys = Object.keys(ink)
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_KEYS))) delete ink[k]
  try {
    localStorage.setItem(KEY, JSON.stringify(ink))
    const el = $('.pen-saved', bar)
    if (el) {
      el.classList.add('show')
      clearTimeout(savedT)
      savedT = setTimeout(() => el.classList.remove('show'), 1200)
    }
  } catch {
    const w = $('.pen-warn', bar)
    if (w) w.hidden = false
    setOn(true)
  }
  onChange?.()
}

// ── 畫出來：perfect-freehand 把筆的點變成墨水的外框（有粗細變化、頭尾自然） ──
const avg = (a, b) => (a + b) / 2
function svgPath(pts) {
  if (pts.length < 4) return ''
  let a = pts[0]
  let b = pts[1]
  const c = pts[2]
  let d = `M${a[0].toFixed(2)},${a[1].toFixed(2)} Q${b[0].toFixed(2)},${b[1].toFixed(2)} ${avg(b[0], c[0]).toFixed(2)},${avg(b[1], c[1]).toFixed(2)} T`
  for (let i = 2; i < pts.length - 1; i++) {
    a = pts[i]
    b = pts[i + 1]
    d += `${avg(a[0], b[0]).toFixed(2)},${avg(a[1], b[1]).toFixed(2)} `
  }
  return d + 'Z'
}
function strokeD(s, W, last = true) {
  const pts = s.p.map(([x, y, p]) => [x * W, y * W, p])
  const size = s.w * W
  const opt =
    s.t === 'hl'
      ? { size, thinning: 0, smoothing: 0.6, streamline: 0.65, simulatePressure: false, last }
      : { size, thinning: 0.62, smoothing: 0.6, streamline: 0.42, simulatePressure: !s.pr, start: { taper: s.pr ? 0 : 6, cap: true }, end: { taper: s.pr ? 0 : 10, cap: true }, last }
  return svgPath(getStroke(pts, opt))
}
function layers(block) {
  let hl = $(':scope > .ink.hl', block)
  let pen = $(':scope > .ink.pen', block)
  if (!hl) {
    hl = document.createElementNS(NS, 'svg')
    hl.setAttribute('class', 'ink hl')
    hl.setAttribute('aria-hidden', 'true')
    pen = document.createElementNS(NS, 'svg')
    pen.setAttribute('class', 'ink pen')
    pen.setAttribute('aria-hidden', 'true')
    block.append(hl, pen)
  }
  return { hl, pen }
}
const colorOf = (s) => s.k || (s.t === 'hl' ? 'hl' : 'black')
function pathEl(s, W) {
  const el = document.createElementNS(NS, 'path')
  el.setAttribute('d', strokeD(s, W))
  el.style.fill = `var(--ink-${colorOf(s)})`
  return el
}
const box = (block) => layers(block).pen.getBoundingClientRect()
function render(block, force = false) {
  if (!block?.isConnected) return
  const W = box(block).width
  if (!W) return
  const { hl, pen } = layers(block)
  // 筆跡沒變、寬度沒變：不重畫（code review：重畫會動到 DOM，觀察器又來一次 → 停不下來）
  const list = ink[block.dataset.ink] || []
  const sig = `${Math.round(W)}|${list.length}|${list === block.__penList}`
  if (!force && block.__penSig === sig && cur?.block !== block) return
  block.__penSig = sig
  block.__penList = list
  hl.replaceChildren()
  pen.replaceChildren()
  for (const s of list) {
    try {
      ;(s.t === 'hl' ? hl : pen).append(pathEl(s, W))
    } catch {}
  }
  if (cur?.block === block) (cur.s.t === 'hl' ? hl : pen).append(cur.el)
}
// 筆跡改了（寫、擦、復原）：這張卡一定要重畫
const redraw = (block) => render(block, true)
const blocks = () => $$('.pen-target[data-ink]')
// 畫面換了：幫新出現的卡片畫上筆跡；有卡片可以寫才顯示右下角的筆
export function penAttach(root = document) {
  if (!st.ready) return
  const list = root.matches?.('.pen-target[data-ink]') ? [root, ...$$('.pen-target[data-ink]', root)] : $$('.pen-target[data-ink]', root)
  for (const b of list) {
    render(b)
    ro?.observe(b)
    if (!b.__penTouch) {
      b.__penTouch = true
      // Apple Pencil 在卡片上：不要捲動頁面（手指照常捲動）；只擋 touchmove（擋 touchstart 的話 iPad 不會送 click，筆點選項會沒反應）
      b.addEventListener('touchmove', (e) => (stylus(e) || cur) && e.preventDefault(), { passive: false })
    }
  }
  refreshFab()
}
export const penHas = (key) => !!ink[key]?.length
function refreshFab() {
  if (!fab) return
  fab.hidden = st.on || !blocks().length
}
const stylus = (e) => [...e.touches].some((t) => t.touchType === 'stylus')

// ── 輸入 ──
// Apple Pencil 隨時都能寫（不用先按筆）；手指只有開了「用手指畫」才寫；電腦的滑鼠要先按筆
const canDraw = (e) => e.pointerType === 'pen' || (st.on && (e.pointerType === 'mouse' || (st.finger && e.pointerType === 'touch')))
let swallowUntil = 0
let swallowBlock = null
let lastPenT = -1e9
let lastDownType = ''
function pt(e, rect) {
  const W = rect.width
  return [r4((e.clientX - rect.left) / W), r4((e.clientY - rect.top) / W), e.pointerType === 'pen' ? r4(e.pressure || 0.5) : 0.5]
}
const events = (e) => {
  const ces = e.getCoalescedEvents?.()
  return ces?.length ? ces : [e]
}
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const L = dx * dx + dy * dy
  const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}
function eraseAt(e) {
  const { block, removed } = erasing
  const rect = box(block)
  const W = rect.width
  const list = ink[block.dataset.ink] || []
  let changed = false
  for (const ce of events(e)) {
    const x = ce.clientX - rect.left
    const y = ce.clientY - rect.top
    const [lx, ly] = erasing.last || [x, y]
    erasing.last = [x, y]
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i]
      const r = (s.w * W) / 2 + 10
      const hit = s.p.some((a, j) => {
        const b = s.p[j + 1] || a
        for (let k = 0; k <= 4; k++) {
          const ex = lx + ((x - lx) * k) / 4
          const ey = ly + ((y - ly) * k) / 4
          if (segDist(ex, ey, a[0] * W, a[1] * W, b[0] * W, b[1] * W) < r) return true
        }
        return false
      })
      if (hit) {
        removed.push(s)
        list.splice(i, 1)
        changed = true
      }
    }
  }
  if (changed) redraw(block)
}
function dropCur() {
  if (!cur) return
  cancelAnimationFrame(cur.raf)
  cur.el.remove()
  cur = null
}
function onDown(e) {
  lastDownType = e.pointerType
  if (e.pointerType === 'pen') {
    lastPenT = performance.now()
    if (cur && cur.s.pr === 0) dropCur()
    if (st.finger) setFinger(false)
  }
  if (!canDraw(e) || e.button > 0 || cur || erasing) return
  const block = e.target.closest('.pen-target[data-ink]')
  if (!block) return
  if (e.target.closest(FIELD)) return // 輸入框：讓它拿到焦點（打字、手寫輸入）
  const tap = !!e.target.closest(TAPPABLE)
  if (!tap) e.preventDefault() // 按鈕上不擋：筆點一下就是按它（擋掉會拿不到 click）
  try {
    block.setPointerCapture(e.pointerId) // 筆滑出卡片外也收得到放開
  } catch {}
  if (!st.on && !tap) setOn(true)
  if (st.tool === 'eraser') {
    erasing = { block, removed: [], id: e.pointerId, last: null }
    return eraseAt(e)
  }
  const rect = box(block)
  const t = TOOLS[st.tool]
  const size = SIZES[st.size]
  const s = { t, k: st.tool, w: r4((t === 'hl' ? size.hl : size.pen) / rect.width), pr: e.pointerType === 'pen' ? 1 : 0, p: [pt(e, rect)] }
  const { hl, pen } = layers(block)
  const el = pathEl(s, rect.width)
  ;(t === 'hl' ? hl : pen).append(el)
  cur = { block, s, el, rect, id: e.pointerId, raf: 0, x0: e.clientX, y0: e.clientY, t0: performance.now(), tap, moved: false }
}
function onMove(e) {
  if (e.pointerType === 'pen' && e.buttons) lastPenT = performance.now()
  if (erasing && e.pointerId === erasing.id) return eraseAt(e)
  if (!cur || e.pointerId !== cur.id) return
  if (!cur.moved && Math.hypot(e.clientX - cur.x0, e.clientY - cur.y0) > TAP_MOVE) {
    cur.moved = true
    if (!st.on) setOn(true)
  }
  cur.rect = box(cur.block)
  for (const ce of events(e)) cur.s.p.push(pt(ce, cur.rect))
  if (!cur.raf)
    cur.raf = requestAnimationFrame(() => {
      if (!cur) return
      cur.raf = 0
      cur.el.setAttribute('d', strokeD(cur.s, cur.rect.width, false))
    })
}
function end(e) {
  if (e.pointerType === 'pen') lastPenT = performance.now()
  if (erasing && e.pointerId === erasing.id) {
    if (erasing.removed.length) {
      undo.push({ k: 'del', key: erasing.block.dataset.ink, list: erasing.removed })
      save()
    }
    swallowUntil = performance.now() + 400
    swallowBlock = erasing.block
    erasing = null
    return
  }
  if (!cur || e.pointerId !== cur.id) return
  const { block, s, el, tap, moved, t0 } = cur
  if (tap && !moved && performance.now() - t0 < TAP_MS) return dropCur() // 筆點一下按鈕＝按它
  if (e.type === 'pointercancel' && (s.pr === 0 || !moved)) return dropCur()
  cancelAnimationFrame(cur.raf)
  cur = null
  el.setAttribute('d', strokeD(s, box(block).width))
  ;(ink[block.dataset.ink] ||= []).push(s)
  undo.push({ k: 'add', key: block.dataset.ink, s })
  save()
  swallowUntil = performance.now() + 400
  swallowBlock = block
}
function onClick(e) {
  const inCard = e.target.closest?.('.pen-target[data-ink]')
  const stop = () => {
    e.preventDefault()
    e.stopPropagation()
  }
  if (e.isTrusted && performance.now() < swallowUntil && swallowBlock?.contains(e.target)) {
    swallowUntil = 0
    return stop()
  }
  if (e.isTrusted && inCard && lastDownType === 'touch' && !st.finger && (cur || performance.now() - lastPenT < PALM_MS)) stop()
}

// ── 工具列 ──
const ICON = {
  pen: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L18.5 9.5a2.83 2.83 0 0 0-4-4L4 16v4"/><path d="M13.5 6.5l4 4"/></svg>',
  eraser: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 20H8.5l-4.21-4.3a1 1 0 0 1 0-1.41l10-10a1 1 0 0 1 1.41 0l5 5a1 1 0 0 1 0 1.41L11.5 20"/><path d="M18 13.3L11.7 7"/></svg>',
  undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
  clear: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
  finger: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 13V5a2 2 0 0 1 4 0v7"/><path d="M12 12V6a2 2 0 0 1 4 0v6"/><path d="M16 11a2 2 0 0 1 4 0v3a7 7 0 0 1-7 7h-1a7 7 0 0 1-6-3.3L3.5 13a2 2 0 0 1 3.4-2L8 13"/></svg>',
}
function buildUI() {
  fab = document.createElement('button')
  fab.className = 'pen-fab'
  fab.type = 'button'
  fab.setAttribute('aria-label', '畫筆')
  fab.innerHTML = ICON.pen
  fab.hidden = true
  bar = document.createElement('div')
  bar.className = 'pen-bar'
  bar.setAttribute('role', 'toolbar')
  bar.setAttribute('aria-label', '畫筆工具')
  bar.hidden = true
  bar.innerHTML = `
    <button type="button" data-tool="black" aria-label="黑筆" aria-pressed="true"><span class="dot" style="--c: var(--ink-black)"></span></button>
    <button type="button" data-tool="red" aria-label="紅筆" aria-pressed="false"><span class="dot" style="--c: var(--ink-red)"></span></button>
    <button type="button" data-tool="blue" aria-label="藍筆" aria-pressed="false"><span class="dot" style="--c: var(--ink-blue)"></span></button>
    <button type="button" data-tool="hl" aria-label="螢光筆" aria-pressed="false"><span class="hl-ic"></span><span class="txt">螢光筆</span></button>
    <button type="button" data-tool="eraser" aria-label="橡皮擦" aria-pressed="false">${ICON.eraser}<span class="txt">橡皮擦</span></button>
    <button type="button" data-size aria-label="粗細：中"><span class="size-ic" style="height: 4px"></span></button>
    <span class="sep" aria-hidden="true"></span>
    <button type="button" data-undo aria-label="復原">${ICON.undo}<span class="txt">復原</span></button>
    <button type="button" data-pen-clear aria-label="清除這一頁的筆跡">${ICON.clear}<span class="txt">清除</span></button>
    <button type="button" data-finger aria-label="用手指畫" aria-pressed="false">${ICON.finger}<span class="txt">用手指畫</span></button>
    <span class="pen-saved" aria-live="polite">已自動存好</span>
    <button type="button" class="done" data-done aria-label="收起工具列（Apple Pencil 還是可以直接寫）">收起</button>
    <p class="pen-warn" role="alert" hidden>這台裝置存不了筆跡（無痕模式或空間滿）：可以照常寫，但關掉就會不見。</p>`
  document.body.append(fab, bar)
  fab.onclick = () => setOn(true)
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('button')
    if (!b) return
    if (b.dataset.tool) return setTool(b.dataset.tool)
    if (b.hasAttribute('data-size')) {
      st.size = (st.size + 1) % SIZES.length
      const z = SIZES[st.size]
      b.setAttribute('aria-label', `粗細：${z.k}`)
      $('.size-ic', b).style.height = z.bar + 'px'
      if (st.tool === 'eraser') setTool(st.lastPen)
      return
    }
    if (b.hasAttribute('data-finger')) return setFinger(!st.finger)
    if (b.hasAttribute('data-undo')) return doUndo()
    if (b.hasAttribute('data-pen-clear')) {
      const keys = blocks().map((x) => x.dataset.ink)
      if (!keys.some((k) => ink[k]?.length) || !confirm('把這一頁的筆跡全部清掉？（按「復原」可以拿回來）')) return
      const prev = Object.fromEntries(keys.filter((k) => ink[k]?.length).map((k) => [k, ink[k]]))
      undo.push({ k: 'clear', prev })
      for (const k of keys) delete ink[k]
      blocks().forEach(redraw)
      return save()
    }
    if (b.hasAttribute('data-done')) return setOn(false)
  })
}
function setOn(on) {
  st.on = on
  document.body.classList.toggle('pen-on', on)
  if (bar) bar.hidden = !on
  refreshFab()
}
function setTool(t) {
  st.tool = t
  if (t !== 'eraser') st.lastPen = t
  $$('[data-tool]', bar).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === t)))
  document.body.classList.toggle('pen-eraser', t === 'eraser')
}
function setFinger(on) {
  st.finger = on
  $('[data-finger]', bar)?.setAttribute('aria-pressed', String(on))
  document.body.classList.toggle('pen-finger', on)
}
const refreshUndo = () => $('[data-undo]', bar)?.setAttribute('aria-disabled', String(!undo.length))
function doUndo() {
  const u = undo.pop()
  if (!u) return
  if (u.k === 'clear') {
    Object.assign(ink, u.prev)
    blocks().forEach(redraw)
    return save()
  }
  const list = (ink[u.key] ||= [])
  if (u.k === 'add') ink[u.key] = list.filter((s) => s !== u.s)
  else list.push(...u.list)
  redraw($(`.pen-target[data-ink="${CSS.escape(u.key)}"]`))
  save()
}
export function initPen({ key = 'g7review:ink', onChange: cb } = {}) {
  if (st.ready) return
  KEY = key
  onChange = cb
  load()
  buildUI()
  ro = new ResizeObserver((es) => es.forEach((e) => render(e.target)))
  document.addEventListener('pointerdown', onDown, { passive: false })
  document.addEventListener('pointermove', onMove)
  document.addEventListener('pointerup', end)
  document.addEventListener('pointercancel', end)
  document.addEventListener('lostpointercapture', end)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && cur) end({ type: 'pointerup', pointerId: cur.id, pointerType: '' })
  })
  document.addEventListener('click', onClick, true)
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && st.on && !e.target.closest?.(FIELD)) {
      if (!undo.length) return
      e.preventDefault()
      doUndo()
    }
  })
  st.ready = true
  refreshUndo()
  penAttach(document)
  // 畫面換了（換頁、開視窗、題目卡放進畫面、回顧的快照）：新出現的卡片自動畫上筆跡；卡片拿掉就把筆收起來
  // 只看「卡片本身」進出畫面；筆跡那層（svg）裡的變動一律不管（不然自己重畫又觸發自己，停不下來）
  const isCard = (n) => n.nodeType === 1 && (n.matches?.('.pen-target[data-ink]') || !!n.querySelector?.('.pen-target[data-ink]'))
  let t = 0
  new MutationObserver((list) => {
    let hit = false
    for (const r of list) {
      if (r.target.closest?.('.ink')) continue
      if ([...r.addedNodes, ...r.removedNodes].some(isCard)) hit = true
    }
    if (!hit) return
    cancelAnimationFrame(t)
    t = requestAnimationFrame(() => penAttach(document))
  }).observe(document.body, { childList: true, subtree: true })
}
