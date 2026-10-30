import * as THREE from './vendor/three.module.js';
import { loadModel, preloadModel } from './models.js';

const PROPS = {
    1: [],
    2: [
        { url: 'models/obj/lite/patrol1.glb', x: 2.5, z: -4.5, height: 1.65, rotation: Math.PI / 2 },
        { url: 'models/obj/lite/cop.glb', x: 1.3, z: -.7, height: 1.85, clip: 'talk' },
    ],
    3: [],
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

// A shallow entrance fitted to the street-facing plane of the existing building.
function headquartersEntrance() {
    const group = new THREE.Group();
    const frame = new THREE.MeshStandardMaterial({ color: 0x302c2d, roughness: .85 });
    const door = new THREE.MeshStandardMaterial({ color: 0x343e48, roughness: .65, metalness: .45 });
    const inset = new THREE.MeshStandardMaterial({ color: 0x202933, roughness: .72, metalness: .35 });
    const trim = new THREE.MeshStandardMaterial({ color: 0x756450, roughness: .7, metalness: .25 });
    const lamp = new THREE.MeshBasicMaterial({ color: 0xffbd62 });
    const add = (material, w, h, d, x, y, z) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
        mesh.position.set(x, y, z); group.add(mesh);
    };
    add(frame, 3.7, 3.9, .22, 0, 1.95, 0);
    for (const x of [-1.78, 1.78]) add(frame, .14, 3.9, 1.05, x, 1.95, -.48);
    add(frame, 3.7, .16, 1.05, 0, 3.82, -.48);
    add(door, 3, 2.75, .14, 0, 1.4, .17);
    for (const x of [-.76, .76]) {
        add(inset, 1.25, 1.55, .035, x, 1.83, .26);
        add(inset, 1.25, .65, .035, x, .61, .26);
    }
    add(trim, .07, 2.75, .06, 0, 1.4, .27);
    for (const x of [-1.65, 1.65]) add(trim, .16, 3.1, .2, x, 1.55, .2);
    for (const x of [-.22, .22]) add(trim, .04, .38, .08, x, 1.12, .28);
    add(frame, 3.9, .22, .55, 0, 3.15, .27);
    for (const x of [-1.15, 1.15]) add(lamp, .48, .055, .17, x, 3.02, .48);
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 192;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#18212b'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#bda471'; ctx.lineWidth = 4; ctx.strokeRect(8, 8, 1008, 176);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffe0a1'; ctx.font = 'bold 84px sans-serif'; ctx.fillText('ШТАБ', 512, 72);
    ctx.fillStyle = '#d2d8df'; ctx.font = '25px sans-serif'; ctx.fillText('ПОСЛЕДНИЙ ЭКЗАМЕН', 512, 143);
    const signTexture = new THREE.CanvasTexture(canvas);
    signTexture.encoding = THREE.sRGBEncoding;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.45, .65), new THREE.MeshBasicMaterial({ map: signTexture }));
    sign.position.set(0, 3.55, .14); group.add(sign);
    add(trim, 3.8, .12, .7, 0, .06, .29);
    const light = new THREE.PointLight(0xffaa54, 1.3, 5, 2);
    light.position.set(0, 2.9, 1.15);
    group.add(light);
    group.rotation.y = Math.PI / 2;
    return group;
}

export class StoryStage {
    constructor(scene, chapter, x, loader = loadModel, world = null) {
        this.scene = scene;
        this.chapter = chapter;
        this.mixers = [];
        this.root = new THREE.Group();
        this.root.position.set(x, 0, -7);
        scene.add(this.root);
        if (chapter === 1) {
            const chunks = world?.winter?.chunks || [];
            const candidates = [chunks[0], chunks[3]].filter(Boolean);
            const nearest = candidates.reduce((best, chunk) => !best || Math.abs(chunk.position.z) < Math.abs(best.position.z) ? chunk : best, null);
            this.exchangeZ = nearest ? nearest.position.z - .5 : -4;
            if (nearest) {
                const frame = new THREE.MeshStandardMaterial({ color: 0x526579, roughness: .8 });
                const snow = new THREE.MeshStandardMaterial({ color: 0xe4edf7, roughness: 1 });
                const add = (material, sx, sy, sz, px, py, pz) => {
                    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
                    mesh.position.set(px - x, py, pz - this.root.position.z); this.root.add(mesh);
                };
                for (const offset of [-2.1, 2.1]) add(frame, .25, 2.8, .15, 8.0, 1.55, this.exchangeZ + offset);
                add(frame, .55, .14, 4.55, 7.96, 3.08, this.exchangeZ);
                add(snow, .65, .14, 4.65, 7.93, 3.22, this.exchangeZ);
            }
        }
        if (chapter === 2) {
            const light = new THREE.PointLight(0xffd8aa, 1.5, 8, 2);
            light.position.set(1.3, 3, 0);
            this.root.add(light);
        }
        if (chapter === 3) {
            const entrance = headquartersEntrance();
            entrance.position.set(-6.1 - x, .18, -7);
            this.root.add(entrance);
        }
        for (const prop of PROPS[chapter] || []) loader(prop.url, gltf => {
            const model = gltf.scene;
            if (this.disposed) { disposeModel(model); return; }
            const placement = new THREE.Group();
            placement.add(model);
            placement.rotation.y = prop.rotation || 0;
            placement.updateMatrixWorld(true);
            const bounds = new THREE.Box3().setFromObject(placement);
            const size = bounds.getSize(new THREE.Vector3());
            if (!Number.isFinite(size.y) || size.y <= 0) { disposeModel(model); return; }
            const scale = prop.height / size.y, center = bounds.getCenter(new THREE.Vector3());
            placement.scale.setScalar(scale);
            placement.position.set(prop.x - (prop.sidewalk ? x : 0) - center.x * scale,
                (prop.sidewalk ? .18 : 0) - bounds.min.y * scale, prop.z - center.z * scale);
            this.root.add(placement);
            const clip = prop.clip && (gltf.animations || []).find(a => a.name === prop.clip);
            if (clip) { const mixer = new THREE.AnimationMixer(model); mixer.clipAction(clip).play(); this.mixers.push(mixer); }
        }, () => {});
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
