import * as THREE from './vendor/three.module.js';
import { StoryStage } from './story-stage.js';

// Тексты роликов: у каждого перехода своя ставка — что впереди, чем рискуешь и ниточка «Горилла = Павел».
// arrival — глава 1 пройдена, герой у станции «Обмен» (solo — бежишь за самого Гориллу, встречать некому)
export const SCENE_TEXT = {
    arrival: { label: 'ГЛАВА 1 · СТАНЦИЯ «ОБМЕН»', lines: [
        'Станция «Обмен». У входа ждёт Горилла — живой, а не в телефоне.',
        'Горилла: «Дошёл. Мизулину прошёл — значит, правила ты знаешь. Теперь проверят твои решения».',
        '«Дальше ночной город. Там торопят и обещают лишнее. Я буду рядом… в каком-то смысле».',
    ] },
    arrivalSolo: { label: 'ГЛАВА 1 · СТАНЦИЯ «ОБМЕН»', lines: [
        'Станция «Обмен». Дошёл — и Мизулина позади.',
        'В телефоне новое сообщение: «Правила ты знаешь. Теперь проверят твои решения».',
        '«Дальше ночной город. Там торопят и обещают лишнее. Не поддавайся».',
    ] },
    2: { label: 'ГЛАВА 2 · ГОРОД ПРОВЕРОК', lines: [
        'Ночной город. Здесь каждое «быстро» стоит денег.',
        'Горилла: «Тебя будут торопить: переведи сейчас, вне площадки, через чужой аккаунт. Каждое „да“ — минус кошелёк».',
        '«На кордоне полиция. Проверка не страшна, когда у тебя всё чисто. Покажи, что чисто».',
    ] },
    3: { label: 'ГЛАВА 3 · ПОСЛЕДНИЙ ЭКЗАМЕН', lines: [
        'Штаб. Сюда доходят немногие.',
        'Горилла: «Экзамен принимает Павел Инаков, лично. Тут уже не угадаешь — тут надо знать».',
        '«И ещё… не удивляйся, если его голос покажется знакомым».',
    ] },
};

const LINE_TIME = 4.2; // секунд на строку: реплика Гориллы длиннее строки субтитров, за 3,5 с её не успевали дочитать

// Сюжетные планы на существующей улице с возвратом камеры к герою.
export class ChapterScene {
    // stage — декорации, собранные и прогретые заранее (Game.underFade); нет — собираем сейчас.
    // key — какой ролик (SCENE_TEXT): по умолчанию вступление главы story.id
    constructor(game, story, onDone, stage, key = story.id) {
        this.game = game; this.story = story; this.onDone = onDone; this.time = 0; this.key = key;
        this.stage = stage || new StoryStage(game.scene, key, 0, game.storyModelLoader);
        this.hiddenScenery = new Map();
        if (key === 3) this.clearEntrance();
        const road = game.world?.roadMat, reflector = game.world?.reflector;
        if (road && reflector?.visible) { // без зеркала менять нечего: лишняя пересборка шейдера дороги — фриз на телефоне
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
        this.label.textContent = SCENE_TEXT[key].label;
        this.lines = SCENE_TEXT[key].lines;
        this.caption.textContent = this.lines[0];
        this.ui.hidden = false;
        document.getElementById('phone-cutscene-skip').onclick = () => this.finish();
    }
    clearEntrance() {
        for (const bank of this.game.world?.swaps?.bank || []) {
            const { house, side } = bank.userData;
            if (!house || side !== -1 || Math.abs(house.position.z + 7) >= 11) continue;
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
        if (this.key === 3) this.clearEntrance();
        const camera = this.game.camera, portrait = camera.aspect < .8;
        this.caption.textContent = this.lines[Math.min(this.lines.length - 1, Math.floor(this.time / LINE_TIME))];
        const pull = THREE.MathUtils.smoothstep(this.time, 5, 10.5);
        if (this.key === 'arrival' || this.key === 'arrivalSolo') { // станция справа: камера с другой стороны дороги, к концу — на героя
            camera.position.set(-1.2 * (1 - pull), THREE.MathUtils.lerp(2.2, portrait ? 3.3 : 2.5, pull),
                THREE.MathUtils.lerp(portrait ? 2.5 : .5, portrait ? 5 : 4.4, pull));
            camera.lookAt(4.6 * (1 - pull), THREE.MathUtils.lerp(1.8, 1, pull), THREE.MathUtils.lerp(-6, -8, pull));
        }
        if (this.key === 2) {
            camera.position.set(-.3 * (1 - pull), THREE.MathUtils.lerp(2.4, portrait ? 3.3 : 2.5, pull),
                THREE.MathUtils.lerp(portrait ? 2.6 : .5, portrait ? 5 : 4.4, pull));
            camera.lookAt(1.7 * (1 - pull), 1, THREE.MathUtils.lerp(-9, -8, pull));
        }
        if (this.key === 3) {
            camera.position.set(1.2 * (1 - pull), THREE.MathUtils.lerp(2.4, portrait ? 3.3 : 2.5, pull),
                THREE.MathUtils.lerp(portrait ? 2.5 : .5, portrait ? 5 : 4.4, pull));
            camera.lookAt(-5.2 * (1 - pull), THREE.MathUtils.lerp(2.4, 1, pull), THREE.MathUtils.lerp(-7, -8, pull));
        }
        if (this.time >= LINE_TIME * this.lines.length) this.finish();
    }
    finish() {
        if (this.done) return;
        this.done = true;
        this.ui.hidden = true;
        // декорации не исчезают с концом ролика: остаются на улице, и герой пробегает мимо них (Game.adoptIntroStage)
        const release = () => {
            this.stage.dispose();
            for (const [bank, previous] of this.hiddenScenery) {
                bank.visible = previous.visible;
                bank.userData.house.position.x = previous.x;
            }
        };
        if (this.game.adoptIntroStage) this.game.adoptIntroStage(this.stage, release);
        else release();
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
