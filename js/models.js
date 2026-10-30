// Загрузка .glb-моделей. Где хостинг не отдаёт .glb (например, страница на claude.ai),
// модель кладётся рядом как «имя.glb.json» = {"glb": "<base64>"} — её читаем fetch-ем и разбираем сами,
// без data:-ссылок, которые такие страницы блокируют.
import * as THREE from "./vendor/three.module.js";
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

// Персонажи (сетки со скелетом) — не металлические. Оставляем мягкий блик, чтобы кожа, ткань и шерсть не выглядели
// пластиковой фигуркой, но не даём ночному неону превращать их в мокрое зеркало.
export function matteCharacters(root) {
    root.traverse((o) => {
        if (!o.isSkinnedMesh) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
            if (!m || !m.isMeshStandardMaterial) continue;
            m.metalness = 0;
            m.metalnessMap = null;
            m.roughness = Math.max(m.roughness ?? 1, 0.72);
            m.envMapIntensity = 0.42;
            // Нормали не должны быть «шершавыми» как асфальт: чуть ослабляем их, чтобы лицо и одежда читались чисто.
            if (m.normalMap) m.normalScale.setScalar(Math.min(0.85, m.normalScale.x || 0.85));
            m.aoMapIntensity = Math.min(1, Math.max(m.aoMapIntensity ?? 1, 0.85));
            // Очень дешёвый заполняющий цвет: персонаж остаётся читаемым в тени без нового источника света.
            if (!m.userData.softFill) {
                m.emissive.lerp(m.color, 0.14);
                m.emissiveIntensity = Math.max(m.emissiveIntensity ?? 1, 0.42);
                m.userData.softFill = true;
            }
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

// HD-текстуры героя: base — путь без окончания, рядом лежат <base>_c.webp (цвет), <base>_n.webp (нормали,
// необязательно) и <base>_c.ktx2 (цвет, сжатый Basis ETC1S) — в той же развёртке, что текстуры внутри .glb, но 2048.
// mode (QUALITY_TIERS[…].hd): "webp" — хорошая графика, цвет и нормали как есть; "ktx2" — средняя: только цвет,
// сжатым в памяти видеокарты (2048 в ETC1S занимает ~2,7 МБ против ~5,3 МБ у обычной 1024 — чётче и легче),
// нормали остаются 1024. Модель показывается сразу со своими, HD подменяет их, когда скачаются; настройки
// (UV-сдвиг gltfpack, повтор, анизотропия) берём у старой текстуры. Не скачались/не распаковались — остаются обычные
const hdCache = new Map();
let ktx2 = null, ktxRenderer = null;
export const setKtx2Renderer = (r) => { ktxRenderer = r; };
const hdTexture = (url) => {
    if (!hdCache.has(url)) hdCache.set(url, new Promise((ok) => {
        if (!url.endsWith(".ktx2")) return new THREE.TextureLoader().load(url, ok, undefined, () => ok(null));
        // распаковщик Basis (WebAssembly, ~0,5 МБ) — только когда понадобился
        import("./vendor/jsm/KTX2Loader.js").then(({ KTX2Loader }) => {
            ktx2 ||= new KTX2Loader().setTranscoderPath("js/vendor/basis/").detectSupport(ktxRenderer);
            ktx2.load(url, ok, undefined, () => ok(null));
        }).catch(() => ok(null));
    }));
    return hdCache.get(url);
};
export function upgradeTextures(root, base, mode = "webp") {
    if (!base || !mode || (mode === "ktx2" && !ktxRenderer)) return;
    const files = mode === "ktx2" ? [["map", "_c.ktx2"]] : [["map", "_c.webp"], ["normalMap", "_n.webp"]];
    // HD-нормали — только если у модели есть карта нормалей (у Денчика её нет: запрос _n.webp был всегда 404)
    let normals = false;
    root.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) if (m?.normalMap) normals = true; });
    for (const [key, suffix] of files) if (key !== "normalMap" || normals) hdTexture(`${base}${suffix}`).then((hd) => {
        if (!hd) return;
        root.traverse((o) => {
            if (!o.isMesh) return;
            for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
                const old = m?.[key];
                if (!old || old.userData.hd) continue;
                const t = hd.clone(); // свой объект на материал: повтор/сдвиг UV у сеток бывают разные
                for (const k of ["flipY", "encoding", "wrapS", "wrapT", "anisotropy", "channel", "matrixAutoUpdate"]) if (k in old) t[k] = old[k];
                t.repeat.copy(old.repeat); t.offset.copy(old.offset); t.center.copy(old.center); t.rotation = old.rotation;
                if (!old.matrixAutoUpdate) t.matrix.copy(old.matrix);
                t.userData.hd = true;
                t.needsUpdate = true;
                m[key] = t;
                m.needsUpdate = true;
            }
        });
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
