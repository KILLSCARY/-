import * as THREE from './vendor/three.module.js';

function phoneScreen(hero) {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 1032;
    const ctx = canvas.getContext('2d');
    // скруглённые углы — как у стекла модели, иначе экран торчит за корпус
    ctx.beginPath(); ctx.moveTo(60, 0); ctx.arcTo(512, 0, 512, 1032, 60); ctx.arcTo(512, 1032, 0, 1032, 60); ctx.arcTo(0, 1032, 0, 0, 60); ctx.arcTo(0, 0, 512, 0, 60); ctx.closePath(); ctx.clip();
    ctx.fillStyle = '#101d31'; ctx.fillRect(0, 0, 512, 1032);
    ctx.fillStyle = '#395477'; ctx.fillRect(0, 0, 512, 145);
    ctx.fillStyle = '#f1c95f'; ctx.font = 'bold 43px sans-serif'; ctx.fillText('ГОРИЛЛА', 36, 90);
    ctx.fillStyle = '#e6eefb'; ctx.font = 'bold 38px sans-serif';
    [hero ? `${hero},` : '', hero ? 'ты можешь бежать' : 'Ты можешь бежать', 'от жизни. А можешь', 'научиться видеть', 'возможности.', '', 'Встретимся на', 'станции «Обмен».'].forEach((line, i) => ctx.fillText(line, 36, 215 + i * 65));
    ctx.fillStyle = '#92a9c7'; ctx.font = '28px sans-serif'; ctx.fillText('НОВОЕ СООБЩЕНИЕ', 36, 965);
    const tex = new THREE.CanvasTexture(canvas); tex.encoding = THREE.sRGBEncoding;
    tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
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
        this.screenTexture = phoneScreen(game.heroShort?.()); // сообщение — лично герою
        // прозрачный: углы скруглены, и рисуется после модели, а не под ней
        this.screenMat = new THREE.MeshBasicMaterial({ map: this.screenTexture, toneMapped: false, transparent: true });
        this.bodyMat.depthTest = false;
        this.screenMat.depthTest = false;
        const body = new THREE.Mesh(this.bodyGeo, this.bodyMat);
        body.renderOrder = 1000; // поверх бликов фонарей: они рисуются после непрозрачного
        this.phone.add(body);
        const screen = new THREE.Mesh(this.screenGeo, this.screenMat);
        screen.renderOrder = 1001;
        // Экран отдельно от корпуса: нет мерцания из-за совпадающих поверхностей.
        screen.position.z = .017; this.phone.add(screen);
        game.scene.add(this.phone);
        // настоящая модель; пока грузится, виден простой корпус. Рисуется последней поверх очищенной глубины: рука не закрывает экран
        game.storyModelLoader?.('models/obj/phone.glb?v=1', gltf => {
            if (this.done) return;
            const model = gltf.scene, h = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).y;
            model.scale.setScalar(.28 / h);
            const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3());
            model.position.sub(box.getCenter(new THREE.Vector3())); // по центру группы: экран и камера стоят ровно по телефону
            this.modelMeshes = [];
            model.traverse(o => { if (o.isMesh) { o.material.transparent = true; o.renderOrder = 1000; o.frustumCulled = false; this.modelMeshes.push(o); } });
            if (this.modelMeshes[0] && !this.released) this.modelMeshes[0].onBeforeRender = r => { r.state.buffers.depth.setMask(true); r.clearDepth(); }; // без маски очистка не сработает после прозрачных
            this.model = model;
            body.visible = false;
            this.phone.add(model);
            // экран — по стеклу модели, а не по размеру заглушки
            this.screenGeo.dispose();
            this.screenGeo = screen.geometry = new THREE.PlaneGeometry(size.x * .89, size.y * .945);
            screen.position.z = size.z / 2 + .0006;
            this.screenMat.depthTest = true;
        }, () => {});
        this.start = new THREE.Vector3(); this.pos = new THREE.Vector3();
        this.ui = document.getElementById('phone-cutscene');
        this.ui.querySelector('.phone-cutscene-top').textContent = 'ГЛАВА 1 · ВЫХОД ИЗ СИСТЕМЫ';
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
            // Кисть держит нижний край телефона, а не закрывает центр экрана.
            this.phone.position.copy(this.pos).add(new THREE.Vector3(-.045, .12, -.13));
            this.phone.rotation.set(0, Math.PI, 0);
            if (this.time >= 3.2) {
                this.released = true;
                this.start.copy(this.phone.position);
                // На земле телефон снова перекрывается окружающими объектами как обычная 3D-модель.
                this.bodyMat.depthTest = this.screenMat.depthTest = true;
                for (const m of this.modelMeshes || []) { m.onBeforeRender = () => {}; m.renderOrder = 0; m.material.transparent = false; m.material.needsUpdate = true; }
                this.caption.textContent = 'Горилла: «Встретимся на станции. Первая преграда уже ждёт». ';
            }
        } else {
            const t = Math.min(1, (this.time - 3.2) / .75);
            this.phone.position.set(this.start.x + .22 * t, Math.max(.025, this.start.y - 1.9 * t * t), this.start.z - .25 * t);
            this.phone.rotation.set(-Math.PI * .5 * t, Math.PI, 2 * t);
        }
        const camera = this.game.camera;
        const distance = camera.aspect < .8 ? 3.6 : 2.8;
        const pull = smooth((this.time - 1.8) / 1.4);
        const orbit = smooth((this.time - 4.5) / 2.5);
        // телефон целиком в кадре при любом экране: высота с запасом, а на узком решает ширина
        const fit = Math.max(.33, .185 / camera.aspect) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
        const close = new THREE.Vector3(this.phone.position.x, this.phone.position.y, this.phone.position.z - fit);
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
        if (this.model) this.model.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.map?.dispose(); o.material.normalMap?.dispose(); o.material.dispose(); } });
        this.bodyGeo.dispose(); this.screenGeo.dispose(); this.bodyMat.dispose(); this.screenMat.dispose(); this.screenTexture.dispose();
        this.game.camMix = 1;
        this.ui.hidden = true;
        document.getElementById('phone-cutscene-skip').onclick = null;
        this.onDone();
    }
}
