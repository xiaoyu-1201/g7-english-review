// 讓 App 沒有網路也能打開
// 更新：每次都先問 GitHub 有沒有新版（跳過 10 分鐘暫存）；新版裝好會自動重新整理一次
// 改版時：app.js 的 VERSION 和這裡的 CACHE 都要改
const CACHE = 'g7review-v70'
const SHELL = ['./', 'index.html', 'app.js', 'icons.js', 'focus.js', 'content.js', 'content2.js', 'content3.js', 'speak2.js', 'art.js', 'qrcode.js', 'asr.js', 'styles.css', 'icon.svg', 'privacy.html', 'licenses.html']
// 主畫面圖示和 manifest 不經過 service worker：iPhone「加入主畫面」抓圖示時會走頁面的 SW，被攔到就會變成文字圖示（10/7）
// PDF（重點總整理）也不經過、不存進暫存：幾 MB 的檔案只在要分享時才抓
const BYPASS = /\.(png|webmanifest|pdf)$/

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
        // 告訴開著的頁面有新版；頁面自己決定什麼時候重新整理（做題、考試、課堂檢視中不打斷）
        const wins = await self.clients.matchAll({ type: 'window' })
        wins.forEach((w) => w.postMessage({ type: 'updated' }))
      }
    })(),
  )
})

// 2.23 通知：每天晚上的排程（tools/push/send.mjs）送來的 { title, body, url, tag }
// iPhone 規定收到推播一定要顯示通知（不能偷偷不顯示），所以解不開也要顯示一則
self.addEventListener('push', (e) => {
  let d = {}
  try {
    d = e.data ? e.data.json() : {}
  } catch {
    d = { body: e.data?.text?.() || '' }
  }
  e.waitUntil(
    (async () => {
      // 老師的平板借學生用（學生模式）：老師摘要有學生名字，改成不寫名字的一句（iPhone 規定一定要顯示一則）
      if (String(d.tag || '').startsWith('daily-teacher')) {
        const on = await caches
          .open('xy-flags')
          .then((c) => c.match('active'))
          .then((r) => r?.text())
          .catch(() => '')
        if (on === '1') d = { ...d, title: '小宇英文', body: '今天的學生摘要好了，結束學生模式後再看。' }
      }
      // 同一種通知（tag）會蓋掉前一則；renotify：蓋掉時一樣會響（前一天沒滑掉的提醒，不能讓今天的變成靜音）
      await self.registration.showNotification(d.title || '小宇英文', { body: d.body || '', icon: 'icon-192-v2.png', tag: d.tag || 'daily', renotify: true, data: { url: d.url || './' } })
    })(),
  )
})
// 點通知：App 開著就切過去並換到那一頁；沒開就打開
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = new URL(e.notification.data?.url || './', self.registration.scope)
  e.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      // 只找 App 本體（隱私權說明、授權頁那類分頁不算）
      const w = wins.find((c) => [self.registration.scope, self.registration.scope + 'index.html'].includes(c.url.split('#')[0].split('?')[0]))
      if (w) {
        await w.focus().catch(() => {})
        w.postMessage({ type: 'go', hash: url.hash || '#/' })
        return
      }
      await self.clients.openWindow(url.href)
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
