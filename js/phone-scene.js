import * as THREE from './vendor/three.module.js';

function phoneScreen() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 960;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#101d31'; ctx.fillRect(0, 0, 512, 960);
    ctx.fillStyle = '#395477'; ctx.fillRect(0, 0, 512, 145);
    ctx.fillStyle = '#f1c95f'; ctx.font = 'bold 43px sans-serif'; ctx.fillText('ГОРИЛЛА', 36, 90);
    ctx.fillStyle = '#e6eefb'; ctx.font = 'bold 38px sans-serif';
    ['Ты можешь бежать', 'от жизни. А можешь', 'научиться видеть', 'возможности.', '', 'Встретимся на', 'станции «Обмен».'].forEach((line, i) => ctx.fillText(line, 36, 245 + i * 65));
    ctx.fillStyle = '#92a9c7'; ctx.font = '28px sans-serif'; ctx.fillText('НОВОЕ СООБЩЕНИЕ', 36, 885);
    const tex = new THREE.CanvasTexture(canvas); tex.encoding = THREE.sRGBEncoding;
    return tex;
}

const smooth = value => { const x = THREE.MathUtils.clamp(value, 0, 1); return x * x * (3 - 2 * x); };

// Одна короткая сцена на улице, без дополнительных источников света.
export class PhoneScene {
    constructor(game, onDone) {
        this.game = game; this.onDone = onDone; this.time = 0; this.released = false;
        this.hand = null; this.arm = null; this.forearm = null;
        game.rat.traverse(o => {
            if (!o.isBone) return;
            const name = o.name.replace(/^mixamorig:?/i, '');
            if (name === 'RightHand') this.hand = o;
            if (name === 'RightArm') this.arm = o;
            if (name === 'RightForeArm') this.forearm = o;
        });
        this.rest = [this.arm, this.forearm].filter(Boolean).map(b => [b, b.quaternion.clone()]);
        this.phone = new THREE.Group();
        this.bodyGeo = new THREE.BoxGeometry(.15, .28, .022);
        this.screenGeo = new THREE.PlaneGeometry(.125, .235);
        this.bodyMat = new THREE.MeshStandardMaterial({ color: 0x10151d, roughness: .55 });
        this.screenTexture = phoneScreen();
        this.screenMat = new THREE.MeshBasicMaterial({ map: this.screenTexture, toneMapped: false });
        this.phone.add(new THREE.Mesh(this.bodyGeo, this.bodyMat));
        const screen = new THREE.Mesh(this.screenGeo, this.screenMat);
        screen.position.z = .012; this.phone.add(screen);
        game.scene.add(this.phone);
        this.start = new THREE.Vector3(); this.pos = new THREE.Vector3();
        this.ui = document.getElementById('phone-cutscene');
        this.caption = document.getElementById('phone-cutscene-text');
        this.ui.hidden = false;
        this.caption.textContent = '';
        document.getElementById('phone-cutscene-skip').onclick = () => this.finish();
    }

    restorePose() { for (const [bone, q] of this.rest) bone.quaternion.copy(q); }

    aim(bone, child, direction) {
        if (!bone || !child || !bone.parent) return;
        const a = bone.getWorldPosition(new THREE.Vector3());
        const b = child.getWorldPosition(new THREE.Vector3()).sub(a);
        if (b.lengthSq() < 1e-8) return;
        const turn = new THREE.Quaternion().setFromUnitVectors(b.normalize(), direction.clone().normalize());
        const world = bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(turn);
        bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world));
        bone.updateMatrixWorld(true);
    }

    update(dt) {
        this.time += dt;
        const rat = this.game.rat;
        rat.updateMatrixWorld(true);
        if (this.time < 3.2 && this.hand && this.forearm && this.arm) {
            this.aim(this.arm, this.forearm, new THREE.Vector3(.65, -.35, -.45));
            this.aim(this.forearm, this.hand, new THREE.Vector3(-.45, .5, -.7));
        }
        if (!this.released) {
            if (this.hand) this.hand.getWorldPosition(this.pos);
            else this.pos.copy(rat.position).add(new THREE.Vector3(.3, .9, -.2));
            this.phone.position.copy(this.pos);
            this.phone.rotation.set(0, Math.PI, -.18);
            if (this.time >= 3.2) { this.released = true; this.start.copy(this.pos); this.caption.textContent = 'Горилла: «Встретимся на станции. Первая преграда уже ждёт». '; }
        } else {
            const t = Math.min(1, (this.time - 3.2) / .75);
            this.phone.position.set(this.start.x + .22 * t, Math.max(.025, this.start.y - 1.9 * t * t), this.start.z - .25 * t);
            this.phone.rotation.set(-Math.PI * .5 * t, Math.PI, -.18 + 2 * t);
        }
        const camera = this.game.camera;
        const distance = camera.aspect < .8 ? 3.6 : 2.8;
        const pull = smooth((this.time - 1.8) / 1.4);
        const orbit = smooth((this.time - 4.5) / 2.5);
        const close = new THREE.Vector3(this.phone.position.x, this.phone.position.y, this.phone.position.z - .29);
        const wide = new THREE.Vector3(1.5, 1.65, -distance);
        const behind = new THREE.Vector3(0, camera.aspect < .8 ? 3.3 : 2.5, camera.aspect < .8 ? 5 : 4.4);
        camera.position.lerpVectors(close, wide, pull);
        // Дуга сбоку: камера не проходит сквозь персонажа при переходе к забегу.
        camera.position.lerp(behind, orbit);
        camera.position.x += Math.sin(orbit * Math.PI) * 2.5;
        const target = this.phone.position.clone().lerp(new THREE.Vector3(0, .9, 0), pull)
            .lerp(new THREE.Vector3(0, .9, -8), orbit);
        camera.lookAt(target);
        if (this.time >= 7) this.finish();
    }

    finish() {
        if (this.done) return;
        this.done = true; this.restorePose();
        this.game.scene.remove(this.phone);
        this.bodyGeo.dispose(); this.screenGeo.dispose(); this.bodyMat.dispose(); this.screenMat.dispose(); this.screenTexture.dispose();
        this.game.camMix = 1;
        this.ui.hidden = true;
        document.getElementById('phone-cutscene-skip').onclick = null;
        this.onDone();
    }
}
