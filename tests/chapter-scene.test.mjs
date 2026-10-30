import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../js/vendor/three.module.js';
import { ChapterScene } from '../js/chapter-scene.js';

test('вступления глав идут в игровой сцене и пропуск освобождает декорации', () => {
    const old = globalThis.document;
    const label = {}, ui = { querySelector: () => label }, text = {}, skip = {};
    globalThis.document = { getElementById: id => ({ 'phone-cutscene': ui, 'phone-cutscene-text': text, 'phone-cutscene-skip': skip })[id],
        createElement: () => ({ getContext: () => ({ fillRect() {}, strokeRect() {}, fillText() {} }) }) };
    try {
        for (const id of [2, 3]) {
            const game = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), storyModelLoader: () => {} };
            let count = 0;
            const cut = new ChapterScene(game, { id }, () => count++);
            assert.equal(cut.stage.root.parent, game.scene);
            cut.update(.5);
            skip.onclick(); cut.finish();
            assert.equal(count, 1);
            assert.equal(game.scene.children.length, 0);
            assert.equal(ui.hidden, true);
        }
    } finally { globalThis.document = old; }
});

test('после заставки восстанавливаются материалы дороги и отражение', () => {
    const old = globalThis.document;
    const label = {}, ui = { querySelector: () => label }, text = {}, skip = {};
    globalThis.document = { getElementById: id => ({ 'phone-cutscene': ui, 'phone-cutscene-text': text, 'phone-cutscene-skip': skip })[id] };
    try {
        const map = new THREE.Texture();
        const road = new THREE.MeshStandardMaterial({ transparent: true, alphaMap: map, roughnessMap: map, roughness: .4 });
        const reflector = { visible: true };
        const game = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), world: { roadMat: road, reflector }, storyModelLoader: () => {} };
        const cut = new ChapterScene(game, { id: 3 }, () => {});
        assert.equal(road.roughnessMap, null);
        assert.equal(reflector.visible, false);
        cut.finish();
        assert.equal(road.roughnessMap, map);
        assert.equal(road.alphaMap, map);
        assert.equal(road.transparent, true);
        assert.equal(road.roughness, .4);
        assert.equal(reflector.visible, true);
    } finally { globalThis.document = old; }
});
