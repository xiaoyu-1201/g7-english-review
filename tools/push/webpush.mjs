// Web Push：把通知加密（RFC 8291，aes128gcm）＋證明是我們發的（VAPID，RFC 8292）
// 只用 Node 內建的 crypto，不用另外裝套件；tests/push_vectors.mjs 用 RFC 8291 附錄 A 的數值驗證
import crypto from 'node:crypto'

export const b64u = (b) => Buffer.from(b).toString('base64url')
export const ub64 = (s) => Buffer.from(String(s).replace(/\s+/g, ''), 'base64url')
const hkdf = (ikm, salt, info, len) => Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, len))

// 加密一則通知：p256dh、auth 是瀏覽器訂閱時給的（base64url）；opt.priv／opt.salt 只有測試會帶
export function encrypt(text, p256dh, auth, opt = {}) {
  const ua = ub64(p256dh)
  const secret = ub64(auth)
  if (ua.length !== 65 || secret.length !== 16) throw new Error('bad-keys')
  const ecdh = crypto.createECDH('prime256v1')
  if (opt.priv) ecdh.setPrivateKey(opt.priv)
  else ecdh.generateKeys()
  const as = ecdh.getPublicKey()
  const ikm = hkdf(ecdh.computeSecret(ua), secret, Buffer.concat([Buffer.from('WebPush: info\0'), ua, as]), 32)
  const salt = opt.salt || crypto.randomBytes(16)
  const cek = hkdf(ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16)
  const nonce = hkdf(ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12)
  const plain = Buffer.concat([Buffer.from(text), Buffer.from([2])]) // 0x02＝最後一段
  if (plain.length + 16 > 4096) throw new Error('too-long')
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce)
  const body = Buffer.concat([c.update(plain), c.final(), c.getAuthTag()])
  const head = Buffer.alloc(21)
  salt.copy(head, 0)
  head.writeUInt32BE(4096, 16)
  head[20] = as.length
  return Buffer.concat([head, as, body])
}

// VAPID 金鑰：私鑰＝32 bytes 的 d（base64url）；公鑰＝65 bytes（App 訂閱時用的 applicationServerKey）
export function vapidKeys(d) {
  const ecdh = crypto.createECDH('prime256v1')
  ecdh.setPrivateKey(ub64(d))
  const pub = ecdh.getPublicKey()
  const key = crypto.createPrivateKey({ key: { kty: 'EC', crv: 'P-256', d: b64u(ub64(d)), x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33)) }, format: 'jwk' })
  return { key, pub: b64u(pub) }
}
export function newVapidKeys() {
  const ecdh = crypto.createECDH('prime256v1')
  ecdh.generateKeys()
  return { priv: b64u(ecdh.getPrivateKey()), pub: b64u(ecdh.getPublicKey()) }
}

// Authorization 標頭：JWT（ES256）；sub 用網站網址（不放 Email）
export function vapidAuth(endpoint, keys, sub, now = Date.now()) {
  const aud = new URL(endpoint).origin
  const h = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))
  const p = b64u(JSON.stringify({ aud, exp: Math.floor(now / 1000) + 12 * 3600, sub }))
  const sig = crypto.sign('sha256', Buffer.from(`${h}.${p}`), { key: keys.key, dsaEncoding: 'ieee-p1363' })
  return `vapid t=${h}.${p}.${b64u(sig)}, k=${keys.pub}`
}

// 發一則：回傳 HTTP 狀態碼（201＝成功；404／410＝這個訂閱已經失效，要刪掉）
export async function sendPush(sub, payload, keys, { sub: subject, ttl = 10800, fetchImpl = fetch } = {}) {
  const body = encrypt(JSON.stringify(payload), sub.p, sub.a)
  const r = await fetchImpl(sub.e, {
    method: 'POST',
    headers: {
      Authorization: vapidAuth(sub.e, keys, subject),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttl),
      Urgency: 'normal',
    },
    body,
    signal: AbortSignal.timeout(15000), // 推播服務卡住不回：15 秒就放棄（不要拖到排程被砍）
  })
  return r.status
}

// 解密（只給測試用：假裝自己是收通知的瀏覽器）
export function decrypt(buf, uaPriv, auth) {
  const salt = buf.subarray(0, 16)
  const idlen = buf[20]
  const as = buf.subarray(21, 21 + idlen)
  const ecdh = crypto.createECDH('prime256v1')
  ecdh.setPrivateKey(ub64(uaPriv))
  const ua = ecdh.getPublicKey()
  const ikm = hkdf(ecdh.computeSecret(as), ub64(auth), Buffer.concat([Buffer.from('WebPush: info\0'), ua, as]), 32)
  const cek = hkdf(ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16)
  const nonce = hkdf(ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12)
  const ct = buf.subarray(21 + idlen)
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce)
  d.setAuthTag(ct.subarray(ct.length - 16))
  const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()])
  let end = plain.length - 1
  while (end >= 0 && plain[end] === 0) end--
  if (plain[end] !== 2) throw new Error('bad-padding')
  return plain.subarray(0, end).toString()
}
