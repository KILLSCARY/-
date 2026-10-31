import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../js/vendor/three.module.js';
import { StoryStage } from '../js/story-stage.js';

const fakeDocument = () => ({ createElement: () => ({ getContext: () => ({ createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, strokeRect() {}, fillText() {} }) }) });

test('главы загружают нужные модели и удаляют их после сцены', () => {
    const old = globalThis.document; globalThis.document = fakeDocument();
    try {
        for (const [chapter, expected] of [[1, ['station']], [2, ['cordon', 'patrol1', 'cop']], [3, ['headquarters']]]) {
            const scene = new THREE.Scene(), calls = [];
            const stage = new StoryStage(scene, chapter, 1.7, (url, done) => calls.push({ url, done }));
            assert.deepEqual(calls.map(c => c.url.split('/').pop().split('?')[0].replace('.glb', '')), expected);
            const signs = stage.root.children.length;
            const geometry = new THREE.BoxGeometry(1, 2, 1), material = new THREE.MeshBasicMaterial();
            let disposed = 0; geometry.addEventListener('dispose', () => disposed++);
            calls[0].done({ scene: new THREE.Mesh(geometry, material) });
            assert.equal(stage.root.children.length, signs + 1);
            stage.dispose();
            assert.equal(disposed, 1);
            assert.equal(stage.root.parent, null);
            const late = new THREE.BoxGeometry(); late.addEventListener('dispose', () => disposed++);
            calls.at(-1).done({ scene: new THREE.Mesh(late, new THREE.MeshBasicMaterial()) });
            assert.equal(disposed, 2);
            assert.equal(stage.root.children.length, 0);
        }
    } finally { globalThis.document = old; }
});

test('декорации не добавляют источников света: иначе пересборка шейдеров и фриз на телефоне', () => {
    const old = globalThis.document; globalThis.document = fakeDocument();
    try {
        for (const chapter of [1, 2, 3]) {
            const stage = new StoryStage(new THREE.Scene(), chapter, 0, () => {});
            let lights = 0; stage.root.traverse(o => { if (o.isLight) lights++; });
            assert.equal(lights, 0);
            stage.dispose();
        }
    } finally { globalThis.document = old; }
});

test('сцена едет вместе с улицей, а камера смотрит на неё', () => {
    const old = globalThis.document; globalThis.document = fakeDocument();
    try {
        const stage = new StoryStage(new THREE.Scene(), 3, 0, () => {}, -30);
        stage.moveBy(20);
        const p = new THREE.Vector3(), l = new THREE.Vector3();
        stage.shot(p, l);
        assert.equal(l.z, -11);
        assert.ok(p.z > l.z); // камера со стороны героя
        let sign; stage.root.traverse(o => { if (o.material?.map?.isCanvasTexture) sign ||= o; });
        let textureDisposed = false;
        sign.material.map.addEventListener('dispose', () => { textureDisposed = true; });
        stage.dispose();
        assert.equal(textureDisposed, true);
    } finally { globalThis.document = old; }
});
