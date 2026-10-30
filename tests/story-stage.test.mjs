import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../js/vendor/three.module.js';
import { StoryStage } from '../js/story-stage.js';

test('декорации трёх глав создаются и полностью убираются после сцены', () => {
    const old = globalThis.document;
    const labels = [];
    globalThis.document = { createElement: () => ({ getContext: () => ({ fillRect() {}, strokeRect() {}, fillText(t) { labels.push(t); } }) }) };
    try {
        const scene = new THREE.Scene();
        for (const chapter of [1, 2, 3]) {
            const stage = new StoryStage(scene, chapter, 1.7);
            assert.equal(stage.root.parent, scene);
            assert.equal(stage.root.position.x, 1.7);
            stage.dispose();
            assert.equal(stage.root.parent, null);
        }
        assert.deepEqual(labels, ['СТАНЦИЯ «ОБМЕН»', 'ПРОВЕРКА', 'ШТАБ']);
    } finally { globalThis.document = old; }
});
