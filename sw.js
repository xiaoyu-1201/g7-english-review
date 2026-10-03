// 讓 App 沒有網路也能打開
// 更新：每次都先問 GitHub 有沒有新版（跳過 10 分鐘暫存）；新版裝好會自動重新整理一次
// 改版時：app.js 的 VERSION 和這裡的 CACHE 都要改
const CACHE = 'g7review-v7'
const SHELL = ['./', 'index.html', 'app.js', 'content.js', 'art.js', 'styles.css', 'manifest.webmanifest', 'icon.svg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png']

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
      const keys = await caches.keys()
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
  if (url.origin !== self.location.origin || e.request.method !== 'GET') return
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
