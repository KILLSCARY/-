import * as THREE from './vendor/three.module.js';

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
        this.screenMat = new THREE.MeshBasicMaterial({ color: 0x5395e2 });
        this.phone.add(new THREE.Mesh(this.bodyGeo, this.bodyMat));
        const screen = new THREE.Mesh(this.screenGeo, this.screenMat);
        screen.position.z = .012; this.phone.add(screen);
        game.scene.add(this.phone);
        this.start = new THREE.Vector3(); this.pos = new THREE.Vector3();
        this.ui = document.getElementById('phone-cutscene');
        this.caption = document.getElementById('phone-cutscene-text');
        this.ui.hidden = false;
        this.caption.textContent = 'Горилла: «Ты можешь бежать от жизни. А можешь научиться видеть возможности». ';
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
        if (this.time < 2.3 && this.hand && this.forearm && this.arm) {
            this.aim(this.arm, this.forearm, new THREE.Vector3(.65, -.35, -.45));
            this.aim(this.forearm, this.hand, new THREE.Vector3(-.45, .5, -.7));
        }
        if (!this.released) {
            if (this.hand) this.hand.getWorldPosition(this.pos);
            else this.pos.copy(rat.position).add(new THREE.Vector3(.3, .9, -.2));
            this.phone.position.copy(this.pos);
            this.phone.rotation.set(0, Math.PI, -.18);
            if (this.time >= 2.3) { this.released = true; this.start.copy(this.pos); this.caption.textContent = 'Телефон выскальзывает из руки. На экране — адрес станции «Обмен». '; }
        } else {
            const t = Math.min(1, (this.time - 2.3) / .75);
            this.phone.position.set(this.start.x + .22 * t, Math.max(.025, this.start.y - 1.9 * t * t), this.start.z - .25 * t);
            this.phone.rotation.set(-Math.PI * .5 * t, Math.PI, -.18 + 2 * t);
            if (this.time > 3.8) this.caption.textContent = 'Горилла: «Встретимся на станции. Первая преграда уже ждёт». ';
        }
        const camera = this.game.camera;
        const distance = camera.aspect < .8 ? 3.6 : 2.8;
        camera.position.set(1.5, 1.65, -distance);
        camera.lookAt(0, .9, 0);
        if (this.time >= 6) this.finish();
    }

    finish() {
        if (this.done) return;
        this.done = true; this.restorePose();
        this.game.scene.remove(this.phone);
        this.bodyGeo.dispose(); this.screenGeo.dispose(); this.bodyMat.dispose(); this.screenMat.dispose();
        this.ui.hidden = true;
        document.getElementById('phone-cutscene-skip').onclick = null;
        this.onDone();
    }
}
