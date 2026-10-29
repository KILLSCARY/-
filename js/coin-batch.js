import * as THREE from './vendor/three.module.js';

// Монеты используют одну геометрию и материал: один draw call вместо отдельного
// клона GLB на каждую. Логические объекты остаются для магнита и сбора монет.
export class CoinBatch {
    static fromTemplate(template, capacity = 256) {
        const meshes = [];
        template.traverse(o => { if (o.isMesh) meshes.push(o); });
        if (meshes.length !== 1 || meshes[0].isSkinnedMesh) return null;
        template.updateMatrixWorld(true);
        const source = meshes[0];
        const matrix = new THREE.Matrix4().makeTranslation(0, -template.userData.cfg.size / 2, 0).multiply(source.matrixWorld);
        const geometry = source.geometry.clone();
        // gltfpack хранит POSITION в Uint16 (а нормали — в Int8). Запись дробных
        // координат обратно в эти массивы схлопывала монеты или уводила вершины в 65535.
        // Декодируем через getters, учитывающие normalized и interleaved-атрибуты.
        for (const name of ['position', 'normal', 'tangent']) {
            const attr = geometry.getAttribute(name);
            if (!attr) continue;
            const values = new Float32Array(attr.count * attr.itemSize);
            const get = ['getX', 'getY', 'getZ', 'getW'];
            for (let i = 0; i < attr.count; i++) for (let c = 0; c < attr.itemSize; c++) values[i * attr.itemSize + c] = attr[get[c]](i);
            geometry.setAttribute(name, new THREE.Float32BufferAttribute(values, attr.itemSize));
        }
        geometry.applyMatrix4(matrix);
        return new CoinBatch(geometry, source.material, capacity);
    }

    constructor(geometry, material, capacity) {
        this.capacity = capacity;
        this.objects = new Set();
        this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.mesh.frustumCulled = false; // отсеиваем экземпляры по дальности перед загрузкой матриц
        this.mesh.count = 0;
    }

    add() {
        if (this.objects.size >= this.capacity) return null; // безопасный откат к обычной модели
        const coin = new THREE.Object3D();
        coin.userData = { boost: false, model: true, instanced: true };
        this.objects.add(coin);
        return coin;
    }

    remove(coin) { return this.objects.delete(coin); }

    sync(far) {
        let count = 0;
        for (const coin of this.objects) {
            if (!coin.visible || coin.position.z < -far || coin.position.z > 12) continue;
            coin.updateMatrix();
            this.mesh.setMatrixAt(count++, coin.matrix);
        }
        this.mesh.count = count;
        if (count) this.mesh.instanceMatrix.needsUpdate = true;
    }
}
