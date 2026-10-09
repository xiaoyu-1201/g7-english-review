"""把老師在 ChatGPT 生成的植物圖（一張 5 個成長階段排一排）裁成 5 張：img/plant-<種類>-<1～5>.webp
用法（在 App 資料夾）：python tools\\split_plants.py <圖檔> <種類：sun／cactus／sakura／apple>
1. 清邊：ChatGPT 的去背會留一圈淺色的邊和半透明的霧（深色模式看得到）→ 半透明（alpha < 128）去掉、邊緣往內收 2 像素
   背景如果不是透明的（白色或很淡的顏色）：先從四周往內把接近背景色的像素去掉
2. 切成 5 塊：找植物之間最寬的 4 段空白，從中間切（掉下來的花瓣離樹很近，不會被切開）
3. 每一塊裁掉空白；5 張用同一個比例縮到最高的那張高 360px，底部對齊放進同樣大小的畫布（盆子大小、位置都一樣，看得出長大）
做完要到 app.js 把種類加進 PLANT_ART，例如 const PLANT_ART = ['sun']
"""
import sys, pathlib
from collections import deque
from PIL import Image, ImageFilter

APP = pathlib.Path(__file__).resolve().parent.parent
src, kind = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGBA")
W, H = im.size
px = im.load()

# 背景不透明：四個角的顏色當背景，從邊框往內 flood fill
corners = [px[0, 0], px[W - 1, 0], px[0, H - 1], px[W - 1, H - 1]]
ref = max(corners, key=corners.count)
if ref[3] > 200:
    near = lambda c: abs(c[0] - ref[0]) + abs(c[1] - ref[1]) + abs(c[2] - ref[2]) < 36
    seen = bytearray(W * H)
    q = deque([(x, 0) for x in range(W)] + [(x, H - 1) for x in range(W)] + [(0, y) for y in range(H)] + [(W - 1, y) for y in range(H)])
    while q:
        x, y = q.popleft()
        i = y * W + x
        if seen[i]:
            continue
        seen[i] = 1
        if not near(px[x, y]):
            continue
        px[x, y] = (0, 0, 0, 0)
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < W and 0 <= ny < H and not seen[ny * W + nx]:
                q.append((nx, ny))

# 1. 清邊：半透明的霧去掉；邊緣往內收 2 像素（MinFilter 3×3 兩次）
r, g, b, a = im.split()
a = a.point(lambda v: 255 if v >= 128 else 0)
a = a.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MinFilter(3))
im = Image.merge("RGBA", (r, g, b, a))
px = im.load()

# 2. 切成 5 塊：有東西的直欄 → 最寬的 4 段空白的中間
occ = [sum(1 for y in range(0, H, 2) if px[x, y][3] > 200) > 1 for x in range(W)]
first = occ.index(True)
last = W - 1 - occ[::-1].index(True)
gaps, s = [], None
for x in range(first, last + 1):
    if not occ[x] and s is None:
        s = x
    if occ[x] and s is not None:
        gaps.append((x - s, s, x))
        s = None
cuts = sorted((st + en) // 2 for _, st, en in sorted(gaps, reverse=True)[:4])
if len(cuts) != 4:
    print(f"只找到 {len(cuts)} 段空白；改用平均切成 5 等份")
    cuts = [first + (last - first) * k // 5 for k in range(1, 5)]
bounds = list(zip([first] + cuts, cuts + [last + 1]))

# 3. 每一塊裁掉空白，同一個比例縮放，底部對齊
pieces = []
for x0, x1 in bounds:
    part = im.crop((x0, 0, x1, H))
    bbox = part.getbbox()
    pieces.append(part.crop(bbox) if bbox else part)
TH = 360
scale = TH / max(p.height for p in pieces)
CW = max(round(p.width * scale) for p in pieces) + 8
out = APP / "img"
out.mkdir(exist_ok=True)
for k, p in enumerate(pieces, 1):
    rz = p.resize((max(1, round(p.width * scale)), max(1, round(p.height * scale))), Image.LANCZOS)
    canvas = Image.new("RGBA", (CW, TH), (0, 0, 0, 0))
    canvas.paste(rz, ((CW - rz.width) // 2, TH - rz.height), rz)
    f = out / f"plant-{kind}-{k}.webp"
    canvas.save(f, "WEBP", quality=88, method=6)
    print(f.name, canvas.size, f"{f.stat().st_size // 1024} KB")
