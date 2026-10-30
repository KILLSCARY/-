import * as THREE from './vendor/three.module.js';
import { StoryStage } from './story-stage.js';

// Переход между главами на существующей улице, без дополнительных декораций.
export class ChapterScene {
    constructor(game, story, onDone) {
        this.game = game; this.story = story; this.onDone = onDone; this.time = 0;
        this.stage = new StoryStage(game.scene, story.id, 0);
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
    update(dt) {
        this.time += dt;
        const camera = this.game.camera, portrait = camera.aspect < .8;
        this.caption.textContent = this.lines[Math.min(this.lines.length - 1, Math.floor(this.time / 3.5))];
        const t = THREE.MathUtils.clamp(this.time / 10.5, 0, 1);
        const k = t * t * (3 - 2 * t);
        camera.position.set(1.5 * (1 - k), (portrait ? 3.3 : 2.5) - .4 * (1 - k), (portrait ? 5 : 4.4) - 1.2 * (1 - k));
        camera.lookAt(0, .9, -5 - 3 * k);
        if (this.time >= 10.5) this.finish();
    }
    finish() {
        if (this.done) return;
        this.done = true;
        this.stage.dispose(); this.ui.hidden = true;
        document.getElementById('phone-cutscene-skip').onclick = null;
        this.game.camMix = 1;
        this.onDone();
    }
}
