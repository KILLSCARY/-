import * as THREE from './vendor/three.module.js';
import { loadModel, preloadModel } from './models.js';

// Декорации главы (docs/story-3d-brief.md). x — от центра дороги; z — от центра сцены; sidewalk — стоит на тротуаре.
// Модели смотрят в +Z: к герою — без поворота, к дороге справа — −π/2, слева — π/2
const PROPS = {
    1: [
        { url: 'models/story/station.glb?v=2', x: 6.1, z: 0, height: 3, rotation: -Math.PI / 2, sidewalk: true, glow: .75 },
    ],
    2: [
        // у бордюра: мимо них пробегают, полоса свободна. Ограждение — по пояс (было 1,7 м: выше инспектора, он стоял
        // внутри него карликом), инспектор — в рост перед ним, машина — за ограждением, а не в нём
        { url: 'models/story/cordon.glb?v=2', x: 3.6, z: 0, height: 1.15, rotation: -.25 },
        { url: 'models/obj/lite/patrol1.glb', x: 4.6, z: -5.2, height: 1.65, rotation: Math.PI / 2 },
        { url: 'models/obj/lite/cop.glb', x: 2.9, z: 1.7, height: 1.8, clip: 'talk' },
    ],
    // глава 1 пройдена: герой дошёл до станции, Горилла встречает его у обочины, перед оградой (за ней его не видно),
    // лицом к герою; подсвечен своей текстурой, как станция. arrivalSolo — бежишь за самого Гориллу: встречать некому
    arrival: [
        { url: 'models/story/station.glb?v=2', x: 6.1, z: 0, height: 3, rotation: -Math.PI / 2, sidewalk: true, glow: .75 },
        { url: 'models/gorilla_hero.glb?v=6', x: 2.8, z: 2.4, height: 1.9, rotation: -Math.PI / 4, glow: .35, clip: 'cheer' },
    ],
    arrivalSolo: [
        { url: 'models/story/station.glb?v=2', x: 6.1, z: 0, height: 3, rotation: -Math.PI / 2, sidewalk: true, glow: .75 },
    ],
    3: [
        { url: 'models/story/headquarters.glb?v=2', x: -6.3, z: 0, height: 5.4, rotation: Math.PI / 2, sidewalk: true, glow: .55 },
    ],
};
// вывески — поверх модели, своим шрифтом: на готовых моделях надписей нет
const SIGNS = {
    1: { title: 'ОБМЕН', sub: 'USDT · RUB · 24/7', x: 5.0, y: 3.15, z: 0, rotation: -Math.PI / 2, width: 2.4 },
    3: { title: 'ШТАБ', sub: 'ПОСЛЕДНИЙ ЭКЗАМЕН', x: -5.6, y: 4.05, z: .4, rotation: Math.PI / 2 - .6, width: 3.8 },
};
SIGNS.arrival = SIGNS.arrivalSolo = SIGNS[1];
// план камеры: откуда (z — от центра сцены) и куда смотрит. Герой остаётся в кадре, сцена — рядом с ним
const SHOTS = {
    1: { pos: [-.9, 3, 13], look: [2.3, 1.4, -1] },
    2: { pos: [-.9, 2.9, 13], look: [1.5, 1.1, -1] },
    3: { pos: [.9, 3, 13], look: [-2.6, 1.7, -1] },
};
SHOTS.arrival = SHOTS.arrivalSolo = SHOTS[1];

export const preloadStoryStage = chapter => Promise.all((PROPS[chapter] || []).map(prop => preloadModel(prop.url)));

function disposeModel(model) {
    const textures = new Set(), materials = new Set(), geometries = new Set();
    model.traverse(o => {
        if (o.geometry) geometries.add(o.geometry);
        for (const material of [].concat(o.material || [])) {
            materials.add(material);
            for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
        }
    });
    textures.forEach(t => t.dispose()); materials.forEach(m => m.dispose()); geometries.forEach(g => g.dispose());
}

// вывеска: тёмная панель с золотой рамкой, надпись шрифтом игры и мягкое свечение вокруг
function drawSign(ctx, { title, sub }) {
    const W = 1024, H = 320;
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#1b1f2c'); bg.addColorStop(1, '#090b12');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#ffc861'; ctx.lineWidth = 10; ctx.strokeRect(14, 14, W - 28, H - 28);
    ctx.strokeStyle = 'rgba(255, 200, 97, .35)'; ctx.lineWidth = 3; ctx.strokeRect(30, 30, W - 60, H - 60);
    ctx.fillStyle = '#e3343a'; ctx.fillRect(30, 228, W - 60, 62);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const gold = ctx.createLinearGradient(0, 50, 0, 200);
    gold.addColorStop(0, '#fff3c4'); gold.addColorStop(.55, '#ffd266'); gold.addColorStop(1, '#f2a93b');
    ctx.font = '800 118px Unbounded, sans-serif';
    ctx.shadowColor = 'rgba(255, 190, 80, .85)'; ctx.shadowBlur = 26;
    ctx.fillStyle = gold; ctx.fillText(title, W / 2, 128);
    ctx.shadowBlur = 0;
    ctx.font = '600 40px Oswald, sans-serif';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '6px';
    ctx.fillStyle = '#fff'; ctx.fillText(sub, W / 2, 260);
}

function makeSign({ title, sub, x, y, z, rotation, width }) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 320;
    const ctx = canvas.getContext('2d'), height = width * 320 / 1024;
    drawSign(ctx, { title, sub });
    const texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    // шрифт мог не успеть загрузиться: перерисовываем, как только он готов
    document.fonts?.load?.('800 118px Unbounded').then(() => { if (ctx.letterSpacing !== undefined) ctx.letterSpacing = '0px'; drawSign(ctx, { title, sub }); texture.needsUpdate = true; }, () => {});
    // MeshBasic светится сам: новые источники света заставили бы пересобрать шейдеры всей сцены (фриз). Без тумана — надпись читается издалека
    const sign = new THREE.Group();
    const face = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, fog: false }));
    face.position.z = .06;
    const box = new THREE.Mesh(new THREE.BoxGeometry(width + .08, height + .08, .1), new THREE.MeshBasicMaterial({ color: 0x07080d, fog: false }));
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(width * 1.35, height * 1.9), new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false, opacity: .55 }));
    halo.position.z = -.06;
    sign.add(halo, box, face);
    sign.position.set(x, y, z); sign.rotation.y = rotation;
    return sign;
}

// Здание штаба: своё, нарисованное под ночной кадр, закрывает уличные дома за входом. Входная группа — модель перед ним
const HQ_BLOCK = { width: 24, height: 22, depth: 2, front: -6.85, zFrom: -10 };

function paintHeadquarters(ctx, w, h) {
    const mx = w / HQ_BLOCK.width, ground = 5.8 * mx, floor = 3.2 * mx;
    let seed = 7;
    const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
    ctx.fillStyle = '#3a2f4d'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(16, 11, 26, .22)'; // кирпичная кладка
    for (let y = 0; y < h; y += 8) ctx.fillRect(0, y, w, 1);
    for (let y = 0, row = 0; y < h; y += 8, row++) for (let x = row % 2 * 8; x < w; x += 16) ctx.fillRect(x, y, 1, 8);
    for (let top = h - ground - floor, n = 0; top > -floor; top -= floor, n++) {
        ctx.fillStyle = '#54476b'; ctx.fillRect(0, top + floor - 5, w, 5); // межэтажный пояс
        ctx.fillStyle = 'rgba(10, 7, 16, .5)'; ctx.fillRect(0, top + floor, w, 3);
        for (let x = 1.1 * mx; x < w - mx; x += 2.75 * mx) {
            const ww = 1.45 * mx, wh = 1.95 * mx, wy = top + .5 * mx, lit = rnd() < .3;
            ctx.fillStyle = '#54476b'; ctx.fillRect(x - 5, wy - 5, ww + 10, wh + 10); // наличник
            ctx.fillStyle = '#6a5c84'; ctx.fillRect(x - 8, wy + wh + 5, ww + 16, 6); // подоконник
            const g = ctx.createLinearGradient(0, wy, 0, wy + wh);
            if (lit) { g.addColorStop(0, '#ffd27a'); g.addColorStop(1, '#f09a3e'); } else { g.addColorStop(0, '#2b3656'); g.addColorStop(1, '#141a2e'); }
            ctx.fillStyle = g; ctx.fillRect(x, wy, ww, wh);
            ctx.fillStyle = '#231b30'; // переплёт
            ctx.fillRect(x + ww / 2 - 2, wy, 4, wh);
            ctx.fillRect(x, wy + wh * .36 - 2, ww, 4);
        }
    }
    // цоколь: тёмный камень и рольставни по обе стороны от входа
    ctx.fillStyle = '#4a3f5e'; ctx.fillRect(0, h - ground, w, ground);
    ctx.fillStyle = 'rgba(16, 11, 26, .35)'; // крупный руст
    for (let y = h - ground + 28; y < h; y += 28) ctx.fillRect(0, y, w, 2);
    ctx.fillStyle = '#6a5c84'; ctx.fillRect(0, h - ground - 7, w, 7);
    const shutterTop = h - ground + .9 * mx, shutterH = ground - .9 * mx;
    for (let x = .9 * mx; x < w - 2.5 * mx; x += 3.6 * mx) {
        const center = (x + 1.3 * mx) / mx;
        if (Math.abs(center - (HQ_BLOCK.width + HQ_BLOCK.zFrom)) < 3.6) continue; // тут вход: u растёт от ближнего к камере края
        ctx.fillStyle = '#6a5c84'; ctx.fillRect(x - 5, shutterTop - 5, 2.6 * mx + 10, shutterH + 5); // рама
        ctx.fillStyle = '#5c566c'; ctx.fillRect(x, shutterTop, 2.6 * mx, shutterH);
        ctx.fillStyle = '#3b3548';
        for (let y = shutterTop + 6; y < h; y += 9) ctx.fillRect(x, y, 2.6 * mx, 2);
    }
    // свет над входом: тёплые пятна на стене по бокам от двери
    const door = (HQ_BLOCK.width + HQ_BLOCK.zFrom) * mx;
    for (const x of [door - 2.3 * mx, door + 2.3 * mx]) {
        const y = h - ground + 1.6 * mx, glow = ctx.createRadialGradient(x, y, 4, x, y, 1.9 * mx);
        glow.addColorStop(0, 'rgba(255, 200, 120, .75)'); glow.addColorStop(1, 'rgba(255, 170, 90, 0)');
        ctx.fillStyle = glow; ctx.fillRect(x - 1.9 * mx, y - 1.9 * mx, 3.8 * mx, 3.8 * mx);
        ctx.fillStyle = '#fff0c8'; ctx.fillRect(x - 7, y - 11, 14, 22);
    }
}

function makeHeadquartersBlock() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 938;
    paintHeadquarters(canvas.getContext('2d'), canvas.width, canvas.height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    texture.anisotropy = 4;
    const side = new THREE.MeshBasicMaterial({ color: 0x231d30 }), { width, height, depth, front, zFrom } = HQ_BLOCK;
    const block = new THREE.Mesh(new THREE.BoxGeometry(depth, height, width), [new THREE.MeshBasicMaterial({ map: texture }), side, side, side, side, side]);
    block.position.set(front - depth / 2, height / 2, zFrom + width / 2);
    return block;
}

function glowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d'), g = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
    g.addColorStop(0, 'rgba(255, 190, 90, .9)'); g.addColorStop(1, 'rgba(255, 150, 60, 0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
    const texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    return texture;
}

export class StoryStage {
    // z — где встанет центр сцены; сцена едет вместе с улицей, пока герой сбегает на нет (moveBy)
    constructor(scene, chapter, x, loader = loadModel, z = -7) {
        this.scene = scene;
        this.chapter = chapter;
        this.mixers = [];
        this.loaded = 0;
        this.root = new THREE.Group();
        this.root.position.set(0, 0, z);
        scene.add(this.root);
        if (SIGNS[chapter]) this.root.add(makeSign(SIGNS[chapter]));
        if (chapter === 3) this.root.add(makeHeadquartersBlock());
        for (const prop of PROPS[chapter] || []) loader(prop.url, gltf => {
            const model = gltf.scene;
            if (this.disposed) { disposeModel(model); return; }
            const placement = new THREE.Group();
            placement.add(model);
            // ночью тёмная модель сливается с улицей: подсвечиваем её собственной текстурой, без источников света
            if (prop.glow) model.traverse(o => { if (o.isMesh && o.material.map) { o.material.emissive?.set(0xffffff); o.material.emissiveMap = o.material.map; o.material.emissiveIntensity = prop.glow; } });
            placement.rotation.y = prop.rotation || 0;
            placement.updateMatrixWorld(true);
            const bounds = new THREE.Box3().setFromObject(placement);
            const size = bounds.getSize(new THREE.Vector3());
            if (!Number.isFinite(size.y) || size.y <= 0) { disposeModel(model); return; }
            const scale = prop.height / size.y, center = bounds.getCenter(new THREE.Vector3());
            placement.scale.setScalar(scale);
            placement.position.set(prop.x - center.x * scale,
                (prop.sidewalk ? .18 : 0) - bounds.min.y * scale, prop.z - center.z * scale);
            this.root.add(placement);
            this.loaded++;
            const clip = prop.clip && (gltf.animations || []).find(a => a.name === prop.clip);
            if (clip) { const mixer = new THREE.AnimationMixer(model); mixer.clipAction(clip).play(); this.mixers.push(mixer); }
        }, () => {});
    }
    // готова заранее: декорации загружены и скрыты, в нужный момент только появляются (без рывка перед боем)
    get ready() { return (PROPS[this.chapter] || []).length === this.loaded; }
    place(z) { this.root.position.z = z; this.root.visible = true; }
    moveBy(dz) { this.root.position.z += dz; }
    // план камеры в мировых координатах
    shot(pos, look) {
        const s = SHOTS[this.chapter], z = this.root.position.z;
        pos.set(s.pos[0], s.pos[1], z + s.pos[2]);
        look.set(s.look[0], s.look[1], z + s.look[2]);
    }
    update(dt) { for (const mixer of this.mixers) mixer.update(dt); }
    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        for (const mixer of this.mixers) { mixer.stopAllAction(); mixer.uncacheRoot(mixer.getRoot()); }
        this.scene.remove(this.root);
        for (const model of [...this.root.children]) { this.root.remove(model); disposeModel(model); }
    }
}
