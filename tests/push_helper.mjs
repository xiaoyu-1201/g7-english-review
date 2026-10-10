// 測試用：假裝是收通知的瀏覽器
//   node push_helper.mjs keys 3        → [{ priv, pub, auth }]（訂閱的金鑰）
//   node push_helper.mjs vapid         → { priv, pub }（測試用的 VAPID 金鑰）
//   node push_helper.mjs decrypt <檔案> → 檔案是 [{ body(base64), priv, auth }]，印出解密後的文字
import crypto from 'node:crypto'
import { readFileSync } from 'node:fs'
import { decrypt, newVapidKeys, b64u } from '../tools/push/webpush.mjs'

const [cmd, arg] = process.argv.slice(2)
if (cmd === 'keys')
  console.log(
    JSON.stringify(
      Array.from({ length: +arg || 1 }, () => {
        const e = crypto.createECDH('prime256v1')
        e.generateKeys()
        return { priv: b64u(e.getPrivateKey()), pub: b64u(e.getPublicKey()), auth: b64u(crypto.randomBytes(16)) }
      }),
    ),
  )
else if (cmd === 'vapid') console.log(JSON.stringify(newVapidKeys()))
else if (cmd === 'decrypt')
  console.log(
    JSON.stringify(
      JSON.parse(readFileSync(arg, 'utf8')).map((x) => {
        try {
          return decrypt(Buffer.from(x.body, 'base64'), x.priv, x.auth)
        } catch (e) {
          return 'ERR ' + e.message
        }
      }),
    ),
  )
