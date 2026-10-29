import * as THREE from './vendor/three.module.js';
import { mergeBufferGeometries } from './vendor/jsm/BufferGeometryUtils.js';

// Неподвижные детали объединяем по материалу и участкам улицы, а не в один огромный меш:
// сохраняются отсечение камерой и кольцевое движение, без сотен отдельных draw calls.
export function batchScenery(objects, { behind, chunkSize = 32 }) {
    const chunks = new Map(), originalGeometry = new Set();
    for (const object of objects) {
        object.updateMatrixWorld(true);
        const key = Math.floor((behind - object.position.z) / chunkSize);
        if (!chunks.has(key)) chunks.set(key, { z: behind - (key + .5) * chunkSize, materials: new Map() });
        const chunk = chunks.get(key);
        object.traverse(o => {
            if (!o.isMesh) return;
            if (o.isSkinnedMesh || Array.isArray(o.material)) throw new Error('Scenery batching requires static meshes with one material');
            let geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
            geo.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0, -chunk.z).multiply(o.matrixWorld));
            for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
            if (!chunk.materials.has(o.material)) chunk.materials.set(o.material, []);
            chunk.materials.get(o.material).push(geo);
            originalGeometry.add(o.geometry);
        });
    }
    const result = [];
    for (const chunk of chunks.values()) {
        const root = new THREE.Group();
        root.position.z = chunk.z;
        for (const [material, geometries] of chunk.materials) {
            const geometry = mergeBufferGeometries(geometries);
            if (!geometry) throw new Error('Incompatible scenery geometry');
            for (const geo of geometries) geo.dispose();
            geometry.computeBoundingSphere();
            const mesh = new THREE.Mesh(geometry, material);
            mesh.updateMatrix(); mesh.matrixAutoUpdate = false;
            root.add(mesh);
        }
        result.push(root);
    }
    for (const geo of originalGeometry) geo.dispose();
    return result;
}
