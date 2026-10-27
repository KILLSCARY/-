# usage: nightify.py <facade.png> <out_prefix> <width> [lit_share=0.35] [seed=1]
# Дневной фасад (снимок модели Meshy спереди) → ночной: темнее, часть окон горит тёплым светом.
# Пишет <out>_diff.jpg, <out>_glow.jpg (только горящие окна) и <out>_nor.jpg (рельеф из яркости).
import sys, random
import numpy as np
from PIL import Image, ImageFilter

src, out, width = sys.argv[1], sys.argv[2], int(sys.argv[3])
share = float(sys.argv[4]) if len(sys.argv) > 4 else 0.35
random.seed(int(sys.argv[5]) if len(sys.argv) > 5 else 1)

img = Image.open(src).convert("RGB")
img = img.resize((width, round(width * img.height / img.width)), Image.LANCZOS)
a = np.asarray(img).astype(np.float32) / 255
H, W = a.shape[:2]
lum = a @ np.array([0.299, 0.587, 0.114], np.float32)

# окна: стекло темнее стены вокруг (локальная средняя по окну ~ ширина проёма)
r = max(4, W // 90)
local = np.asarray(Image.fromarray((lum * 255).astype(np.uint8)).filter(ImageFilter.BoxBlur(r * 2))).astype(np.float32) / 255
glass = (lum < local - 0.06) & (lum < 0.55)
warmth = a[..., 0] - a[..., 2]  # окна, которые на картинке уже жёлтые, — горят

# связные области стекла (обход в ширину, без scipy); маску чуть раздуваем, чтобы створки одного окна слились
grown = np.asarray(Image.fromarray(glass.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(9))) > 0
label = np.zeros((H, W), np.int32)
merged = []
for y0, x0 in zip(*np.nonzero(grown)):
    if label[y0, x0]:
        continue
    n = len(merged) + 1
    stack = [(y0, x0)]
    label[y0, x0] = n
    ys, xs = [], []
    while stack:
        y, x = stack.pop()
        ys.append(y); xs.append(x)
        for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= yy < H and 0 <= xx < W and grown[yy, xx] and not label[yy, xx]:
                label[yy, xx] = n
                stack.append((yy, xx))
    merged.append((min(ys) + 4, max(ys) - 4, min(xs) + 4, max(xs) - 4))

# окно — область разумного размера и формы; подоконники широкие и низкие, двери узкие, высокие и стоят на земле
wins = []
for y1, y2, x1, x2 in merged:
    h, w = y2 - y1 + 1, x2 - x1 + 1
    if W / 45 < w < W / 6 and H / 45 < h < H / 4 and 0.45 <= w / h <= 1.45 and y2 < H * 0.9:
        wins.append((y1, y2, x1, x2))
merged = wins

near_glass = np.asarray(Image.fromarray(glass.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(5))) > 0
night = a * np.array([0.6, 0.56, 0.58], np.float32)  # темнее и чуть в красное, как старые фасады
glow = np.zeros_like(a)
lit = 0
for y1, y2, x1, x2 in merged:
    if warmth[y1:y2 + 1, x1:x2 + 1].mean() <= 0.04 and random.random() >= share:
        continue
    lit += 1
    # горит всё стекло окна, кроме самой светлой четверти пикселей — это рама и переплёт
    sl = (slice(y1, y2 + 1), slice(x1, x2 + 1))
    m = (lum[sl] < np.percentile(lum[sl], 75)) & near_glass[sl]
    m[int((y2 - y1 + 1) * 0.85):] = False  # нижний край — подоконник, не стекло
    k = random.uniform(0.7, 1.0)
    grad = np.linspace(1.0, 0.72, y2 - y1 + 1, dtype=np.float32)[:, None, None]
    warm = np.broadcast_to(np.array([1.0, 0.66, 0.3], np.float32) * k * grad, (y2 - y1 + 1, x2 - x1 + 1, 3))
    night[sl][m] = warm[m]
    glow[sl][m] = warm[m] * 0.9

Image.fromarray((np.clip(night, 0, 1) * 255).astype(np.uint8)).save(out + "_diff.jpg", quality=84, optimize=True)
Image.fromarray((np.clip(glow, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8)).save(out + "_glow.jpg", quality=84)

# рельеф из яркости, как в maketex.py
small = Image.fromarray((lum * 255).astype(np.uint8)).resize((W // 2, H // 2), Image.LANCZOS).filter(ImageFilter.GaussianBlur(1.2))
h = np.asarray(small).astype(np.float32) / 255
dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5
dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5
nrm = np.dstack([-dx * 4.0, dy * 4.0, np.ones_like(h)])
nrm /= np.linalg.norm(nrm, axis=2, keepdims=True)
Image.fromarray(((nrm * 0.5 + 0.5) * 255).astype(np.uint8)).save(out + "_nor.jpg", quality=88)
print(f"{out}: {W}x{H}, окон {len(merged)}, горит {lit}")
