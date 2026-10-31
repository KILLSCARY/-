import * as THREE from './vendor/three.module.js';
import { loadModel, preloadModel } from './models.js';

// Декорации главы (docs/story-3d-brief.md). x — от центра дороги; z — от центра сцены; sidewalk — стоит на тротуаре.
// Модели смотрят в +Z: к герою — без поворота, к дороге справа — −π/2, слева — π/2
const PROPS = {
    1: [
        { url: 'models/story/station.glb?v=2', x: 6.1, z: 0, height: 3, rotation: -Math.PI / 2, sidewalk: true, glow: .75 },
    ],
    2: [
        { url: 'models/story/cordon.glb?v=2', x: 3.5, z: 0, height: 1.7, rotation: -.25 }, // у бордюра: мимо них пробегают, полоса свободна
        { url: 'models/obj/lite/patrol1.glb', x: 4.3, z: -3.6, height: 1.65, rotation: Math.PI / 2 },
        { url: 'models/obj/lite/cop.glb', x: 3.1, z: .9, height: 1.85, clip: 'talk' },
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
// план камеры: откуда (z — от центра сцены) и куда смотрит. Герой остаётся в кадре, сцена — рядом с ним
const SHOTS = {
    1: { pos: [-.9, 3, 13], look: [2.3, 1.4, -1] },
    2: { pos: [-.9, 2.9, 13], look: [1.5, 1.1, -1] },
    3: { pos: [.9, 3, 13], look: [-2.6, 1.7, -1] },
};

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
        if (chapter === 3) { // фасад штаба — тонкая стенка: за ним пристройка до дома, иначе сбоку видны щели и улица насквозь
            const annex = new THREE.Mesh(new THREE.BoxGeometry(8, 4.3, 3.5), new THREE.MeshStandardMaterial({ color: 0x2d2a33, roughness: 1 }));
            annex.position.set(-10.75, 2.33, 0);
            this.root.add(annex);
        }
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
