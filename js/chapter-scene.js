import * as THREE from './vendor/three.module.js';
import { StoryStage } from './story-stage.js';

// Сюжетные планы на существующей улице с возвратом камеры к герою.
export class ChapterScene {
    constructor(game, story, onDone) {
        this.game = game; this.story = story; this.onDone = onDone; this.time = 0;
        this.stage = new StoryStage(game.scene, story.id, 0, game.storyModelLoader);
        this.hiddenScenery = new Map();
        if (story.id === 3) this.clearEntrance();
        const road = game.world?.roadMat, reflector = game.world?.reflector;
        if (road) {
            this.roadState = { road, reflector, reflectorVisible: reflector?.visible,
                transparent: road.transparent, alphaMap: road.alphaMap, roughnessMap: road.roughnessMap, opacity: road.opacity,
                roughness: road.roughness, metalness: road.metalness, envMapIntensity: road.envMapIntensity,
                normalScale: road.normalScale.clone() };
            if (reflector) reflector.visible = false;
            road.transparent = false; road.alphaMap = null; road.roughnessMap = null; road.opacity = 1;
            road.roughness = .68; road.metalness = .18; road.envMapIntensity = .8;
            road.normalScale.set(.24, .24); road.needsUpdate = true;
        }
        this.ui = document.getElementById('phone-cutscene');
        this.label = this.ui.querySelector('.phone-cutscene-top');
        this.caption = document.getElementById('phone-cutscene-text');
        this.label.textContent = story.id === 2 ? 'ГЛАВА 2 · ГОРОД ПРОВЕРОК' : 'ГЛАВА 3 · ПОСЛЕДНИЙ ЭКЗАМЕН';
        this.lines = story.id === 2 ? [
            'Горилла: «Первую преграду прошёл. Но знание правил — только начало».',
            '«В ночном городе каждое решение имеет цену. Проверяй условия и не поддавайся спешке».',
            '«Впереди полиция. Собери силы и будь готов к бою».',
        ] : [
            'Горилла: «Ты выдержал проверку. Остался последний шаг».',
            '«Вспомни всё, чему научился: риски, условия сделки и цену ошибки».',
            '«В конце пути тебя ждёт Павел Инаков. Покажи ему, на что способен».',
        ];
        this.caption.textContent = this.lines[0];
        this.ui.hidden = false;
        document.getElementById('phone-cutscene-skip').onclick = () => this.finish();
    }
    clearEntrance() {
        for (const bank of this.game.world?.swaps?.bank || []) {
            const { house, side } = bank.userData;
            if (!house || side !== -1 || Math.abs(house.position.z + 14) >= 11) continue;
            let previous = this.hiddenScenery.get(bank);
            if (!previous) {
                previous = { visible: bank.visible, x: house.position.x };
                this.hiddenScenery.set(bank, previous);
            } else if (house.position.x !== -11) {
                // A deferred bank model may move the house after the scene starts.
                previous.x = house.position.x;
            }
            bank.visible = false;
            house.position.x = -11;
        }
    }
    update(dt) {
        this.time += dt;
        this.stage.update(dt);
        if (this.story.id === 3) this.clearEntrance();
        const camera = this.game.camera, portrait = camera.aspect < .8;
        this.caption.textContent = this.lines[Math.min(this.lines.length - 1, Math.floor(this.time / 3.5))];
        const pull = THREE.MathUtils.smoothstep(this.time, 5, 10.5);
        if (this.story.id === 2) {
            camera.position.set(-.4 * (1 - pull), THREE.MathUtils.lerp(2.1, portrait ? 3.3 : 2.5, pull),
                THREE.MathUtils.lerp(-1.5, portrait ? 5 : 4.4, pull));
            camera.lookAt(1.5 * (1 - pull), 1, THREE.MathUtils.lerp(-10, -8, pull));
        }
        if (this.story.id === 3) {
            camera.position.set(-.8 * (1 - pull), THREE.MathUtils.lerp(2.25, portrait ? 3.3 : 2.5, pull),
                THREE.MathUtils.lerp(-10.5, portrait ? 5 : 4.4, pull));
            camera.lookAt(-6.1 * (1 - pull), THREE.MathUtils.lerp(1.9, 1, pull), THREE.MathUtils.lerp(-14, -8, pull));
        }
        if (this.time >= 10.5) this.finish();
    }
    finish() {
        if (this.done) return;
        this.done = true;
        this.stage.dispose(); this.ui.hidden = true;
        for (const [bank, previous] of this.hiddenScenery) {
            bank.visible = previous.visible;
            bank.userData.house.position.x = previous.x;
        }
        if (this.roadState) {
            const { road, reflector, reflectorVisible, normalScale, ...original } = this.roadState;
            Object.assign(road, original); road.normalScale.copy(normalScale); road.needsUpdate = true;
            if (reflector) reflector.visible = reflectorVisible;
        }
        document.getElementById('phone-cutscene-skip').onclick = null;
        this.game.camMix = 1;
        this.onDone();
    }
}
