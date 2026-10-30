import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../js/vendor/three.module.js';
import { sharpen, setModelAnisotropy, upgradeTextures } from '../js/models.js';

test('переключение качества меняет фильтрацию уже загруженных текстур', () => {
    const map = new THREE.Texture(), material = new THREE.MeshStandardMaterial({ map });
    const root = new THREE.Mesh(new THREE.BoxGeometry(), material);
    for (const aniso of [8, 2, 16]) {
        setModelAnisotropy(aniso); sharpen(root); assert.equal(map.anisotropy, aniso);
    }
    root.geometry.dispose(); material.dispose(); map.dispose();
});

test('переключение со средней на высокую заменяет сжатую HD-карту и сохраняет UV', async () => {
    const map = new THREE.Texture(); map.offset.set(.2, .3); map.repeat.set(2, 3);
    const root = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ map }));
    const load = async () => new THREE.Texture();
    await upgradeTextures(root, 'hero', 'ktx2', load);
    const compressed = root.material.map; let disposed = false;
    compressed.addEventListener('dispose', () => { disposed = true; });
    await upgradeTextures(root, 'hero', 'webp', load);
    assert.equal(root.material.map.userData.hdMode, 'webp');
    assert.deepEqual(root.material.map.offset.toArray(), [.2, .3]);
    assert.deepEqual(root.material.map.repeat.toArray(), [2, 3]);
    assert.equal(disposed, true);
    root.geometry.dispose(); root.material.map.dispose(); root.material.dispose(); map.dispose();
});

test('запоздавшая средняя текстура не затирает высокую; низкая не загружает HD', async () => {
    const root = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ map: new THREE.Texture() }));
    let resolveMedium;
    const medium = upgradeTextures(root, 'hero', 'ktx2', () => new Promise(resolve => { resolveMedium = resolve; }));
    await upgradeTextures(root, 'hero', 'webp', async () => new THREE.Texture());
    const high = root.material.map;
    resolveMedium(new THREE.Texture()); await medium;
    assert.equal(root.material.map, high);
    await upgradeTextures(root, 'hero', undefined, () => assert.fail('HD выключено'));
    root.geometry.dispose(); root.material.map.dispose(); root.material.dispose();
});
