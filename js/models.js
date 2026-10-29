// Загрузка .glb-моделей. Где хостинг не отдаёт .glb (например, страница на claude.ai),
// модель кладётся рядом как «имя.glb.json» = {"glb": "<base64>"} — её читаем fetch-ем и разбираем сами,
// без data:-ссылок, которые такие страницы блокируют.
import { GLTFLoader } from "./vendor/jsm/GLTFLoader.js";

// Модели упакованы gltfpack без meshopt-сжатия (только квантование вершин): распаковщик meshopt
// работает на WebAssembly, а страницы со строгой CSP (claude.ai) его запрещают.
const loader = new GLTFLoader();

function base64ToBuffer(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
}

// Сначала грузится герой, всё остальное (препятствия, витрины, спрайты) — после него: иначе на телефоне
// 8 МБ моделей делят канал с героем, и он появляется секунд через десять. Страховка — 6 с.
let release;
const gate = new Promise((r) => (release = r));
setTimeout(() => release(), 6000);
export const releaseQueue = () => release();
export const later = (fn) => gate.then(fn);

// Персонажи (сетки со скелетом) — матовые: у моделей Meshy металличность 0.1 и шероховатость 0.75, и на ночной
// улице кожа и одежда ловят отражения неба и неона — выглядят масляными и «зеркальными». Ткань и кожа так не блестят.
export function matteCharacters(root) {
    root.traverse((o) => {
        if (!o.isSkinnedMesh) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
            if (!m || !m.isMeshStandardMaterial) continue;
            m.metalness = 0;
            m.metalnessMap = null;
            m.roughness = Math.max(m.roughness ?? 1, 0.93);
            m.envMapIntensity = 0.28; // отражения окружения — едва-едва, только чтобы не было плоско
            m.needsUpdate = true;
        }
    });
}

// Анизотропная фильтрация текстур моделей: без неё (по умолчанию 1) бочки, машины, барьеры и одежда героя под углом
// к камере расплывались в мыло. Уровень ставит игра по графике (setModelAnisotropy) — до загрузки моделей
let aniso = 1;
export const setModelAnisotropy = (n) => { aniso = n; };
function sharpen(root) {
    if (aniso <= 1) return;
    root.traverse((o) => {
        if (!o.isMesh) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) for (const k of ["map", "normalMap", "emissiveMap"]) {
            const t = m?.[k];
            if (t && t.anisotropy < aniso) { t.anisotropy = aniso; t.needsUpdate = true; }
        }
    });
}

// Заранее скачанные модели (байты): бойцов босса качаем ещё в забеге, чтобы встреча с ним не стояла на загрузке.
// Храним байты, а не готовую сцену: бой свою модель потом выкидывает, а из байтов каждый раз собирается свежая.
const bytes = new Map();
export function preloadModel(url) {
    if (!url || url.endsWith(".json")) return Promise.resolve(null);
    if (!bytes.has(url)) bytes.set(url, fetch(url).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null)
        .then((b) => { if (!b) bytes.delete(url); return b; }));
    return bytes.get(url);
}

export function loadModel(url, onLoad, onError = () => {}, { deferred = false } = {}) {
    if (deferred) return void later(() => loadModel(url, onLoad, onError));
    const done = onLoad;
    onLoad = (gltf) => { matteCharacters(gltf.scene); sharpen(gltf.scene); gltf.scene.userData.src = url; done(gltf); }; // src — откуда модель (замеры нагрузки)
    if (bytes.has(url)) return void bytes.get(url).then((b) => (b ? loader.parse(b, "", onLoad, onError) : loader.load(url, onLoad, undefined, onError)));
    if (!url.endsWith(".json")) return loader.load(url, onLoad, undefined, onError);
    fetch(url)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status} ${url}`))))
        .then((j) => loader.parse(base64ToBuffer(j.glb), "", onLoad, onError))
        .catch(onError);
}
