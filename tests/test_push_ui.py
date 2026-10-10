"""2.23 App 端的通知：老師、學生、家長開／關通知（存到 push/<班級>/<身分>/<裝置>）、老師開放學生家長、
之後再說、被擋住、主畫面才收得到（iPhone）、打開 App 時重存、退出／登出刪掉、規則擋亂寫、成員管理的 🔔、排程停了的提醒、
點通知換頁、麥克風收音。瀏覽器的推播（PushManager、service worker）用假的（自動測試的瀏覽器沒有推播服務）"""
import time
from playwright.sync_api import sync_playwright
from synchelp import *

FAKE = """(() => {
  if (window.__fakePush) return; window.__fakePush = 1
  if (localStorage.getItem('test:nopush')) { delete window.PushManager; return }
  window.__perm = localStorage.getItem('test:perm') || 'default'
  const mk = (ep, key) => ({ endpoint: ep, options: { applicationServerKey: new Uint8Array(key).buffer },
    toJSON() { return { endpoint: ep, keys: { p256dh: 'B' + 'x'.repeat(86), auth: 'a'.repeat(22) } } },
    unsubscribe() { localStorage.removeItem('test:sub'); window.__unsub = (window.__unsub || 0) + 1; return Promise.resolve(true) } })
  const pm = {
    getSubscription: async () => { const s = JSON.parse(localStorage.getItem('test:sub') || 'null'); return s ? mk(s.ep, s.key) : null },
    subscribe: async (o) => { const s = { ep: 'https://fcm.googleapis.com/fcm/send/t' + Math.random().toString(36).slice(2), key: [...o.applicationServerKey] }; localStorage.setItem('test:sub', JSON.stringify(s)); window.__subs = (window.__subs || 0) + 1; return mk(s.ep, s.key) },
  }
  const reg = { pushManager: pm, showNotification: async (t, o) => { (window.__shown ||= []).push(t) } }
  const et = new EventTarget()
  const sw = { ready: Promise.resolve(reg), getRegistrations: async () => [], addEventListener: et.addEventListener.bind(et), dispatchEvent: et.dispatchEvent.bind(et) }
  Object.defineProperty(navigator, 'serviceWorker', { get: () => sw, configurable: true })
  Object.defineProperty(Notification, 'permission', { get: () => window.__perm, configurable: true })
  Notification.requestPermission = async () => { const v = localStorage.getItem('test:answer') || 'granted'; localStorage.setItem('test:perm', v); return (window.__perm = v) }
})();"""


def pg(b, w, h, name, ua=None, pre=""):
    c = b.new_context(viewport={"width": w, "height": h}, has_touch=True, **({"user_agent": ua} if ua else {}))
    c.add_init_script(pre + SEED + FAKE)
    p = c.new_page()
    p.on("pageerror", lambda e: errors.append(f"{name} pageerror: {e}"))
    return p


def rec(code, uid=None):
    v = http("GET", f"/push/{code}.json")[1] or {}
    return v if uid is None else (v.get(uid) or {})


with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge")
    T = pg(b, 820, 1180, "T")
    teacher_login(T, f"push{time.time_ns()}@example.com", signup=True)
    code = sync_of(T)["code"]
    amy = add_student(T, "Amy")
    tuid = uid_of(T)
    # ── 老師：學生總覽最上面「開啟通知」；設定有「通知」和「學生、家長也可以開通知」 ──
    T.goto(URL + "#/students")
    check(wait_until(lambda: T.locator(".push-card").count() == 1), "teacher: 開啟通知 card on the students page")
    check("每天晚上 9:00" in txt(T, ".push-card"), "card says when (每天晚上 9:00)")
    T.screenshot(path=str(OUT / "push-teacher-card.png"))
    T.click('.push-card [data-push="on"]')
    check(wait_until(lambda: rec(code, tuid)), "teacher enabled → push/<class>/<teacher>/<device> saved")
    r = next(iter(rec(code, tuid).values()), {})
    check(r.get("role") == "teacher" and "sid" not in r and r.get("e", "").startswith("https://") and r.get("k"), f"teacher record: role teacher, no sid ({ {k: v for k, v in r.items() if k != 'e'} })")
    check(T.evaluate("window.__shown || []") == ["通知開好了"], "a sample notification is shown right away")
    check(wait_until(lambda: T.locator(".push-card").count() == 0), "card gone after enabling")
    T.goto(URL + "#/settings")
    T.wait_for_selector('[data-seg="push"]')
    check(T.locator('[data-seg="push"] [data-v="on"].on').count() == 1, "settings: 通知 shows 開")
    check(T.locator('[data-seg="notify"] [data-v="off"].on').count() == 1, "settings: 學生、家長也可以開通知 starts 關")
    T.locator("#push-wrap").scroll_into_view_if_needed()
    T.screenshot(path=str(OUT / "push-teacher-settings.png"))
    # ── 學生：老師還沒開放 → 沒有卡、設定沒有「通知」 ──
    A = pg(b, 390, 844, "A")
    A.goto(link(code, "student", amy))
    wait_until(lambda: st(A) == "member")
    A.goto(URL)
    A.wait_for_selector(".home")
    time.sleep(1)
    check(A.locator(".push-card").count() == 0, "student: no card while the teacher hasn't allowed it")
    A.goto(URL + "#/settings")
    A.wait_for_selector("#push-wrap", state="attached")
    check(A.locator("#push-wrap .group").count() == 0, "student: no 通知 section yet")
    # 老師打開「學生、家長也可以開通知」
    T.click('[data-seg="notify"] [data-v="on"]')
    check(wait_until(lambda: http("GET", f"/classes/{code}/notify.json")[1] is True), "teacher allowed students/parents → classes/<c>/notify true")
    A.goto(URL)
    A.evaluate("window.__app.Sync.fetchStu()")
    check(wait_until(lambda: A.locator(".push-card").count() == 1), "student: 開啟通知 card appears on the home page")
    check("晚上 7:30" in txt(A, ".push-card"), "student card says 晚上 7:30")
    A.screenshot(path=str(OUT / "push-student-card.png"))
    check(A.evaluate("document.documentElement.scrollWidth") <= 390, "phone: no sideways scroll")
    # QA 10/11：從主畫面打開（重新整理）時，同步還沒連上就畫好首頁了 → 連上之後卡片要自己補上
    A.reload()
    A.wait_for_selector(".home")
    check(wait_until(lambda: A.locator(".push-card").count() == 1, 8), "cold open: the card shows up by itself (no tab switching)")
    A.click('.push-card [data-push="later"]')
    check(wait_until(lambda: A.locator(".push-card").count() == 0), "之後再說 hides the card")
    check(wait_until(lambda: "設定」→「通知」" in txt(A, "#toast")), "之後再說 tells where to turn it on later")
    A.reload()
    A.wait_for_selector(".home")
    time.sleep(0.8)
    check(A.locator(".push-card").count() == 0, "…and it stays hidden after reopening")
    # 改到設定打開
    A.goto(URL + "#/settings")
    A.wait_for_selector('[data-seg="push"]')
    A.click('[data-seg="push"] [data-v="on"]')
    auid = uid_of(A)
    check(wait_until(lambda: rec(code, auid)), "student enabled from settings → record saved")
    r = next(iter(rec(code, auid).values()), {})
    check(r.get("role") == "student" and r.get("sid") == amy, "student record: role student, sid = Amy")
    check(wait_until(lambda: A.locator('[data-seg="push"] [data-v="on"].on').count() == 1), "settings shows 開")
    check("晚上 7:30 練習提醒" in txt(A, "#push-wrap"), "settings row says what it is (晚上 7:30 練習提醒)")
    # 老師暫停學生、家長的通知：已經開的學生還看得到開關（可以自己關），並寫「老師暫停了通知」
    T.click('[data-seg="notify"] [data-v="off"]')
    check(wait_until(lambda: http("GET", f"/classes/{code}/notify.json")[1] is False), "teacher paused")
    A.evaluate("window.__app.Sync.fetchStu()")
    check(wait_until(lambda: "老師暫停了通知" in txt(A, "#push-wrap")) and A.locator('[data-seg="push"]').count() == 1, "student: 老師暫停了通知, switch still there")
    T.click('[data-seg="notify"] [data-v="on"]')
    check(wait_until(lambda: http("GET", f"/classes/{code}/notify.json")[1] is True), "teacher allowed again")
    A.evaluate("window.__app.Sync.fetchStu()")
    check(wait_until(lambda: "老師暫停了通知" not in txt(A, "#push-wrap")), "student: back to normal")
    # 規則：不能冒充別的身分、別的學生、老師，也不能寫別人的
    tok = tok_of(A)
    dev = next(iter(rec(code, auid)))
    good = {"e": "https://fcm.googleapis.com/x", "p": "B" + "x" * 86, "a": "a" * 22, "role": "student", "sid": amy, "at": 1}
    W = lambda path, body: http("PUT", f"/push/{code}/{path}.json?auth={tok}", body)[0]
    check(W(f"{auid}/{dev}", good) == 200, "rules: own record OK")
    check(W(f"{auid}/{dev}", {**good, "role": "parent"}) == 401, "rules: student can't claim parent")
    check(W(f"{auid}/{dev}", {**good, "sid": "zzzzzzzzzz"}) == 401, "rules: can't use another student's sid")
    check(W(f"{auid}/{dev}", {**{k: v for k, v in good.items() if k != 'sid'}, "role": "teacher"}) == 401, "rules: student can't be teacher")
    check(W(f"{tuid}/x", good) == 401, "rules: can't write someone else's record")
    check(W(f"{auid}/{dev}", {**good, "e": "http://evil.example.com/x"}) == 401, "rules: endpoint must be https")
    check(http("GET", f"/push/{code}.json?auth={tok}")[0] == 401, "rules: student can't read the class's subscriptions")
    check(http("GET", f"/pushlog.json?auth={tok}")[0] == 401, "rules: pushlog is server-only")
    check(http("PUT", f"/classes/{code}/notify.json?auth={tok}", True)[0] == 401, "rules: student can't flip the notify switch")
    # ── 家長：學習進度最上面的卡 ──
    P = pg(b, 390, 844, "P")
    P.goto(link(code, "parent", amy))
    wait_until(lambda: st(P) == "member")
    P.goto(URL + "#/live/home")
    P.evaluate("window.__app.Sync.fetchStu()")
    check(wait_until(lambda: P.locator(".push-card").count() == 1), "parent: card on 學習進度")
    check("每週日晚上 8:00" in txt(P, ".push-card"), "parent card says 每週日晚上 8:00")
    P.screenshot(path=str(OUT / "push-parent-card.png"))
    P.click('.push-card [data-push="on"]')
    puid = uid_of(P)
    check(wait_until(lambda: next(iter(rec(code, puid).values()), {}).get("role") == "parent"), "parent record saved (role parent)")
    # ── 成員管理：🔔 ──
    T.goto(URL + "#/manage")
    T.wait_for_selector(".manage-page")
    check(wait_until(lambda: T.locator(".mg-bell").count() == 3), f"manage: 🔔 on Amy's phone, the parent, and the teacher row ({T.locator('.mg-bell').count()})")
    check("1 台收通知" in txt(T, ".manage-page"), "teacher row: 1 台收通知")
    T.screenshot(path=str(OUT / "push-manage.png"), full_page=True)
    T.click(f'[data-remove="{puid}"]')
    T.click(".sheet [data-ok]")
    check(wait_until(lambda: not rec(code, puid)), "removing a device in 成員管理 deletes its notifications too")
    T.click(".sheet [data-close]")  # 「已移除」視窗
    time.sleep(0.5)
    # ── 打開 App 時：每 3 天重存一次；權限被關掉 → 刪掉 ──
    old = next(iter(rec(code, auid).values()))["at"]
    A.evaluate("localStorage.setItem('g7review:push', String(Date.now() - 4 * 86400000))")
    A.reload()
    check(wait_until(lambda: next(iter(rec(code, auid).values()), {}).get("at", 0) > old, 12), "reopen after 3+ days → record refreshed")
    http("DELETE", f"/push/{code}/{auid}.json")  # 雲端那份不見了（例如老師移除後又復原）
    A.reload()
    check(wait_until(lambda: rec(code, auid), 12), "cloud record missing → re-saved on next open")
    A.evaluate("localStorage.setItem('test:perm', 'default')")  # 使用者在系統設定把通知關掉了
    A.reload()
    check(wait_until(lambda: not rec(code, auid), 12), "permission revoked → record deleted on next open")
    check(A.evaluate("localStorage.getItem('g7review:push')") == "", "…and the device is marked off")
    # 被擋住：設定頁教怎麼打開
    A.evaluate("localStorage.setItem('test:perm', 'denied')")
    A.goto(URL + "#/settings")
    A.reload()
    A.wait_for_selector("#push-wrap .group")
    check("通知被擋住了" in txt(A, "#push-wrap"), "denied → settings explains how to turn it back on")
    A.evaluate("localStorage.setItem('test:perm', 'default')")
    # 退出同步 → 刪掉
    A.reload()
    A.wait_for_selector('[data-seg="push"]')
    A.click('[data-seg="push"] [data-v="on"]')
    check(wait_until(lambda: rec(code, auid)), "student on again")
    A.click('[data-seg="push"] [data-v="off"]')
    check(wait_until(lambda: not rec(code, auid)) and A.evaluate("window.__unsub || 0") >= 1, "turn off → record deleted + browser unsubscribed")
    A.click('[data-seg="push"] [data-v="on"]')
    check(wait_until(lambda: rec(code, auid)), "student on again (for 退出)")
    A.click('[data-x="unpair"]')
    A.click(".sheet [data-ok]")
    check(wait_until(lambda: not rec(code, auid)), "退出同步 → record deleted")
    # ── 點通知、App 開著：換到那一頁 ──
    T.goto(URL + "#/students")
    T.wait_for_selector(".stu-page")
    T.evaluate("navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { type: 'go', hash: '#/settings' } }))")
    check(wait_until(lambda: T.evaluate("location.hash") == "#/settings"), "notification tap (app open) → goes to the page")
    T.evaluate("navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { type: 'go', hash: 'javascript:alert(1)' } }))")
    time.sleep(0.3)
    check(T.evaluate("location.hash") == "#/settings", "bad hash ignored")
    # ── 排程停了：老師的「要處理的事」 ──
    T.evaluate("localStorage.setItem('g7review:pushsince', String(Date.now() - 3 * 86400000))")
    T.goto(URL + "#/students")
    check(wait_until(lambda: "每日通知停了" in txt(T, ".stu-page")), "teacher todo: 每日通知停了 (no run in 2+ days)")
    T.click('[data-todo-act="pushstop"]')
    check(wait_until(lambda: T.locator('.sheet a[href*="actions/workflows/push.yml"]').count() == 1), "看看 → sheet with the GitHub link")
    T.keyboard.press("Escape")
    http("PUT", f"/classes/{code}/notifyRun.json", int(time.time() * 1000))
    check(wait_until(lambda: "每日通知停了" not in txt(T, ".stu-page")), "schedule ran → reminder gone")
    # ── 老師登出 → 刪掉老師那台 ──
    T.goto(URL + "#/settings")
    T.click('[data-x="signout"]')
    T.click(".sheet [data-ok]")
    check(wait_until(lambda: not rec(code, tuid)), "teacher sign-out → teacher's record deleted")
    # ── iPhone Safari（沒加到主畫面＝沒有推播）：老師看到「先加到主畫面」，教法是老師版 ──
    I = pg(b, 390, 844, "I", ua="Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", pre="localStorage.setItem('test:nopush', '1');")
    I.goto(URL)
    teacher_login(I, f"push{time.time_ns()}@example.com", signup=True)
    I.goto(URL + "#/students")
    check(wait_until(lambda: "先加到主畫面" in (txt(I, ".push-card") if I.locator(".push-card").count() else "")), "iPhone Safari teacher: 想收到通知？先加到主畫面")
    I.click('.push-card [data-push="home"]')
    check(wait_until(lambda: "老師登入" in txt(I, ".sheet")), "install steps say to log in as the teacher (not the 6-digit code)")
    I.keyboard.press("Escape")
    I.goto(URL + "#/settings")
    check(wait_until(lambda: "加到主畫面才收得到通知" in txt(I, "#push-wrap")), "settings: 加到主畫面才收得到通知")
    I.screenshot(path=str(OUT / "push-iphone-settings.png"), full_page=True)
    # ── 麥克風收音：音量 → 光圈、每個音 → 波紋 ──
    I.evaluate("""() => { const d = document.createElement('div'); d.className = 'sp-mic-wrap'; d.innerHTML = '<div class="sp-mic-box"><span class="sp-lv"></span><button class="sp-mic on"></button></div>'; document.querySelector('#view').prepend(d) }""")
    r = I.evaluate("""async () => { const m = window.__app.micMeter(); m(0.002); await new Promise(r => requestAnimationFrame(r)); const quiet = document.querySelectorAll('.sp-rip').length
      m(0.15); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); const box = document.querySelector('.sp-mic-box')
      const res = { quiet, rip: document.querySelectorAll('.sp-rip').length, lv: +box.style.getPropertyValue('--lv'), on: box.classList.contains('on'), to: +(document.querySelector('.sp-rip')?.style.getPropertyValue('--to') || 0) }
      m(0.16); res.rip2 = document.querySelectorAll('.sp-rip').length
      m.end(); res.after = box.classList.contains('on') || document.querySelectorAll('.sp-rip').length; return res }""")
    check(r["quiet"] == 0 and r["rip"] == 1 and r["lv"] > 0.5 and r["on"] and r["to"] > 1.8, f"mic: silence → nothing; a loud sound → ring grows + one ripple ({r})")
    check(r["rip2"] == 1, "mic: same sound continuing doesn't spawn a ripple every frame")
    check(not r["after"], "mic: end → back to normal")
    b.close()
report()
