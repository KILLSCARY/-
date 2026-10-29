// Сцена «Маска» перед экзаменом Инакова (сценарий Жупелихи, docs/scenario/scene_mask_v1.md).
// Горилла — models/gorilla.glb (человек в костюме, кости mixamorig, клипы idle/turn/grab_head/walk);
// голова костюма — отдельная сетка gorilla_head на кости Head: после вспышки она снимается, падает на асфальт и лежит до конца боя.
// Если модель не загрузилась — запасная фигура из примитивов.
import * as THREE from "./vendor/three.module.js";
import { clone as cloneSkinned } from "./vendor/jsm/SkeletonUtils.js";
import { MASK_SCENE } from "./config.js";

const SPEEDY = "Спиди", GOR = "Горилла", PAV = "Инаков";

function gloss(color, rough = 0.35) { return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.15 }); }

// голова костюма: шар-купол, надбровье, светлая морда, уши — без лица человека
export function makeMaskHead() {
    const g = new THREE.Group();
    const fur = gloss(0x232120, 0.45), skin = gloss(0x4a3b33, 0.3);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 16), fur); skull.scale.set(1, 1.05, 1); g.add(skull);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.08), fur); brow.position.set(0, 0.04, 0.13); g.add(brow);
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), skin); muzzle.scale.set(1.25, 0.8, 0.9); muzzle.position.set(0, -0.06, 0.12); g.add(muzzle);
    for (const s of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), skin); ear.position.set(s * 0.17, 0.01, 0); g.add(ear);
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), gloss(0x0a0a0a, 0.1)); eye.position.set(s * 0.055, 0.0, 0.155); g.add(eye);
    }
    // горловина костюма снизу — видно, что это пустая маска
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.06, 16, 1, true), fur); neck.position.y = -0.17; g.add(neck);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
}

function makeGorilla() {
    const g = new THREE.Group(), fur = gloss(0x232120, 0.45);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(0.3, 0.55, 6, 16) : new THREE.SphereGeometry(0.4, 16, 12), fur);
    body.position.y = 1.15; body.scale.set(1.15, 1, 0.8); g.add(body);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), gloss(0x3a302b, 0.3)); belly.position.set(0, 1.05, 0.17); belly.scale.set(1, 1.3, 0.5); g.add(belly);
    const legs = [];
    for (const s of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.75, 12), fur); leg.position.set(s * 0.17, 0.4, 0); g.add(leg); legs.push(leg);
        const sh = new THREE.Group(); sh.position.set(s * 0.42, 1.5, 0); g.add(sh);
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.8, 12), fur); arm.position.y = -0.4; sh.add(arm);
        const hand = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), gloss(0x4a3b33, 0.3)); hand.position.y = -0.82; sh.add(hand);
        g.userData[s < 0 ? "armL" : "armR"] = sh;
    }
    const head = makeMaskHead(); head.scale.setScalar(1.5); head.position.set(0, 1.9, 0.03); g.add(head);
    g.userData.head = head;
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
}

function makeGorillaModel(gltf, height) {
    const g = new THREE.Group(), m = cloneSkinned(gltf.scene);
    m.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(m), k = height / (b.max.y - b.min.y || 1);
    m.scale.setScalar(k); m.position.y = -b.min.y * k;
    let head = null;
    m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } if (o.name === "gorilla_head") head = o; });
    g.add(m);
    if (!head) return null;
    const mixer = new THREE.AnimationMixer(m), acts = {};
    for (const c of gltf.animations || []) acts[c.name] = mixer.clipAction(c);
    if (acts.grab_head) { acts.grab_head.setLoop(THREE.LoopOnce); acts.grab_head.clampWhenFinished = true; }
    acts.idle?.play();
    Object.assign(g.userData, { head, mixer, acts, model: true });
    return g;
}
function play(g, name, fade = 0.25, speed = 1) {
    const a = g.userData.acts?.[name]; if (!a || g.userData.cur === name) return;
    const prev = g.userData.acts[g.userData.cur || "idle"];
    a.reset(); a.timeScale = speed; a.play(); if (prev && prev !== a) a.crossFadeFrom(prev, fade, false);
    g.userData.cur = name;
}

function makeJacket() { // пиджак: светлый тёплый серо-бежевый — читается на тёмном асфальте; плюс тёплая подсветка
    const g = new THREE.Group(), m = gloss(0xa8957a, 0.4);
    m.emissive = new THREE.Color(0x6a4420); m.emissiveIntensity = 0.55; // сам светится тёплым — без отдельной лампы
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.03, 0.42), m); g.add(p);
    for (const s of [-1, 1]) { const sl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.4), m); sl.position.set(s * 0.33, 0, 0.02); sl.rotation.y = s * 0.5; g.add(sl); }
    const lm = gloss(0xd9c9a8, 0.3); lm.emissive = new THREE.Color(0x6a4420); lm.emissiveIntensity = 0.55;
    const lap = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.035, 0.2), lm); lap.position.set(0, 0.005, 0.1); g.add(lap);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
}

const ease = (k) => k * k * (3 - 2 * k);

// шаги сцены: [длительность, функция старта(ctx)]
export class MaskScene {
    constructor(fight, kind, done) {
        this.F = fight; this.kind = kind; this.done = done; this.t = 0; this.i = -1; this.over = false;
        const o = fight.f[1];
        this.floor = new THREE.Vector3(-0.35, 0.17, o.home + 0.35); // перед Павлом, ближе к Спиди
        this.floor.x = -0.35;
        if (kind === "pre") {
            this.gor = (fight.gorGltf && makeGorillaModel(fight.gorGltf, (o.cfg.height || 1.8) * 1.06)) || makeGorilla();
            this.gor.position.set(0, 0, o.home);
            this.gor.rotation.y = Math.PI; // стоит спиной к Спиди
            fight.group.add(this.gor);
            if (o.model) o.model.visible = false;
            this.steps = [
                [3.4, () => fight.say(MASK_SCENE.lines.gorilla, GOR, 3300)],
                [2.6, () => fight.say(MASK_SCENE.lines.speedy1, SPEEDY, 2500)],
                [1.6, () => { this.turn = 1; }],                    // поворачивается (шаги на месте) и хватается за голову костюма
                [1.2, () => { this.focus = 1; this.drop(); }],                            // в том же кадре: Горилла → Павел, маска падает (глухой звук)
                [1.8, () => fight.say(MASK_SCENE.lines.speedy2, SPEEDY, 1700)],
                [3.2, () => fight.say(MASK_SCENE.lines.pavel1, PAV, 3100)],
                [3.4, () => fight.say(MASK_SCENE.lines.speedy3, SPEEDY, 3300)],
                [3.4, () => fight.say(MASK_SCENE.lines.pavel2, PAV, 3300)],
                [3.4, () => { this.throwJacket(); fight.say(MASK_SCENE.lines.pavel3, PAV, 3300); }],
            ];
        } else {
            const mask = fight.mask;
            this.steps = [
                [0.35, () => this.fade()],                           // затемнение прячет, как Павел встаёт
                [1.2, () => { this.pick = 1; }],                     // поднимает маску
                [3.6, () => { this.offer = 1; fight.say(MASK_SCENE.lines.outro, PAV, 3500); }],
            ];
            this.mask = mask;
        }
        $("f-skip").hidden = false;
        $("f-skip").onclick = (e) => { e.preventDefault(); e.stopPropagation(); this.skip(); };
        this.next();
    }
    next() {
        this.i++;
        if (this.i >= this.steps.length) return this.end();
        this.t = 0; this.dur = this.steps[this.i][0];
        this.steps[this.i][1]();
    }
    flash() {
        const fl = $("f-flash"); fl.classList.remove("on"); void fl.offsetWidth; fl.classList.add("on");
        this.F.g.audio?.play("crash");
        setTimeout(() => { if (!this.over) this.swap(); }, 150);
    }
    fade() {
        const fl = $("f-flash"); fl.classList.remove("on", "dark"); void fl.offsetWidth; fl.classList.add("on", "dark");
        setTimeout(() => { if (!this.over) this.standUp(); }, 170);
    }
    swap() { // Гориллу убираем, Павел стоит с головой костюма в руке
        if (this.swapped) return; this.swapped = true;
        const F = this.F, o = F.f[1];
        const head = this.gor.userData.head;
        // голова остаётся там, где была на Горилле (в одном кадре: Гориллы уже нет, Павел есть)
        this.gor.updateMatrixWorld(true); F.group.updateMatrixWorld(true);
        const wp = head.getWorldPosition(new THREE.Vector3());
        if (this.gor.userData.model) F.group.attach(head); // сетка с костей — сохраняем мировой масштаб
        else { this.gor.remove(head); F.group.add(head); }
        F.group.remove(this.gor);
        if (o.model) o.model.visible = true;
        head.position.copy(F.group.worldToLocal(wp));
        head.position.x -= 0.25; // чуть перед Павлом, чтобы не висела в его голове
        head.rotation.set(0, 0, 0);
        F.mask = head;
    }
    drop() {
        this.swap();
        this.fall = { v: 0, from: this.F.mask.position.clone(), spin: 0 };
    }
    rest(m) { // маска лежит на асфальте: низ габарита — ровно на земле, сквозь пол не проваливается
        m.position.set(this.floor.x, this.floor.y, this.floor.z); m.rotation.set(-0.35, 0.6, 0.25);
        this.F.group.updateMatrixWorld(true);
        const b = new THREE.Box3().setFromObject(m), y0 = this.F.group.position.y;
        m.position.y += (y0 + 0.005) - b.min.y;
        this.F.group.updateMatrixWorld(true);
        this.maskTop = new THREE.Box3().setFromObject(m).max.y - y0;
    }
    jacketSpot() { return new THREE.Vector3(this.F.mask?.position.x ?? this.floor.x, (this.maskTop ?? 0.34) + 0.02, this.F.mask?.position.z ?? this.floor.z); }
    throwJacket() {
        const F = this.F, o = F.f[1];
        this.jacket = makeJacket();
        this.jacket.position.set(o.root.position.x, 1.3, o.root.position.z);
        F.group.add(this.jacket); F.jacket = this.jacket;
        this.jk = { t: 0, from: this.jacket.position.clone() };
    }
    standUp() { // после K.O.: Павел снова стоит (без клипа «поднимается» — спрятано затемнением)
        const F = this.F, o = F.f[1];
        o.clips.ko?.stop(); o.act = "idle"; o.t = 0; o.koYaw = undefined; o.koLift = undefined; o.z = o.home;
        if (o.model) { o.model.rotation.y = 0; }
        o.root.position.y = 0;
        F.phase = "outro";
        if (F.jacket) { F.group.remove(F.jacket); F.jacket = null; }
        this.pickFrom = this.mask?.position.clone();
    }
    update(dt) {
        if (this.over) return;
        this.t += dt;
        const F = this.F, o = F.f[1];
        if (this.gor && !this.swapped && this.gor.userData.model) {
            const g = this.gor;
            if (this.turn) {
                if (this.t < 0.7) { play(g, "walk", 0.2, 0.9); g.rotation.y = Math.PI * (1 - ease(Math.min(1, this.t / 0.7))); }
                else { g.rotation.y = 0; play(g, "grab_head", 0.15, 1.1); }
            }
            g.userData.mixer.update(dt);
        } else if (this.gor && !this.swapped) {
            if (this.turn) this.gor.rotation.y += (0 - this.gor.rotation.y) * Math.min(1, dt * 6);
            const k = this.turn ? Math.min(1, this.t / 0.8) : 0;
            for (const s of ["armL", "armR"]) { const a = this.gor.userData[s]; a.rotation.z = (s === "armL" ? -1 : 1) * 2.6 * ease(k) * 0.55; a.rotation.x = -2.4 * ease(k); }
            this.gor.position.y = Math.sin(F.t * 2.2) * 0.01;
        }
        if (this.fall && F.mask) {
            const m = F.mask, f = this.fall;
            f.v -= 9.8 * dt; m.position.y += f.v * dt;
            m.position.x += (this.floor.x - m.position.x) * Math.min(1, dt * 3);
            m.position.z += (this.floor.z - m.position.z) * Math.min(1, dt * 3);
            m.rotation.x += dt * 4; m.rotation.z += dt * 1.5;
            F.group.updateMatrixWorld(true);
            if (m.position.y <= this.floor.y || new THREE.Box3().setFromObject(m).min.y <= F.group.position.y + 0.005) {
                this.rest(m);
                this.focus = 0; // крупный план — только пока маска падает; реплики — общим планом, лицо Павла видно
                if (!f.landed) { f.landed = true; F.shake = 0.12; F.g.audio?.play("crash"); }
                this.fall = null;
            }
        }
        if (this.jk && F.jacket) {
            const k = Math.min(1, (this.jk.t += dt) / 0.6), j = F.jacket;
            j.position.lerpVectors(this.jk.from, this.jacketSpot(), ease(k));
            j.position.y += Math.sin(k * Math.PI) * 0.35;
            j.rotation.set(0.2 * (1 - k) + 0.18 * k, 0.7 + k * 0.4, 0.15 * (1 - k) - 0.12 * k);
            if (k >= 1) this.jk = null;
        }
        if (this.pick && this.mask && this.pickFrom) { // маска — в руку Павла, потом к Спиди
            const k = Math.min(1, this.t / 1.0);
            const hand = new THREE.Vector3(-0.25, 1.15, o.home + 0.3);
            const to = this.offer ? new THREE.Vector3(-0.2, 1.2, o.home + 0.62) : hand;
            const from = this.offer ? hand : this.pickFrom;
            this.mask.position.lerpVectors(from, to, ease(k));
            this.mask.rotation.x *= 0.9; this.mask.rotation.z *= 0.9; this.mask.rotation.y += (Math.PI * 0.0 - this.mask.rotation.y) * 0.1;
        }
        if (this.t >= this.dur) this.next();
    }
    skip() {
        if (this.over) return;
        if (this.kind === "pre") { this.swap(); if (F_hasMask(this.F)) this.rest(this.F.mask); this.fall = null;
            if (!this.F.jacket) { this.throwJacket(); } this.jk = null; this.F.jacket.position.copy(this.jacketSpot()); this.F.jacket.rotation.set(0, 1.1, 0); }
        this.F.say(null);
        this.end();
    }
    end() {
        if (this.over) return;
        this.focus = 0;
        this.over = true;
        $("f-skip").hidden = true; $("f-skip").onclick = null;
        if (this.gor && !this.swapped) this.swap();
        this.done();
    }
}
function F_hasMask(F) { return !!F.mask; }
const $ = (id) => document.getElementById(id);
