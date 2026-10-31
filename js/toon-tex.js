// Перекраска фотографичных текстур моделей под мультяшный стиль прямо при загрузке: сглаживаем мелкий шум,
// делаем цвета сочнее, яркость — ступенями. Карты нормалей и шероховатости снимаем: на мульт-материале они не нужны,
// а шума и видеопамяти добавляют. Одна картинка на несколько материалов считается один раз.
import * as THREE from "./vendor/three.module.js";

const STEPS = 6, MIX = 0.7;
const done = new WeakMap();

// Перекрасить картинку, вернуть холст. size — предел стороны, smooth — во сколько раз ужать для сглаживания
// (2 — только шум, 16 — смывает и рисунок: грязь, граффити), sat — сочность, gain и lift — поднять тёмное (lift — цвет теней)
export function paintImage(img, { size = 512, smooth = 2, sat = 1.25, gain = 1, lift = [0, 0, 0] } = {}) {
    const k = Math.min(1, size / Math.max(img.width, img.height));
    const w = Math.round(img.width * k), h = Math.round(img.height * k);
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.imageSmoothingQuality = "high";
    // сглаживание: уменьшить и растянуть обратно (filter: blur на iPhone не работает)
    const small = document.createElement("canvas");
    small.width = Math.max(1, Math.round(w / smooth)); small.height = Math.max(1, Math.round(h / smooth));
    const sg = small.getContext("2d");
    sg.imageSmoothingQuality = "high";
    sg.drawImage(img, 0, 0, small.width, small.height);
    g.drawImage(small, 0, 0, w, h);
    const data = g.getImageData(0, 0, w, h), p = data.data;
    for (let i = 0; i < p.length; i += 4) {
        const r = p[i], gr = p[i + 1], b = p[i + 2], l = 0.3 * r + 0.59 * gr + 0.11 * b;
        const stepped = Math.round(l / 255 * STEPS) / STEPS * 255, s = l > 1 ? (1 + (stepped / l - 1) * MIX) * gain : gain;
        p[i] = (l + (r - l) * sat) * s + lift[0];
        p[i + 1] = (l + (gr - l) * sat) * s + lift[1];
        p[i + 2] = (l + (b - l) * sat) * s + lift[2];
    }
    g.putImageData(data, 0, 0);
    return c;
}

function paint(map, opts) {
    const img = map.image;
    if (!img?.width) return map;
    if (done.has(img)) return done.get(img);
    const t = new THREE.CanvasTexture(paintImage(img, opts));
    for (const key of ["encoding", "flipY", "wrapS", "wrapT", "anisotropy"]) t[key] = map[key];
    t.repeat.copy(map.repeat); t.offset.copy(map.offset); t.center.copy(map.center); t.rotation = map.rotation;
    t.needsUpdate = true;
    done.set(img, t);
    return t;
}

export function cartoonModel(root, opts) {
    root.traverse((o) => {
        if (!o.isMesh) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
            if (!m?.isMeshStandardMaterial) continue;
            if (m.map) { const old = m.map; m.map = paint(old, opts); if (m.map !== old) old.dispose(); }
            for (const k of ["normalMap", "roughnessMap", "metalnessMap"]) if (m[k]) { m[k].dispose(); m[k] = null; }
            m.roughness = Math.max(m.roughness ?? 1, 0.8);
            m.metalness = Math.min(m.metalness ?? 0, 0.1);
            m.needsUpdate = true;
        }
    });
}
