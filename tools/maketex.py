# usage: maketex.py <src.jpg> <out_prefix> <facade|ground>
import sys, numpy as np
from PIL import Image, ImageFilter
src, out, kind = sys.argv[1:4]
img = Image.open(src).convert("RGB")
img.resize((1024, 1024), Image.LANCZOS).save(out + "_diff.jpg", quality=82, optimize=True)
small = img.resize((512, 512), Image.LANCZOS)
a = np.asarray(small).astype(np.float32) / 255
lum = a @ np.array([0.299, 0.587, 0.114], np.float32)
h = np.asarray(Image.fromarray((lum * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))).astype(np.float32) / 255
# сшиваемый Собель (wrap), чтобы карта нормалей тоже тайлилась
dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5
dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5
strength = 6.0 if kind == "ground" else 4.0
n = np.dstack([-dx * strength, dy * strength, np.ones_like(h)])
n /= np.linalg.norm(n, axis=2, keepdims=True)
Image.fromarray(((n * 0.5 + 0.5) * 255).astype(np.uint8)).save(out + "_nor.jpg", quality=90)
if kind == "ground":
    # мокрые (светлые глянцевые) пятна — гладкие, остальное шершавое
    blur = np.asarray(Image.fromarray((lum * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(6))).astype(np.float32) / 255
    rough = np.clip(0.85 - (blur - blur.mean()) * 4.0, 0.15, 1.0)
    Image.fromarray((rough * 255).astype(np.uint8)).save(out + "_rough.jpg", quality=85)
else:
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    warm = np.clip((r - b) * 3.0 - 0.25, 0, 1) * np.clip(lum * 2.2 - 0.2, 0, 1)
    m = Image.fromarray((warm * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
    # цвет свечения = цвет окна, умноженный на маску
    glow = (a * (np.asarray(m).astype(np.float32)[..., None] / 255) * 255).astype(np.uint8)
    Image.fromarray(glow).save(out + "_glow.jpg", quality=85)
