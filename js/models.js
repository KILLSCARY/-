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

export function loadModel(url, onLoad, onError = () => {}, { deferred = false } = {}) {
    if (deferred) return void later(() => loadModel(url, onLoad, onError));
    if (!url.endsWith(".json")) return loader.load(url, onLoad, undefined, onError);
    fetch(url)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status} ${url}`))))
        .then((j) => loader.parse(base64ToBuffer(j.glb), "", onLoad, onError))
        .catch(onError);
}
