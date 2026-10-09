"""把老師在 ChatGPT 生成的植物圖（一張 5 個成長階段排一排）裁成 5 張：img/plant-<種類>-<1～5>.png
用法（在 App 資料夾）：python tools\\split_plants.py <圖檔> <種類：sun／cactus／sakura／apple>
- 背景不是透明的（白色或很淡的顏色）：從四周往內把接近背景色的像素去掉
- 依「有東西的直欄」切成 5 塊；每塊裁掉空白、等比例縮成高 360px、底部對齊放進同樣大小的畫布（5 張的盆子才會對齊）
做完要到 app.js 把種類加進 PLANT_ART，例如 const PLANT_ART = ['sun']
"""
import sys, pathlib
from collections import deque
from PIL import Image

APP = pathlib.Path(__file__).resolve().parent.parent
src, kind = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGBA")
W, H = im.size
px = im.load()


def is_bg(c, ref):
    return c[3] < 20 or (abs(c[0] - ref[0]) + abs(c[1] - ref[1]) + abs(c[2] - ref[2]) < 36)


# 1) 去背：四個角的顏色當背景，從邊框往內 flood fill
corners = [px[0, 0], px[W - 1, 0], px[0, H - 1], px[W - 1, H - 1]]
ref = max(corners, key=corners.count)
if ref[3] > 200:  # 不透明的背景才需要去
    seen = bytearray(W * H)
    q = deque([(x, 0) for x in range(W)] + [(x, H - 1) for x in range(W)] + [(0, y) for y in range(H)] + [(W - 1, y) for y in range(H)])
    while q:
        x, y = q.popleft()
        i = y * W + x
        if seen[i]:
            continue
        seen[i] = 1
        if not is_bg(px[x, y], ref):
            continue
        px[x, y] = (0, 0, 0, 0)
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < W and 0 <= ny < H and not seen[ny * W + nx]:
                q.append((nx, ny))

# 2) 找出有東西的直欄，切成 5 塊（取最寬的 5 段）
cols = [any(px[x, y][3] > 30 for y in range(0, H, 2)) for x in range(W)]
segs, start = [], None
for x, on in enumerate(cols + [False]):
    if on and start is None:
        start = x
    if not on and start is not None:
        if x - start > W * 0.03:
            segs.append((start, x))
        start = None
# 太近的段落合併（同一株植物的葉子之間可能有縫）
merged = []
for s in segs:
    if merged and s[0] - merged[-1][1] < W * 0.015:
        merged[-1] = (merged[-1][0], s[1])
    else:
        merged.append(s)
if len(merged) != 5:
    print(f"找到 {len(merged)} 段，不是 5 段；改用平均切成 5 等份")
    merged = [(round(W * k / 5), round(W * (k + 1) / 5)) for k in range(5)]

# 3) 每一塊裁掉空白，縮到同樣高度，底部對齊放進同樣大小的畫布
pieces = []
for a, b in merged:
    part = im.crop((a, 0, b, H))
    bbox = part.getbbox()
    pieces.append(part.crop(bbox) if bbox else part)
TH = 360
scale = TH / max(p.height for p in pieces)  # 用最高的那一株當基準：小的就是小的，看得出長大
CW = max(round(p.width * scale) for p in pieces)
out = APP / "img"
out.mkdir(exist_ok=True)
for k, p in enumerate(pieces, 1):
    r = p.resize((max(1, round(p.width * scale)), max(1, round(p.height * scale))), Image.LANCZOS)
    canvas = Image.new("RGBA", (CW, TH), (0, 0, 0, 0))
    canvas.paste(r, ((CW - r.width) // 2, TH - r.height), r)
    f = out / f"plant-{kind}-{k}.png"
    canvas.save(f, optimize=True)
    print(f, canvas.size, f"{f.stat().st_size // 1024} KB")
