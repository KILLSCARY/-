import * as THREE from './vendor/three.module.js';
import { loadModel, preloadModel } from './models.js';

const PROPS = {
    1: [{ url: 'models/story/station.glb', x: -3.6, z: 0, height: 3.1 }],
    2: [{ url: 'models/story/cordon.glb', x: 2.5, z: 0, height: 1.6 },
        { url: 'models/story/case.glb', x: 1.6, z: 1, height: .45 }],
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
    const door = new THREE.MeshStandardMaterial({ color: 0x544638, emissive: 0x35200c, emissiveIntensity: .65, roughness: .78, metalness: .2 });
    const trim = new THREE.MeshStandardMaterial({ color: 0x756450, roughness: .7, metalness: .25 });
    const lamp = new THREE.MeshBasicMaterial({ color: 0xffbd62 });
    const add = (material, w, h, d, x, y, z) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
        mesh.position.set(x, y, z); group.add(mesh);
    };
    add(frame, 3.7, 3.9, .22, 0, 1.95, 0);
    add(door, 3, 2.75, .14, 0, 1.4, .17);
    add(trim, .07, 2.75, .06, 0, 1.4, .27);
    for (const x of [-1.65, 1.65]) add(trim, .16, 3.1, .2, x, 1.55, .2);
    for (const x of [-.22, .22]) add(trim, .04, .38, .08, x, 1.12, .28);
    add(frame, 3.9, .22, .55, 0, 3.15, .27);
    for (const x of [-1.15, 1.15]) add(lamp, .48, .055, .17, x, 3.02, .48);
    add(lamp, 1.25, .055, .12, 0, 3.68, .15);
    add(trim, 3.8, .12, .7, 0, .06, .29);
    const light = new THREE.PointLight(0xffaa54, 1.3, 5, 2);
    light.position.set(0, 2.9, 1.15);
    group.add(light);
    group.rotation.y = Math.PI / 2;
    return group;
}

export class StoryStage {
    constructor(scene, chapter, x, loader = loadModel) {
        this.scene = scene;
        this.root = new THREE.Group();
        this.root.position.set(x, 0, -7);
        scene.add(this.root);
        if (chapter === 3) {
            const entrance = headquartersEntrance();
            entrance.position.set(-6.95 - x, .18, -7);
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
        }, () => {});
    }
    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.scene.remove(this.root);
        for (const model of [...this.root.children]) { this.root.remove(model); disposeModel(model); }
    }
}
