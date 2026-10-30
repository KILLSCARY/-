import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../js/vendor/three.module.js';
import { StoryStage } from '../js/story-stage.js';

test('сюжетная сцена не добавляет временные примитивы на дорогу', () => {
    const scene = new THREE.Scene();
    for (const chapter of [1, 2, 3]) {
        const stage = new StoryStage(scene, chapter, 1.7);
        assert.equal(stage.root.parent, scene);
        assert.equal(stage.root.position.x, 1.7);
        assert.equal(stage.root.children.length, 0);
        stage.dispose();
        assert.equal(stage.root.parent, null);
    }
});
