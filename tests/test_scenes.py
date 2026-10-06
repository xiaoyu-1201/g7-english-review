import pathlib, time
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:5181/"
OUT = pathlib.Path(__file__).parent / "shots"
JS = """async () => {
  const m = await import('./art.js')
  const combos = [['table','on'],['table','under'],['table','next'],['table','above'],['box','in'],['box','on'],['box','next'],['box','near'],['box','behind'],['box','front'],['box','above'],['boxes2','between'],['boxes2','on'],['boxes2','next'],['sofa','on'],['sofa','behind'],['sofa','front'],['sofa','next']]
  document.body.innerHTML = '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:8px">' + combos.map(([r,rel]) => '<div style="text-align:center;font:14px sans-serif">' + m.scene({ref:r, sub:'🐱', rel}) + r + ' / ' + rel + '</div>').join('') + '</div>' + m.prepGrid()
}"""
with sync_playwright() as p:
    for dark in (False, True):
        b = p.chromium.launch(channel="msedge")
        pg = b.new_page(viewport={"width": 1000, "height": 1300}, color_scheme="dark" if dark else "light")
        pg.goto(URL)
        pg.wait_for_selector(".home")
        pg.evaluate(JS)
        time.sleep(0.4)
        pg.screenshot(path=str(OUT / f"60-scenes{'-dark' if dark else ''}.png"), full_page=True)
        b.close()
print("ok")
