"""2.22.2 商用準備：不出現出版社名稱；隱私權說明、授權與致謝兩頁，歡迎畫面和設定都連得到"""
import re, pathlib
from playwright.sync_api import sync_playwright
from synchelp import *

# 出版社名稱、課本的英文課名（照課本的大小寫）、明寫「課本：」的句子
BANNED = re.compile(r"翰林|康軒|南一|Who's That Handsome Boy|Where Are My Pencils|Open the Magic Door|What Time Is the Concert|What's the Date\?|There Are Some Elephants Over There|課本：")
APP = pathlib.Path(__file__).resolve().parent.parent
SKIP = {".git", "shots", "audio", "pdf", "img", "models", "__pycache__", "node_modules"}
# 原始碼掃一遍（公開 repo，註解也算）：不用開瀏覽器
hits = []
for f in APP.rglob("*"):
    if f.is_file() and f.suffix in {".js", ".mjs", ".html", ".md", ".json", ".py", ".webmanifest"} and not (SKIP & set(f.relative_to(APP).parts)) and f.name != "test_legal.py":
        for i, line in enumerate(f.read_text(encoding="utf-8", errors="ignore").splitlines(), 1):
            if BANNED.search(line):
                hits.append(f"{f.relative_to(APP)}:{i}")
check(not hits, f"no publisher names / textbook lesson titles anywhere in the source ({hits[:5]})")
with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge")
    # 歡迎畫面（新裝置）：底下有兩個連結
    ctx = b.new_context(viewport={"width": 390, "height": 844}, has_touch=True)
    ctx.add_init_script(DBSEED)
    N = ctx.new_page()
    N.goto(URL)
    N.wait_for_selector(".welcome")
    check(N.locator('.w-legal a[href="privacy.html"]').count() == 1 and N.locator('.w-legal a[href="licenses.html"]').count() == 1, "welcome screen links to 隱私權說明 and 授權與致謝")
    check(not BANNED.search(txt(N, "body")), "welcome screen has no publisher names")
    check("國中英語七上" in txt(N, ".welcome"), "welcome says 國中英語七上")
    ctx.close()
    # 學生：首頁、設定頁都沒有出版社名稱；設定頁有兩個連結
    A = page(b, 390, 844, "A")
    A.goto(URL)
    A.wait_for_selector(".home")
    check(not BANNED.search(txt(A, "body")), "home has no publisher names")
    A.goto(URL + "#/settings")
    A.wait_for_selector(".page")
    check(A.locator('a.row[href="privacy.html"]').count() == 1 and A.locator('a.row[href="licenses.html"]').count() == 1, "settings links to both pages")
    check(not BANNED.search(txt(A, "body")), "settings has no publisher names")
    # 兩頁本身：打得開、有重點內容、沒有出版社名稱、沒有人名或 Email
    for path, must in (("privacy.html", ["收哪些資料", "新加坡", "3 個月", "15 天"]), ("licenses.html", ["SIL Open Font License", "Tabler Icons", "DENSO WAVE", "Kokoro"])):
        A.goto(URL + path)
        A.wait_for_selector("main")
        body = txt(A, "main")
        check(all(m in body for m in must), f"{path} has the key points ({[m for m in must if m not in body]})")
        check(not BANNED.search(body) and "@" not in body.replace("(c)", ""), f"{path}: no publisher names, no e-mail")
        check(A.evaluate("document.documentElement.scrollWidth") <= 390, f"{path}: no sideways scroll on a phone")
        A.screenshot(path=str(OUT / f"legal-{path.split('.')[0]}.png"), full_page=True)
    b.close()
report()
