import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../js/vendor/three.module.js';
import { PhoneScene } from '../js/phone-scene.js';

test('телефон следует за кистью, падает и удаляется после сцены', () => {
    const els = Object.fromEntries(['phone-cutscene', 'phone-cutscene-text', 'phone-cutscene-skip'].map(id => [id, {}]));
    els['phone-cutscene'].querySelector = () => ({});
    const previous = globalThis.document;
    const screenText = [];
    globalThis.document = { getElementById: id => els[id], createElement: () => ({ getContext: () => ({ fillRect() {}, fillText(text) { screenText.push(text); } }) }) };
    try {
        const scene = new THREE.Scene(), rat = new THREE.Group();
        const arm = new THREE.Bone(), forearm = new THREE.Bone(), hand = new THREE.Bone();
        arm.name = 'mixamorigRightArm'; forearm.name = 'mixamorigRightForeArm'; hand.name = 'mixamorigRightHand';
        arm.position.y = 1.4; forearm.position.x = .3; hand.position.x = .3;
        rat.add(arm); arm.add(forearm); forearm.add(hand); scene.add(rat);
        let done = 0;
        const cut = new PhoneScene({ scene, rat, camera: new THREE.PerspectiveCamera() }, () => done++);
        assert.ok(screenText.includes('ГОРИЛЛА'));
        assert.ok(screenText.includes('Ты можешь бежать'));
        cut.update(.1);
        assert.ok(cut.phone.position.distanceTo(hand.getWorldPosition(new THREE.Vector3())) < .2);
        assert.ok(cut.phone.position.y > hand.getWorldPosition(new THREE.Vector3()).y);
        assert.equal(cut.screenTexture.generateMipmaps, false);
        assert.ok(cut.game.camera.position.distanceTo(cut.phone.position) < .35, 'первый кадр — крупный план телефона');
        cut.update(3.2);
        const height = cut.phone.position.y;
        cut.update(.4);
        assert.ok(cut.phone.position.y < height);
        els['phone-cutscene-skip'].onclick();
        cut.finish();
        assert.equal(done, 1);
        assert.equal(cut.phone.parent, null);
        assert.equal(els['phone-cutscene'].hidden, true);
    } finally { globalThis.document = previous; }
});
