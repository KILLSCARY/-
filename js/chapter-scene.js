import * as THREE from './vendor/three.module.js';
import { StoryStage } from './story-stage.js';

// Короткий переход на игровой улице; декорации существуют только во время сцены.
export class ChapterScene {
    constructor(game, story, onDone) {
        this.game = game; this.story = story; this.onDone = onDone; this.time = 0;
        this.stage = new StoryStage(game.scene, story.id, 0);
        this.ui = document.getElementById('phone-cutscene');
        this.label = this.ui.querySelector('.phone-cutscene-top');
        this.caption = document.getElementById('phone-cutscene-text');
        this.label.textContent = story.id === 2 ? 'ГЛАВА 2 · ГОРОД ПРОВЕРОК' : 'ГЛАВА 3 · ПОСЛЕДНИЙ ЭКЗАМЕН';
        this.caption.textContent = story.id === 2
            ? 'Горилла: «Впереди кордон. Держи фокус — тебе нужно добраться до штаба».'
            : 'Горилла: «Мы добрались до штаба. Павел ждёт тебя на последнем испытании».';
        this.ui.hidden = false;
        document.getElementById('phone-cutscene-skip').onclick = () => this.finish();
    }
    update(dt) {
        this.time += dt;
        const camera = this.game.camera, portrait = camera.aspect < .8;
        const t = THREE.MathUtils.clamp(this.time / 4, 0, 1);
        const k = t * t * (3 - 2 * t);
        camera.position.set(1.5 * (1 - k), (portrait ? 3.3 : 2.5) - .4 * (1 - k), (portrait ? 5 : 4.4) - 1.2 * (1 - k));
        camera.lookAt(0, .9, -5 - 3 * k);
        if (this.time >= 4.2) this.finish();
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
