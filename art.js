// 圖：家族樹、位置場景（介系詞）、字母樓層。全部是 inline SVG，顏色走 CSS 變數（深色模式自動跟著變）

const emo = (x, y, ch, size = 34, cls = '') =>
  `<text class="emo ${cls}" x="${x}" y="${y}" font-size="${size}" text-anchor="middle" dominant-baseline="central">${ch}</text>`

// ───────── 家族樹 ─────────
const PEOPLE = {
  George: [150, 42, '👴'],
  Mary: [250, 42, '👵'],
  Peter: [60, 142, '👨'],
  Nina: [140, 142, '👩'],
  Lucy: [260, 142, '👩'],
  David: [340, 142, '👨'],
  Leo: [100, 242, '👦'],
  Kevin: [260, 242, '👦'],
  Ella: [340, 242, '👧'],
}

export function tree(focus = 'Kevin') {
  const line = (pts) => `<polyline class="tree-line" points="${pts}" />`
  const lines = [
    line('172,42 228,42'), // George — Mary
    line('82,142 118,142'), // Peter — Nina
    line('282,142 318,142'), // Lucy — David
    line('200,42 200,92'),
    line('60,92 260,92'),
    line('60,92 60,118'),
    line('260,92 260,118'),
    line('100,142 100,218'), // Peter & Nina → Leo
    line('300,142 300,192'),
    line('260,192 340,192'),
    line('260,192 260,218'),
    line('340,192 340,218'),
  ].join('')
  const nodes = Object.entries(PEOPLE)
    .map(([name, [x, y, e]]) => {
      const me = name === focus
      return `<g class="tree-node${me ? ' me' : ''}">
        <circle cx="${x}" cy="${y}" r="23" />
        ${emo(x, y + 1, e, 26)}
        <text class="tree-name" x="${x}" y="${y + 38}" text-anchor="middle">${name}</text>
      </g>`
    })
    .join('')
  return `<svg class="fig fig-tree" viewBox="0 0 400 296" role="img" aria-label="Kevin 的家族樹：George 和 Mary 是祖父母；他們的兒子 Peter 和太太 Nina 有兒子 Leo；他們的女兒 Lucy 和先生 David 有兒子 Kevin、女兒 Ella。">${lines}${nodes}</svg>`
}

// ───────── 位置場景 ─────────
const GROUND = 172
const S = 34 // 主角大小

function table() {
  return `<g class="obj">
    <rect class="wood" x="92" y="96" width="136" height="12" rx="4" />
    <rect class="wood-dark" x="104" y="108" width="10" height="${GROUND - 108}" rx="3" />
    <rect class="wood-dark" x="206" y="108" width="10" height="${GROUND - 108}" rx="3" />
  </g>`
}
// 打開的箱子（用在 in）：看得到裡面的深色內側＋往外翻的兩片蓋子
function boxBack(x, w = 70) {
  return `<polygon class="box-top" points="${x + 10},110 ${x},120 ${x - 20},103 ${x - 8},93" />
    <polygon class="box-top" points="${x + w - 10},110 ${x + w},120 ${x + w + 20},103 ${x + w + 8},93" />
    <polygon class="box-in" points="${x},120 ${x + 10},110 ${x + w - 10},110 ${x + w},120" />`
}
function boxFront(x, w = 70) {
  return `<g class="obj"><rect class="box" x="${x}" y="120" width="${w}" height="${GROUND - 120}" rx="5" />
    <line class="box-line" x1="${x + 8}" y1="134" x2="${x + w - 8}" y2="134" /></g>`
}
// 蓋起來的箱子（其他位置）：上面是淺色的蓋子＋膠帶
function box(x = 125, w = 70) {
  return `<g class="obj"><polygon class="box-top" points="${x},120 ${x + 10},110 ${x + w - 10},110 ${x + w},120" />
    <line class="box-tape" x1="${x + w / 2}" y1="110.5" x2="${x + w / 2}" y2="128" />${boxFront(x, w)}</g>`
}
function sofa() {
  return `<g class="obj">
    <rect class="sofa" x="98" y="104" width="124" height="42" rx="12" />
    <rect class="sofa-dark" x="90" y="136" width="140" height="${GROUND - 136}" rx="9" />
    <rect class="sofa" x="80" y="120" width="24" height="${GROUND - 120}" rx="9" />
    <rect class="sofa" x="216" y="120" width="24" height="${GROUND - 120}" rx="9" />
  </g>`
}

// 每個參考物：畫法＋每種位置的主角座標
const REFS = {
  table: {
    draw: table,
    pos: { on: [160, 78], under: [160, 150], next: [262, 154], near: [296, 154], above: [160, 46] },
  },
  box: {
    draw: () => box(),
    pos: { in: [160, 116], on: [160, 96], next: [228, 154], near: [286, 154], behind: [182, 103], front: [148, 180], above: [160, 56] },
  },
  boxes2: {
    draw: () => box(48, 64) + box(208, 64),
    pos: { between: [160, 154], on: [80, 96], next: [296, 154] },
  },
  sofa: {
    draw: sofa,
    pos: { on: [128, 122], behind: [192, 92], front: [160, 186], next: [270, 154] },
  },
}

export const REL_LABEL = {
  in: 'in', on: 'on', under: 'under', next: 'next to', near: 'near', between: 'between', front: 'in front of', behind: 'behind', above: 'above',
}

// 依位置決定圖層順序：behind 先畫主角；in（箱子）主角夾在箱子內側和正面之間
function compose(ref, rel, sub, cls = '') {
  const R = REFS[ref]
  if (!rel || !R.pos[rel]) return R.draw()
  const [x, y] = R.pos[rel]
  const s = emo(x, y, sub, rel === 'behind' ? S * 0.86 : S, cls)
  if (rel === 'behind') return s + R.draw()
  if (rel === 'in' && ref === 'box') return boxBack(125) + s + boxFront(125)
  return R.draw() + s
}

function floor() {
  return `<rect class="floor" x="0" y="${GROUND}" width="320" height="${210 - GROUND}" />`
}

export function scene({ ref, sub, rel }) {
  return `<svg class="fig fig-scene" viewBox="0 0 320 210" role="img" aria-label="${esc(sub)} 的位置">${floor()}${compose(ref, rel, sub)}</svg>`
}

// 放位置：可點的虛線圈；chosen＝學生點的；result＝批改後
export function placeScene({ ref, sub }, spots, chosen, result) {
  const R = REFS[ref]
  const rings = spots
    .map((k) => {
      const [x, y] = R.pos[k]
      let st = ''
      if (result) st = k === result.a ? ' ok' : k === chosen ? ' bad' : ''
      else if (k === chosen) st = ' sel'
      return `<g class="spot${st}" data-spot="${k}" tabindex="0" role="button" aria-label="${REL_LABEL[k]}">
        <circle cx="${x}" cy="${y}" r="24" />
      </g>`
    })
    .join('')
  const body = chosen ? compose(ref, chosen, sub, 'placed') : R.draw()
  return `<svg class="fig fig-scene place" viewBox="0 0 320 210" role="group">${floor()}${body}${rings}</svg>
    <div class="place-sub">${sub}</div>`
}

// 九個介系詞小圖
export function prepGrid() {
  const cells = [
    ['box', 'in', '🐱', 'in'],
    ['table', 'on', '🐱', 'on'],
    ['table', 'under', '🐱', 'under'],
    ['box', 'next', '🐱', 'next to'],
    ['box', 'near', '🐱', 'near'],
    ['boxes2', 'between', '🐱', 'between'],
    ['box', 'front', '🐱', 'in front of'],
    ['box', 'behind', '🐱', 'behind'],
    ['box', 'above', '🐦', 'above'],
  ]
  return `<div class="prep-grid">${cells
    .map(
      ([ref, rel, sub, label]) =>
        `<figure><svg class="fig fig-mini" viewBox="0 0 320 210" aria-hidden="true">${floor()}${compose(ref, rel, sub)}</svg><figcaption>${label}</figcaption></figure>`,
    )
    .join('')}</div>`
}

// ───────── 字母樓層 ─────────
export function floors() {
  // 線的位置配合 Helvetica／Arial 的字母比例（字級 68）：上長到 41、x 高度到 55、基線 90、下長到 105
  const groups = [
    ['bdfhkl', 'up', 232],
    ['aceos', 'mid', 502],
    ['gjpqy', 'down', 772],
  ]
  return `<svg class="fig fig-floors" viewBox="0 0 900 124" role="img" aria-label="四線格：b d f h k l 往上長，a c e o s 只住一樓，g j p q y 往下長">
    <rect class="fl-band up" x="96" y="41" width="800" height="14" />
    <rect class="fl-band down" x="96" y="90" width="800" height="15" />
    <line class="fl-line ceil" x1="96" y1="41" x2="896" y2="41" />
    <line class="fl-line mid" x1="96" y1="55" x2="896" y2="55" />
    <line class="fl-line ground" x1="96" y1="90" x2="896" y2="90" />
    <line class="fl-line base" x1="96" y1="105" x2="896" y2="105" />
    <text class="fl-label" x="86" y="52" text-anchor="end">二樓</text>
    <text class="fl-label" x="86" y="77" text-anchor="end">一樓</text>
    <text class="fl-label" x="86" y="103" text-anchor="end">地下室</text>
    <line class="fl-sep" x1="367" y1="30" x2="367" y2="116" />
    <line class="fl-sep" x1="637" y1="30" x2="637" y2="116" />
    ${groups.map(([s, c, x]) => `<text class="fl-letters ${c}" x="${x}" y="90" text-anchor="middle" letter-spacing="7">${s}</text>`).join('')}
  </svg>`
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}

export function figure(f) {
  if (!f) return ''
  if (f.k === 'tree') return tree(f.focus)
  if (f.k === 'scene') return scene(f)
  if (f.k === 'preps') return prepGrid()
  if (f.k === 'floors') return floors()
  return ''
}
