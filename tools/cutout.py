# Вырезает объекты с серого фона.
#   cutout.py detect <src> <preview.jpg>                 — найти объекты, нарисовать рамки
#   cutout.py cut <src> <out.png> x0 y0 x1 y1 [maxh]     — вырезать объект в PNG с альфой
import sys, numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

def bg_model(a):
    h, w, _ = a.shape
    ys, xs = np.mgrid[0:h, 0:w]
    m = np.zeros((h, w), bool)
    m[:24] = True; m[:, :24] = True; m[:, -24:] = True; m[-24:] = True
    X = np.stack([np.ones(m.sum()), xs[m] / w, ys[m] / h, (xs[m] / w) ** 2, (ys[m] / h) ** 2, xs[m] * ys[m] / (w * h)], 1)
    full = np.stack([np.ones(h * w), xs.ravel() / w, ys.ravel() / h, (xs.ravel() / w) ** 2, (ys.ravel() / h) ** 2, xs.ravel() * ys.ravel() / (w * h)], 1)
    out = np.zeros_like(a)
    for c in range(3):
        coef, *_ = np.linalg.lstsq(X, a[..., c][m], rcond=None)
        out[..., c] = (full @ coef).reshape(h, w)
    return out

def alpha_of(a):
    bg = bg_model(a)
    diff = np.abs(a - bg).max(2)
    sat = a.max(2) - a.min(2)
    score = np.maximum(diff, sat * 1.4)
    alpha = np.clip((score - 14) / 22, 0, 1)
    solid = ndimage.binary_closing(alpha > 0.5, iterations=3)
    # без fill_holes: просветы (между балкой и основанием) остаются прозрачными
    alpha = np.maximum(alpha, solid.astype(np.float32))
    return alpha, solid

mode = sys.argv[1]
img = Image.open(sys.argv[2]).convert("RGB")
a = np.asarray(img).astype(np.float32)
if mode == "detect":
    alpha, solid = alpha_of(a)
    lab, n = ndimage.label(solid)
    d = ImageDraw.Draw(img)
    for i, sl in enumerate(ndimage.find_objects(lab)):
        y, x = sl
        if (y.stop - y.start) * (x.stop - x.start) < 20000: continue
        d.rectangle([x.start, y.start, x.stop, y.stop], outline=(255, 0, 255), width=4)
        d.text((x.start + 8, y.start + 8), f"{x.start},{y.start},{x.stop},{y.stop}", fill=(255, 255, 0))
        print(x.start, y.start, x.stop, y.stop)
    img.resize((img.width // 2, img.height // 2)).save(sys.argv[3], quality=80)
else:
    out = sys.argv[3]
    x0, y0, x1, y1 = map(int, sys.argv[4:8])
    maxh = int(sys.argv[8]) if len(sys.argv) > 8 else 512
    alpha, solid = alpha_of(a)
    # только связная область, пересекающая рамку (без соседних объектов)
    sub = np.zeros_like(solid); sub[y0:y1, x0:x1] = solid[y0:y1, x0:x1]
    lab, n = ndimage.label(sub)
    sizes = ndimage.sum(sub, lab, range(1, n + 1))
    keep = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s > sizes.max() * 0.03])
    keep = ndimage.binary_dilation(keep, iterations=2)
    al = (alpha * keep)[y0:y1, x0:x1]
    al = np.asarray(Image.fromarray((al * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7)))
    rgba = np.dstack([a[y0:y1, x0:x1].astype(np.uint8), al])
    im = Image.fromarray(rgba, "RGBA")
    bb = im.getbbox(); im = im.crop(bb)
    if im.height > maxh: im = im.resize((round(im.width * maxh / im.height), maxh), Image.LANCZOS)
    im.save(out, optimize=True)
    print(out, im.size, round(im.width / im.height, 3))
