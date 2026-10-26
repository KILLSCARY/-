# crop.py <src> <out_prefix> x0 y0 x1 y1 <maxw>  -> out_diff.jpg + out_glow.jpg (яркие вывески/витрины)
import sys, numpy as np
from PIL import Image, ImageFilter
src, out = sys.argv[1:3]
x0, y0, x1, y1, maxw = map(int, sys.argv[3:8])
img = Image.open(src).convert("RGB").crop((x0, y0, x1, y1))
if img.width > maxw:
    img = img.resize((maxw, round(img.height * maxw / img.width)), Image.LANCZOS)
img.save(out + "_diff.jpg", quality=85, optimize=True)
a = np.asarray(img).astype(np.float32) / 255
lum = a.max(axis=2)
mask = np.clip((lum - 0.42) / 0.3, 0, 1) ** 1.5
glow = Image.fromarray((a * mask[..., None] * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))
glow.save(out + "_glow.jpg", quality=85)
