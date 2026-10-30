import * as THREE from './vendor/three.module.js';

// Сюжетные точки больше не рисуем примитивами на дороге. Пока для них нет
// полноценных моделей и материалов, история показывается через кат-сцену и
// диалог — пустой контейнер сохраняет единый жизненный цикл сцены.
export class StoryStage {
    constructor(scene, _chapter, x) {
        this.scene = scene;
        this.root = new THREE.Group();
        this.root.position.set(x, 0, -7);
        scene.add(this.root);
    }
    dispose() {
        this.scene.remove(this.root);
    }
}
