import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../js/vendor/three.module.js';
import { StoryStage } from '../js/story-stage.js';

test('главы загружают нужные модели и удаляют их после сцены', () => {
    for (const [chapter, expected] of [[1, ['station']], [2, ['cordon', 'case']]]) {
        const scene = new THREE.Scene(), calls = [];
        const stage = new StoryStage(scene, chapter, 1.7, (url, done) => calls.push({ url, done }));
        assert.deepEqual(calls.map(c => c.url.split('/').pop().replace('.glb', '')), expected);
        const geometry = new THREE.BoxGeometry(1, 2, 1), material = new THREE.MeshBasicMaterial();
        let disposed = 0; geometry.addEventListener('dispose', () => disposed++);
        calls[0].done({ scene: new THREE.Mesh(geometry, material) });
        assert.equal(stage.root.children.length, 1);
        stage.dispose();
        assert.equal(disposed, 1);
        assert.equal(stage.root.parent, null);
        const late = new THREE.BoxGeometry(); late.addEventListener('dispose', () => disposed++);
        calls.at(-1).done({ scene: new THREE.Mesh(late, new THREE.MeshBasicMaterial()) });
        assert.equal(disposed, 2);
        assert.equal(stage.root.children.length, 0);
    }
});

test('вход штаба крепится к фасаду и удаляется после заставки', () => {
    const scene = new THREE.Scene();
    const stage = new StoryStage(scene, 3, 1.5, () => assert.fail('вход не требует загрузки'));
    assert.equal(stage.root.children.length, 1);
    assert.ok(Math.abs(stage.root.children[0].position.x + stage.root.position.x + 6.95) < 1e-6);
    stage.dispose();
    assert.equal(scene.children.length, 0);
});
