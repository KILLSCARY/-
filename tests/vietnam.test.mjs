import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../js/vendor/three.module.js';
import { CoinBatch } from '../js/coin-batch.js';
import { batchScenery } from '../js/scenery-batch.js';

for (const path of ['obj/coin_usdt.glb', 'obj/lite/coin_usdt.glb']) {
    test(`монеты не схлопываются: настоящий квантованный GLB ${path}`, () => {
        const bytes = readFileSync(new URL(`../models/${path}`, import.meta.url));
        const jsonLength = bytes.readUInt32LE(12);
        const json = JSON.parse(bytes.subarray(20, 20 + jsonLength));
        const primitive = json.meshes[0].primitives[0], accessor = json.accessors[primitive.attributes.POSITION];
        const view = json.bufferViews[accessor.bufferView];
        assert.equal(accessor.componentType, 5123); // gltfpack: Uint16, не Float32
        const binary = 20 + jsonLength + 8, stride = view.byteStride / 2;
        const start = binary + view.byteOffset + (accessor.byteOffset || 0);
        const data = new Uint16Array(accessor.count * stride);
        for (let i = 0; i < accessor.count; i++) for (let c = 0; c < 3; c++) data[i * stride + c] = bytes.readUInt16LE(start + i * view.byteStride + c * 2);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(data, stride), 3, 0, !!accessor.normalized));
        const node = json.nodes.find(n => n.mesh === 0), model = new THREE.Group();
        model.position.fromArray(node.translation); model.scale.fromArray(node.scale);
        if (node.rotation) model.quaternion.fromArray(node.rotation);
        const source = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()); model.add(source);
        const root = new THREE.Group(); root.add(model); root.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3());
        root.scale.multiplyScalar(.62 / size.x); root.updateMatrixWorld(true); box.setFromObject(root);
        const center = box.getCenter(new THREE.Vector3()); root.position.set(-center.x, -box.min.y, -center.z);
        const template = new THREE.Group(); template.userData.cfg = { size: .62 }; template.add(root);
        const batch = CoinBatch.fromTemplate(template), result = batch.mesh.geometry;
        assert.equal(result.attributes.position.array.constructor, Float32Array);
        result.computeBoundingBox();
        assert.ok(Math.abs(result.boundingBox.getSize(new THREE.Vector3()).x - .62) < 1e-5);
        assert.ok(Math.abs(result.boundingBox.min.x + .31) < 1e-5);
        const expected = new THREE.Vector3(), actual = new THREE.Vector3();
        for (let i = 0; i < accessor.count; i++) {
            expected.fromBufferAttribute(geometry.attributes.position, i).applyMatrix4(source.matrixWorld); expected.y -= .31;
            actual.fromBufferAttribute(result.attributes.position, i);
            assert.ok(actual.distanceTo(expected) < 1e-5, `вершина ${i} не должна округляться до целого`);
        }
        batch.mesh.geometry.dispose(); geometry.dispose(); source.material.dispose();
    });
}

test('детали набережной объединяются по материалам и участкам, сохраняя мировые координаты', () => {
    const objects = [], geometry = new THREE.BoxGeometry(1, 1, 1), material = new THREE.MeshBasicMaterial();
    for (let i = 0; i < 40; i++) {
        const g = new THREE.Group(); g.position.set(i % 2 ? 6 : -9, 0, 40 - i * 3);
        for (let j = 0; j < 4; j++) { const m = new THREE.Mesh(geometry, material); m.position.set(0, j * 2, 0); g.add(m); }
        objects.push(g);
    }
    const before = new THREE.Box3();
    for (const g of objects) before.union(new THREE.Box3().setFromObject(g));
    const groups = batchScenery(objects, { behind: 45 });
    assert.ok(groups.length <= 5);
    assert.ok(groups.reduce((n, g) => n + g.children.length, 0) <= 5, '160 мешей превращаются максимум в 5');
    const after = new THREE.Box3();
    for (const g of groups) after.union(new THREE.Box3().setFromObject(g));
    assert.ok(after.min.distanceTo(before.min) < 1e-6);
    assert.ok(after.max.distanceTo(before.max) < 1e-6);
    for (const g of groups) g.position.z += 12;
    const shifted = new THREE.Box3(); for (const g of groups) shifted.union(new THREE.Box3().setFromObject(g));
    assert.ok(Math.abs(shifted.min.z - before.min.z - 12) < 1e-6);
    for (const g of groups) for (const m of g.children) m.geometry.dispose();
    material.dispose();
});

test('попадания предметов только пачкают экран, не меняя здоровье, щит, скорость и погоню', async () => {
    const { Hecklers } = await import('../js/hecklers.js');
    const marks = [];
    const hecklers = Object.create(Hecklers.prototype);
    hecklers.splat = item => marks.push(item.id);
    // Любое обращение к игровому состоянию при попадании означает побочный эффект.
    hecklers.g = new Proxy({}, { get() { throw new Error('Косметическое попадание не должно трогать игровой процесс'); } });
    for (let i = 0; i < 12; i++) hecklers.hit({ id: 'tomato' });
    assert.equal(marks.length, 12);
});
