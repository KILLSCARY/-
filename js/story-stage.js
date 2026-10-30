import * as THREE from './vendor/three.module.js';
import { loadModel, preloadModel } from './models.js';

const PROPS = {
    1: [{ url: 'models/story/station.glb', x: -3.6, z: 0, height: 3.1 }],
    2: [{ url: 'models/story/cordon.glb', x: 2.5, z: 0, height: 1.6 },
        { url: 'models/story/case.glb', x: 1.6, z: 1, height: .45 }],
    3: [{ url: 'models/story/headquarters.glb', x: -3.5, z: 0, height: 4 }],
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

export class StoryStage {
    constructor(scene, chapter, x, loader = loadModel) {
        this.scene = scene;
        this.root = new THREE.Group();
        this.root.position.set(x, 0, -7);
        scene.add(this.root);
        for (const prop of PROPS[chapter] || []) loader(prop.url, gltf => {
            const model = gltf.scene;
            if (this.disposed) { disposeModel(model); return; }
            const bounds = new THREE.Box3().setFromObject(model);
            const size = bounds.getSize(new THREE.Vector3());
            if (!Number.isFinite(size.y) || size.y <= 0) { disposeModel(model); return; }
            const scale = prop.height / size.y, center = bounds.getCenter(new THREE.Vector3());
            model.scale.setScalar(scale);
            model.position.set(prop.x - center.x * scale, -bounds.min.y * scale, prop.z - center.z * scale);
            this.root.add(model);
        }, () => {});
    }
    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.scene.remove(this.root);
        for (const model of [...this.root.children]) { this.root.remove(model); disposeModel(model); }
    }
}
