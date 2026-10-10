// 2.23 通知的加密：跟 RFC 8291 附錄 A 的數值逐一比對；VAPID 簽章用公鑰驗證
import crypto from 'node:crypto'
import { encrypt, decrypt, vapidKeys, vapidAuth, newVapidKeys, ub64, b64u } from '../tools/push/webpush.mjs'

const fails = []
const check = (ok, msg) => (ok ? console.log('PASS', msg) : (fails.push(msg), console.log('FAIL', msg)))

const V = {
  plain: 'V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24',
  asPub: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPriv: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPub: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  uaPriv: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  head: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  ct: '8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ',
}
const text = ub64(V.plain).toString()
const out = encrypt(text, V.uaPub, V.auth, { priv: ub64(V.asPriv), salt: ub64(V.salt) })
check(b64u(out.subarray(0, 86)) === V.head, 'RFC 8291 header (salt + rs 4096 + as_public)')
check(b64u(out.subarray(86)) === V.ct, 'RFC 8291 ciphertext matches Appendix A')
check(decrypt(out, V.uaPriv, V.auth) === text, 'decrypt gets the plaintext back')
// 隨機金鑰也解得開；內容被改過要解不開
const r = encrypt('{"title":"測試"}', V.uaPub, V.auth)
check(decrypt(r, V.uaPriv, V.auth) === '{"title":"測試"}', 'random salt/key round trip (UTF-8)')
r[r.length - 1] ^= 1
let bad = false
try {
  decrypt(r, V.uaPriv, V.auth)
} catch {
  bad = true
}
check(bad, 'tampered message is rejected')
// VAPID：JWT 用 ES256、aud＝推播服務的網域、exp 在 24 小時內、公鑰對得上
const k = newVapidKeys()
const keys = vapidKeys(k.priv)
check(keys.pub === k.pub, 'public key derived from the private key')
const now = Date.now()
const h = vapidAuth('https://web.push.apple.com/abc/def', keys, 'https://xiaoyu-1201.github.io/g7-english-review/', now)
const m = h.match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/)
check(!!m && m[4] === k.pub, 'Authorization: vapid t=…, k=<public key>')
const claims = JSON.parse(ub64(m[2]).toString())
check(claims.aud === 'https://web.push.apple.com' && claims.exp - now / 1000 <= 86400 && claims.exp > now / 1000 && /^https:/.test(claims.sub), `JWT claims ok (${JSON.stringify(claims)})`)
const pub = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(ub64(k.pub).subarray(1, 33)), y: b64u(ub64(k.pub).subarray(33)) }, format: 'jwk' })
check(crypto.verify('sha256', Buffer.from(`${m[1]}.${m[2]}`), { key: pub, dsaEncoding: 'ieee-p1363' }, ub64(m[3])), 'ES256 signature verifies (raw r||s, 64 bytes)')
check(ub64(m[3]).length === 64, 'signature is 64 bytes')
console.log('FAILS', JSON.stringify(fails))
process.exit(fails.length ? 1 : 0)
