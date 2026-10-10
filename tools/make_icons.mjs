// 產生 icons.js：App 用到的線條圖示（Tabler Icons，MIT 授權，https://github.com/tabler/tabler-icons）
// 2.19（10/9 老師：排版醜、不專業 → 設計手冊：不要用 emoji 當介面圖示）。圖示內嵌在 icons.js，離線也能用。
// 要加圖示：把名稱加進 NAMES，在 App 資料夾跑 node tools/make_icons.mjs，再 commit icons.js
import fs from 'node:fs'

const VER = '3.35.0'
const NAMES = [
  // 單元
  'writing', 'user', 'number-123', 'briefcase', 'arrows-exchange', 'hierarchy', 'messages', 'headphones', 'home', 'hand-finger-right',
  'stack-2', 'switch-horizontal', 'map-pin', 'flag', 'message-2', 'chart-bar', 'sign-right', 'speakerphone', 'swimming', 'clipboard-text',
  'calendar-week', 'clock', 'run', 'news', 'calendar-month', 'medal', 'help-circle', 'confetti', 'paw', 'trees', 'list-numbers', 'notebook',
  // 介面
  'pin', 'lock', 'lock-open', 'microphone', 'message-circle', 'sparkles', 'users', 'device-mobile', 'pencil', 'eraser', 'trash', 'user-plus',
  'wifi', 'moon', 'check', 'x', 'alert-triangle', 'info-circle', 'share', 'copy', 'link', 'send', 'clipboard-check', 'calendar', 'star',
  'bell', 'volume', 'volume-off', 'key', 'ban', 'books', 'thumb-up', 'arrow-back-up', 'download', 'bulb', 'eye', 'school', 'trophy',
  'flame', 'player-play', 'circle-check', 'circle-x', 'mood-smile', 'device-tablet', 'chart-line', 'target', 'refresh', 'book', 'file-text',
  'rocket', 'bolt', 'award', 'hand-stop', 'hourglass', 'player-stop', 'search', 'ear', 'eye-off', 'mail', 'cloud', 'help', 'turtle', 'message-dots',
]
const out = {}
for (const n of NAMES) {
  const url = `https://cdn.jsdelivr.net/npm/@tabler/icons@${VER}/icons/outline/${n}.svg`
  const r = await fetch(url)
  if (!r.ok) {
    console.log('MISSING', n, r.status)
    continue
  }
  const svg = await r.text()
  // 只留圖形：拿掉外框 <svg …> 和透明的邊界方塊
  const inner = svg
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .replace(/<path stroke="none" d="M0 0h24v24H0z" fill="none"\s*\/>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  out[n] = inner
}
const js = `// 線條圖示（Tabler Icons ${VER}，MIT 授權，https://github.com/tabler/tabler-icons）；tools/make_icons.mjs 產生，不要手改
// ti('pencil') → <svg>；樣式（線寬、顏色）由 CSS 的 .ti 決定
// Tabler Icons — MIT License
// Copyright (c) 2020-2026 Paweł Kuna
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
export const TI = ${JSON.stringify(out, null, 0).replace(/","/g, '",\n  "')}
export const ti = (n, cls = '') => (TI[n] ? \`<svg class="ti\${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true">\${TI[n]}</svg>\` : '')
`
fs.writeFileSync(new URL('../icons.js', import.meta.url), js)
console.log(Object.keys(out).length, 'icons →', (js.length / 1024).toFixed(1), 'KB')
