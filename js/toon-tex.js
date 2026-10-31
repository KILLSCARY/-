// Перекраска фотографичных текстур моделей под мультяшный стиль прямо при загрузке: сглаживаем мелкий шум,
// делаем цвета сочнее, яркость — ступенями. Карты нормалей и шероховатости снимаем: на мульт-материале они не нужны,
// а шума и видеопамяти добавляют. Одна картинка на несколько материалов считается один раз.
import * as THREE from "./vendor/three.module.js";

const SIZE = 512, STEPS = 6, MIX = 0.7, SAT = 1.25;
const done = new WeakMap();

function paint(map) {
    const img = map.image;
    if (!img?.width) return map;
    if (done.has(img)) return done.get(img);
    const w = Math.min(SIZE, img.width), h = Math.min(SIZE, img.height);
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.imageSmoothingQuality = "high";
    // сглаживание: уменьшить вдвое и растянуть обратно (filter: blur на iPhone не работает)
    const half = document.createElement("canvas");
    half.width = Math.max(1, w >> 1); half.height = Math.max(1, h >> 1);
    const hg = half.getContext("2d");
    hg.imageSmoothingQuality = "high";
    hg.drawImage(img, 0, 0, half.width, half.height);
    g.drawImage(half, 0, 0, w, h);
    const data = g.getImageData(0, 0, w, h), p = data.data;
    for (let i = 0; i < p.length; i += 4) {
        const r = p[i], gr = p[i + 1], b = p[i + 2], l = 0.3 * r + 0.59 * gr + 0.11 * b;
        const stepped = Math.round(l / 255 * STEPS) / STEPS * 255, k = l > 1 ? 1 + (stepped / l - 1) * MIX : 1;
        p[i] = (l + (r - l) * SAT) * k;
        p[i + 1] = (l + (gr - l) * SAT) * k;
        p[i + 2] = (l + (b - l) * SAT) * k;
    }
    g.putImageData(data, 0, 0);
    const t = new THREE.CanvasTexture(c);
    for (const key of ["encoding", "flipY", "wrapS", "wrapT", "anisotropy"]) t[key] = map[key];
    t.repeat.copy(map.repeat); t.offset.copy(map.offset); t.center.copy(map.center); t.rotation = map.rotation;
    t.needsUpdate = true;
    done.set(img, t);
    return t;
}

export function cartoonModel(root) {
    root.traverse((o) => {
        if (!o.isMesh) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
            if (!m?.isMeshStandardMaterial) continue;
            if (m.map) { const old = m.map; m.map = paint(old); if (m.map !== old) old.dispose(); }
            for (const k of ["normalMap", "roughnessMap", "metalnessMap"]) if (m[k]) { m[k].dispose(); m[k] = null; }
            m.roughness = Math.max(m.roughness ?? 1, 0.8);
            m.metalness = Math.min(m.metalness ?? 0, 0.1);
            m.needsUpdate = true;
        }
    });
}
