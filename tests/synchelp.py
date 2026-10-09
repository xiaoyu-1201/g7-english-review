"""同步測試共用：本機網站 5181＋模擬 Firebase 5190；老師建立後台、新增學生、取連結"""
import pathlib, time, json, urllib.request, os

# 試玩用（AI 試玩時開另一組連接埠）：環境變數 G7_URL、G7_DB、G7_OUT 可以換掉
URL = os.environ.get("G7_URL", "http://127.0.0.1:5181/")
DB = os.environ.get("G7_DB", "http://127.0.0.1:5190")
OUT = pathlib.Path(os.environ.get("G7_OUT") or pathlib.Path(__file__).parent / "shots")
DBSEED = f"localStorage.setItem('g7review:db', '{DB}');localStorage.setItem('g7review:authkey', 'testkey');localStorage.setItem('g7review:authurl', '{DB}');"
SEED = "if (!localStorage.getItem('g7review:v1')) localStorage.setItem('g7review:v1', JSON.stringify({seen:{intro:1}}));" + DBSEED
# 外觀（2.22）：G7_SKIN=old 拍舊的外觀（前後對照用）
if os.environ.get("G7_SKIN"):
    SEED += f"localStorage.setItem('g7review:skin', '{os.environ['G7_SKIN']}');"
    DBSEED += f"localStorage.setItem('g7review:skin', '{os.environ['G7_SKIN']}');"

errors, notes, fails = [], [], []


def check(c, m):
    (notes if c else fails).append(m)
    print("OK  " if c else "FAIL", m, flush=True)


def wait_until(fn, t=10):
    end = time.time() + t
    while time.time() < end:
        try:
            if fn():
                return True
        except Exception:
            pass
        time.sleep(0.3)
    return False


def page(b, w, h, name, seed=SEED):
    c = b.new_context(viewport={"width": w, "height": h}, has_touch=True)
    c.add_init_script(seed)
    pg = c.new_page()
    pg.on("pageerror", lambda e: errors.append(f"{name} pageerror: {e}"))
    return pg


def report():
    print("ERRORS", errors)
    print("FAILS", fails)


st = lambda pg: pg.evaluate("window.__app.Sync ? window.__app.Sync.state : '?'")
txt = lambda pg, sel: pg.locator(sel).first.inner_text()
sync_of = lambda pg: pg.evaluate("JSON.parse(localStorage.getItem('g7review:sync') || '{}').sync || {}")
tok_of = lambda pg: pg.evaluate("JSON.parse(localStorage.getItem('g7review:auth')).it")
uid_of = lambda pg: pg.evaluate("JSON.parse(localStorage.getItem('g7review:auth')).uid")


def http(method, path, body=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(DB + path, data=data, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read().decode() or "null")
    except urllib.error.HTTPError as e:
        return e.code, None


def teacher_login(T, email, pw="secret123", signup=False):
    """#/teacher：登入（或建立老師帳號）→ 到學生列表"""
    T.goto(URL + "#/teacher")
    T.wait_for_selector(".teacher-page")
    if signup:
        T.click('[data-t-mode="signup"]')
        T.wait_for_selector('[data-t-mode="login"]')
    T.fill("#t-email", email)
    T.fill("#t-pw", pw)
    T.click("[data-t-ok]")
    wait_until(lambda: st(T) == "owner")
    T.wait_for_selector(".stu-page")


def make_teacher(b, w=820, h=1180, name="T", email=None):
    """老師平板：#/teacher → 建立老師帳號 → 到學生列表"""
    T = page(b, w, h, name)
    teacher_login(T, email or f"t{time.time_ns()}@example.com", signup=True)
    return T, sync_of(T)["code"]


def add_student(T, name):
    """新增學生（UI），回傳學生代號；分享視窗開著就關掉"""
    T.goto(URL + "#/students")
    T.wait_for_selector("[data-add]")
    T.click("[data-add]")
    T.fill("#ns-name", name)
    T.click(".sheet [data-ok]")
    wait_until(lambda: T.evaluate("location.hash").startswith("#/student/"))
    sid = T.evaluate("location.hash").split("/")[2]
    T.wait_for_selector(".sheet .code-big")
    wait_until(lambda: len(txt(T, ".sheet .code-big").replace(" ", "")) == 6)
    T.keyboard.press("Escape")
    time.sleep(0.4)
    return sid


def link(code, role, x=""):
    return f"{URL}#/pair/{code}/{role}" + (f"/{x}" if x else "")


def answer_one(pg, mod="u2b"):
    """做一題選擇題（前面兩張觀念卡）"""
    pg.goto(URL)
    pg.wait_for_selector(".home")
    pg.click(f'[data-mod="{mod}"]')
    for _ in range(2):
        pg.wait_for_selector(".t-learn")
        pg.click('.opt[data-i="0"]')
        pg.click("[data-act=check]")
    pg.wait_for_selector(".t-mcq")
    pg.click('.opt[data-i="0"]')
    pg.click("[data-act=check]")
    pg.click("[data-act=close]")
    pg.wait_for_selector(".home")
