// 讓 App 沒有網路也能打開
// 更新：每次都先問 GitHub 有沒有新版（跳過 10 分鐘暫存）；新版裝好會自動重新整理一次
// 改版時：app.js 的 VERSION 和這裡的 CACHE 都要改
const CACHE = 'g7review-v44'
const SHELL = ['./', 'index.html', 'app.js', 'content.js', 'content2.js', 'content3.js', 'speak2.js', 'art.js', 'qrcode.js', 'asr.js', 'styles.css', 'icon.svg']
// 主畫面圖示和 manifest 不經過 service worker：iPhone「加入主畫面」抓圖示時會走頁面的 SW，被攔到就會變成文字圖示（10/7）
const BYPASS = /\.(png|webmanifest)$/

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      // 只清掉舊版 App 的暫存；網頁辨識的模型（transformers-cache，約 28MB）要留著，不然每次更新都要重新下載
      const keys = (await caches.keys()).filter((k) => k.startsWith('g7review-'))
      const hadOld = keys.some((k) => k !== CACHE)
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      await self.clients.claim()
      if (hadOld) {
        const wins = await self.clients.matchAll({ type: 'window' })
        wins.forEach((w) => w.navigate(w.url).catch(() => {}))
      }
    })(),
  )
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (url.origin !== self.location.origin || e.request.method !== 'GET' || BYPASS.test(url.pathname)) return
  e.respondWith(
    caches.open(CACHE).then((cache) =>
      fetch(e.request, { cache: 'no-cache' })
        .then((res) => {
          if (res.ok) cache.put(e.request, res.clone())
          return res
        })
        .catch(() => cache.match(e.request, { ignoreSearch: true })),
    ),
  )
})
