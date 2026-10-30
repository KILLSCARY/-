import * as THREE from "./vendor/three.module.js";

// Поимка: герой врезался и упал лицом вниз, преследователь наклоняется, хватает за лодыжку, поднимает и трясёт.
// Клипы только задают исходную позу, всё остальное считается на костях. Кости смешиваем сами, без AnimationMixer:
// он не перезаписывает кость, пока значение клипа не меняется, и ручные повороты накапливались бы.
const AX = new THREE.Vector3(1, 0, 0), AZ = new THREE.Vector3(0, 0, 1);
const STAGGER = 0.3, LAND = 0.68, ARRIVE = 0.9, GRAB = 1.2, YANK = 0.42, WHIP = 0.62, GAP = 0.2;
const WHIPS = [GRAB + YANK + 0.25, GRAB + YANK + 0.25 + WHIP + GAP];
const FOOT_Z = 1.9, CHASER_Z = FOOT_Z + 0.55, HOLD_Y = 1.86, HOLD_Z = CHASER_Z - 0.36;
const STEP = 1 / 120, COINS = 14;
export const CATCH_END = WHIPS[1] + WHIP + 0.45;

const ss = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const lerp = (a, b, k) => a + (b - a) * k;
const wp = (b) => b.getWorldPosition(new THREE.Vector3());

function aim(b, c, d) {
    const v = wp(c).sub(wp(b));
    if (v.lengthSq() < 1e-9) return;
    const turn = new THREE.Quaternion().setFromUnitVectors(v.normalize(), d.clone().normalize());
    const w = b.getWorldQuaternion(new THREE.Quaternion()).premultiply(turn);
    b.quaternion.copy(b.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(w));
    b.updateMatrixWorld(true);
}
function aimMix(b, c, d, k) {
    if (k <= 0) return;
    aim(b, c, wp(c).sub(wp(b)).normalize().lerp(d.clone().normalize(), k));
}
function rotW(b, axis, ang) {
    const w = b.getWorldQuaternion(new THREE.Quaternion()).premultiply(new THREE.Quaternion().setFromAxisAngle(axis, ang));
    b.quaternion.copy(b.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(w));
    b.updateMatrixWorld(true);
}
// две кости: колено или локоть — из длин, в сторону pole
function ik(a, b, c, target, pole) {
    const A = wp(a), la = wp(b).distanceTo(A), lb = wp(c).distanceTo(wp(b));
    const d = target.clone().sub(A), L = Math.min(d.length(), (la + lb) * 0.998);
    d.normalize();
    const x = (la * la - lb * lb + L * L) / (2 * L), h = Math.sqrt(Math.max(0, la * la - x * x));
    const p = pole.clone().sub(d.clone().multiplyScalar(pole.dot(d))).normalize();
    const J = A.clone().add(d.clone().multiplyScalar(x)).add(p.multiplyScalar(h));
    aim(a, b, J.clone().sub(A));
    aim(b, c, A.clone().add(d.multiplyScalar(L)).sub(J));
}

// кости модели и смешивание клипов
class Puppet {
    constructor(model, clips) {
        this.model = model;
        this.bones = [];
        this.named = {};
        const short = isShort(model);
        model.traverse((b) => { if (!b.isBone) return; this.bones.push({ b, q: b.quaternion.clone(), p: b.position.clone() }); this.named[boneName(b, short)] = b; });
        // поза покоя из скелета: на момент сцены кости стоят в кадре клипа
        let skel = null;
        model.traverse((o) => { if (!skel && o.isSkinnedMesh) skel = o.skeleton; });
        const m = new THREE.Matrix4(), scale = new THREE.Vector3();
        this.saved = this.bones.map((e) => ({ q: e.q.clone(), p: e.p.clone() }));
        for (const e of this.bones) {
            const i = skel.bones.indexOf(e.b), pi = skel.bones.indexOf(e.b.parent);
            if (i < 0 || pi < 0) continue; // корневая кость: положение остаётся как есть
            m.copy(skel.boneInverses[pi]).multiply(new THREE.Matrix4().copy(skel.boneInverses[i]).invert()).decompose(e.p, e.q, scale);
        }
        this.clips = {};
        for (const [name, clip] of Object.entries(clips)) {
            if (!clip) continue;
            const tracks = {};
            for (const t of clip.tracks) { const [bone, prop] = t.name.split("."); (tracks[bone] ||= {})[prop] = t.createInterpolant(); }
            this.clips[name] = { dur: clip.duration, tracks };
        }
    }
    apply(list) {
        const q = new THREE.Quaternion(), p = new THREE.Vector3();
        for (const e of this.bones) {
            e.b.quaternion.copy(e.q); e.b.position.copy(e.p);
            let total = 0;
            for (const [name, time, w] of list) {
                const c = this.clips[name];
                if (!c || w <= 0) continue;
                const k = c.tracks[e.b.name];
                if (!k) continue;
                total += w;
                const f = w / total;
                if (k.quaternion) { const v = k.quaternion.evaluate(time % c.dur); e.b.quaternion.slerp(q.set(v[0], v[1], v[2], v[3]), f === 1 ? w : f); }
                if (k.position) { const v = k.position.evaluate(time % c.dur); e.b.position.lerp(p.set(v[0], v[1], v[2]), f === 1 ? w : f); }
            }
        }
        this.model.updateMatrixWorld(true);
    }
    restore() { this.bones.forEach((e, i) => { e.b.quaternion.copy(this.saved[i].q); e.b.position.copy(this.saved[i].p); }); this.model.updateMatrixWorld(true); }
}

const NEEDED = ["Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "LeftFoot", "RightFoot", "LeftUpLeg", "LeftLeg", "RightUpLeg", "RightLeg", "RightShoulder", "RightArm", "RightForeArm", "RightHand", "LeftArm", "LeftForeArm", "LeftHand"];
// у Малахова другой скелет: 24 кости, позвоночник назван иначе, пальцев нет
const ALIAS = { Spine02: "Spine", Spine01: "Spine1", Spine: "Spine2", neck: "Neck" };
const boneName = (b, model24) => { const n = b.name.replace(/^mixamorig:?/, ""); return model24 ? ALIAS[n] || n : n; };
const isShort = (model) => { let short = false; model.traverse((b) => { if (b.isBone && /^Spine02$/.test(b.name)) short = true; }); return short; };
const hasRig = (model) => {
    if (!model) return false;
    const seen = new Set();
    const short = isShort(model);
    model.traverse((b) => { if (b.isBone) seen.add(boneName(b, short)); });
    return NEEDED.every((n) => seen.has(n));
};

export class CatchScene {
    // спрайт и модели без скелета — по-старому, сценой задержания
    static can(hero, chaser) { return hasRig(hero?.userData.model) && hasRig(chaser?.children[0]); }

    constructor(game, chaser, chaserClips, coin) {
        this.game = game; this.chaser = chaser; this.t = 0; this.x0 = game.x;
        const a = game.rat.userData.actions;
        this.hero = new Puppet(game.rat.userData.model, { run: a.run?.getClip(), stumble: (a.stumble || a.fall)?.getClip() });
        this.miz = new Puppet(chaser.children[0], chaserClips);
        this.from = chaser.position.clone();
        this.side = this.x0 > 0.2 ? -1 : 1; // камера со стороны середины улицы: у тротуара мешают дома
        this.phiX = 0; this.vX = 0; this.phiZ = 0; this.vZ = 0; this.taut = false;
        this.hist = []; this.acc = 0; this.nextCoin = 0; this.coinN = 0;
        this.foot = new THREE.Vector3(this.x0, 0.13, FOOT_Z);
        this.prevHand = this.handTarget(0);
        this.ankleY = 0;
        game.starsT = 0;
        game.rat.userData.blob.visible = false;
        game.rat.rotation.set(0, 0, 0);
        game.rat.userData.rig.rotation.set(0, 0, 0);
        game.rat.userData.rig.position.set(0, 0, 0);
        // длина тела от лодыжки до макушки — по позе покоя
        this.hero.apply([]);
        game.rat.position.set(this.x0, 0, 0);
        game.rat.quaternion.identity();
        game.rat.updateMatrixWorld(true);
        const top = this.heroBone("HeadTop_End") || this.heroBone("Head");
        this.bodyLen = Math.abs(wp(top).y - wp(this.heroBone("LeftFoot")).y);
        this.coins = [];
        if (coin) for (let i = 0; i < COINS; i++) { const c = coin.clone(); c.visible = false; game.scene.add(c); this.coins.push({ c, on: false, base: c.scale.x }); }
        // то, что стоит между камерой и сценой, убираем: столкновения в этот момент уже не считаются
        const camX = this.x0 + this.side * 3.4;
        for (const o of game.world.obstacles) {
            if (o.userData.type === "decor" || o.userData.type === "answer") continue;
            const lo = Math.min(camX, this.x0), hi = Math.max(camX, this.x0);
            const between = o.position.x > lo + 0.5 && o.position.x < hi + 0.4 && o.position.z > -3 && o.position.z < 6;
            const onHero = Math.abs(o.position.x - this.x0) < 1 && o.position.z > 0.2 && o.position.z < 5;
            if (between || onHero) { o.visible = false; o.userData.type = "decor"; }
        }
        this.pose();
    }

    heroBone(n) { return this.hero.named[n]; }
    mizBone(n) { return this.miz.named[n]; }

    whip(t) {
        let y = 0, x = 0;
        for (const b of WHIPS) {
            const u = (t - b) / WHIP;
            if (u > 0 && u < 1) { const e = Math.sin(u * Math.PI); y += Math.sin(u * Math.PI * 4) * e * 0.17; x += Math.sin(u * Math.PI * 3) * e * 0.28; }
        }
        return [x, y];
    }
    // цель кисти преследователя: лодыжка на земле → вверх и на рывки
    handTarget(t) {
        const lift = ss((t - GRAB - 0.08) / YANK), [wx, wy] = this.whip(t);
        const over = Math.sin(ss((t - GRAB - 0.08) / (YANK * 1.25)) * Math.PI) * 0.06;
        return new THREE.Vector3(lerp(this.foot.x, this.x0 + wx, lift), lerp(this.foot.y, HOLD_Y + over + wy, lift), lerp(this.foot.z, HOLD_Z, lift));
    }

    update(dt) {
        this.acc += Math.min(dt, 0.1);
        let last = this.t;
        while (this.acc >= STEP) { this.acc -= STEP; this.sim(); last = this.t; }
        if (last >= 0) this.pose();
    }

    sim() {
        const t = this.t += STEP, h = this.handTarget(t), v = h.clone().sub(this.prevHand).divideScalar(STEP);
        this.prevHand = h;
        this.hist.push(v.y);
        if (this.hist.length > 60) this.hist.shift();
        if (t > GRAB + 0.08) { // схваченное тело — маятник: рывок тянет его с запаздыванием
            this.vZ += (-this.phiZ * 55 - this.vZ * 5 + v.x * 20) * STEP; this.phiZ += this.vZ * STEP;
            this.vX += (-this.phiX * 48 - this.vX * 4.5 + Math.abs(v.y) * 1.5) * STEP; this.phiX += this.vX * STEP;
            if (!this.taut && t > GRAB + 0.08 + YANK * 0.8) { this.taut = true; this.vX += 1.6; this.game.audio.play("hit"); this.game.kick?.(0.25, 8); }
        }
        // монеты вылетают из карманов на резком движении вниз, падают и остаются лежать
        if (t > WHIPS[0] && v.y < -1.4 && t > this.nextCoin && this.coinN < this.coins.length) {
            this.nextCoin = t + 0.07;
            const c = this.coins[this.coinN++], n = this.coinN, a = n * 2.4;
            c.on = true; c.born = t; c.rest = false; c.spin = 6 + n % 5 * 2;
            c.p = wp(this.heroBone("Hips")).add(new THREE.Vector3(n % 2 ? 0.14 : -0.14, -0.04, 0.05));
            c.v = new THREE.Vector3(Math.cos(a) * 1.5, 1.2 + n % 4 * 0.45, Math.sin(a) * 0.9 - 0.5);
            c.c.visible = true;
        }
        for (const c of this.coins) {
            if (!c.on) continue;
            c.v.y -= 9.8 * STEP;
            c.p.addScaledVector(c.v, STEP);
            if (c.p.y < 0.03) { c.p.y = 0.03; if (Math.abs(c.v.y) < 0.8) { c.v.set(0, 0, 0); c.rest = true; } else { c.v.y *= -0.42; c.v.x *= 0.55; c.v.z *= 0.55; } }
            c.c.scale.setScalar(c.base * Math.min(1, (t - c.born) / 0.1));
            c.c.position.copy(c.p);
            if (c.rest) c.c.rotation.set(Math.PI / 2, 0, c.c.rotation.z);
            else c.c.rotation.set(t * c.spin, t * c.spin * 0.7, 0);
        }
    }

    pose() {
        const t = this.t, ch = this.chaser, mb = (n) => this.mizBone(n), hb = (n) => this.heroBone(n);
        // ---- преследователь: добегает, встаёт, наклоняется, поднимает
        const stopK = ss((t - ARRIVE + 0.25) / 0.3);
        this.miz.apply([["run", t * 1.05, 1 - stopK], ["stand", 0.5, stopK]]);
        const near = 1 - Math.pow(1 - Math.min(1, t / ARRIVE), 1.7), mx = lerp(this.from.x, this.x0 - 0.24, near), mz = lerp(this.from.z, CHASER_Z, near);
        ch.position.set(mx, 0, mz);
        ch.rotation.set(0, Math.PI, 0);
        ch.updateMatrixWorld(true);
        const [wx, wy] = this.whip(t);
        const bend = ss((t - ARRIVE) / 0.3) * (1 - ss((t - GRAB - 0.06) / YANK)), yanked = ss((t - GRAB - 0.08) / YANK);
        const sink = bend * 0.5 + (Math.max(0, -wy) + Math.max(0, wy) * 0.3) * 0.6;
        if (stopK > 0) {
            const hips = mb("Hips"), lf = mb("LeftFoot"), rf = mb("RightFoot");
            const L0 = wp(lf), R0 = wp(rf), fq = [lf, rf].map((b) => b.getWorldQuaternion(new THREE.Quaternion()));
            if (!this.ankleY) this.ankleY = Math.min(L0.y, R0.y);
            const w = wp(hips);
            w.y -= sink; w.z += bend * 0.14 + yanked * 0.05; w.x += wx * 0.12;
            hips.position.copy(hips.parent.worldToLocal(w));
            hips.updateMatrixWorld(true);
            const pitch = -bend + yanked * (0.12 + wy * 0.9);
            for (const n of ["Spine", "Spine1", "Spine2"]) { rotW(mb(n), AX, pitch / 3); rotW(mb(n), AZ, wx * 0.28); }
            rotW(mb("Head"), AX, -pitch * 0.75);
            rotW(mb("Neck"), AZ, -wx * 0.3);
            ik(mb("LeftUpLeg"), mb("LeftLeg"), lf, L0.lerp(new THREE.Vector3(mx - 0.2, this.ankleY, CHASER_Z + 0.12), stopK), new THREE.Vector3(-0.2, 0, -1));
            ik(mb("RightUpLeg"), mb("RightLeg"), rf, R0.lerp(new THREE.Vector3(mx + 0.2, this.ankleY, CHASER_Z - 0.04), stopK), new THREE.Vector3(0.2, 0, -1));
            [lf, rf].forEach((b, i) => { b.quaternion.copy(b.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(fq[i])); b.updateMatrixWorld(true); });
            aimMix(mb("LeftArm"), mb("LeftForeArm"), new THREE.Vector3(-0.55, -0.55 - wy * 1.2, 0.25 + wy * 0.5), stopK);
            aimMix(mb("LeftForeArm"), mb("LeftHand"), new THREE.Vector3(-0.25, -0.3 - wy, -0.5), stopK);
        }
        if (yanked > 0) rotW(mb("RightShoulder"), AZ, yanked * 0.5);
        const reach = ss((t - ARRIVE + 0.03) / 0.33);
        if (reach > 0) ik(mb("RightArm"), mb("RightForeArm"), mb("RightHand"), wp(mb("RightHand")).lerp(this.handTarget(t), reach), new THREE.Vector3(0.8, -0.5, 0.25));
        const grip = ss((t - GRAB + 0.06) / 0.08);
        for (const n of ["Index", "Middle", "Ring", "Pinky"]) for (const i of [1, 2, 3]) { const f = mb(`RightHand${n}${i}`); if (f) f.rotation.z -= grip * 1.05; }
        mb("RightHand").updateMatrixWorld(true);
        const hand = wp(mb("RightHand"));

        // ---- герой
        const rat = this.game.rat, fall = ss(t / 0.12), prone = ss((t - STAGGER) / 0.3);
        this.hero.apply([["run", t, 1 - fall], ["stumble", t * 1.4, fall * (1 - prone)]]);
        const held = t > GRAB;
        // угол: 0 — стоит, -90° — лежит лицом вниз, -180° — вниз головой; голова на асфальте, пока рука не подняла тело
        const th = held ? -Math.PI / 2 - Math.asin(Math.min(1, Math.max(0, (hand.y - 0.13) / this.bodyLen))) : -Math.PI / 2 * ss((t - STAGGER * 0.8) / (LAND - STAGGER * 0.8));
        const q = new THREE.Quaternion().setFromAxisAngle(AX, th);
        const free = held ? ss((hand.y - 0.13 - this.bodyLen * 0.9) / (this.bodyLen * 0.1)) : 0;
        q.premultiply(new THREE.Quaternion().setFromEuler(new THREE.Euler((this.phiX + 0.17) * free, 0, this.phiZ * (0.25 + 0.75 * free))));
        rat.quaternion.copy(q);
        rat.position.set(this.x0, 0, 0);
        rat.updateMatrixWorld(true);
        const U = new THREE.Vector3(0, 1, 0).applyQuaternion(q), F = new THREE.Vector3(0, 0, -1).applyQuaternion(q), S = U.clone().cross(F).normalize();
        const hang = ss((t - GRAB - 0.05) / 0.25), hv = (d) => this.hist[Math.max(0, this.hist.length - 1 - d)] || 0;
        if (hang > 0) ["Hips", "Spine", "Spine1", "Spine2", "Neck", "Head"].forEach((n, i) => { // волна по телу: рывок кисти приходит с запаздыванием
            const lag = hv(5 + i * 5);
            rotW(hb(n), AX, hang * 0.1 * lag * (i > 3 ? 1.5 : 1));
            rotW(hb(n), AZ, hang * 0.05 * Math.sin(t * 9 + i * 0.7) * Math.min(1, Math.abs(lag)));
        });
        const lying = prone * (1 - hang);
        if (lying > 0) { // лёжа: ноги вдоль тела, руки вперёд
            const back = U.clone().negate();
            for (const [a, b, c, s] of [["LeftUpLeg", "LeftLeg", "LeftFoot", -0.05], ["RightUpLeg", "RightLeg", "RightFoot", 0.05]]) {
                aimMix(hb(a), hb(b), back.clone().add(S.clone().multiplyScalar(s)), lying);
                aimMix(hb(b), hb(c), back, lying);
            }
            for (const [sd, sg] of [["Left", 1], ["Right", -1]]) {
                aimMix(hb(sd + "Arm"), hb(sd + "ForeArm"), U.clone().multiplyScalar(0.6).add(S.clone().multiplyScalar(sg * -0.75)).add(F.clone().multiplyScalar(-0.1)), lying);
                aimMix(hb(sd + "ForeArm"), hb(sd + "Hand"), U.clone().add(S.clone().multiplyScalar(sg * -0.25)), lying);
            }
        }
        if (hang > 0) { // схвачен: левая нога прямая, правая и руки висят под своим весом и запаздывают
            const down = new THREE.Vector3(0, -1, 0), lag = hv(9), up = U.clone().negate();
            aimMix(hb("LeftUpLeg"), hb("LeftLeg"), up, 1);
            aimMix(hb("LeftLeg"), hb("LeftFoot"), up, 1);
            aimMix(hb("RightUpLeg"), hb("RightLeg"), F.clone().multiplyScalar(-0.25).add(S.clone().multiplyScalar(0.75)).add(U.clone().multiplyScalar(-0.55)).add(new THREE.Vector3(0, lag * 0.06, 0)), hang);
            aimMix(hb("RightLeg"), hb("RightFoot"), down.clone().add(S.clone().multiplyScalar(0.45)).add(new THREE.Vector3(0, lag * 0.14, 0)), hang);
            for (const [sd, sg, ph] of [["Left", -1, 0], ["Right", 1, 1.7]]) {
                const fl = Math.sin(t * 11 + ph) * 0.28 * (1 - 0.4 * Math.min(1, Math.abs(lag)));
                aimMix(hb(sd + "Arm"), hb(sd + "ForeArm"), down.clone().add(S.clone().multiplyScalar(sg * 1.05 + fl)).add(F.clone().multiplyScalar(-0.25)).add(new THREE.Vector3(0, lag * 0.3, 0)), hang);
                aimMix(hb(sd + "ForeArm"), hb(sd + "Hand"), down.clone().multiplyScalar(0.45).add(S.clone().multiplyScalar(sg * 0.8 - fl)).add(new THREE.Vector3(0, lag * 0.5, 0)), hang);
            }
        }
        const f = wp(hb("LeftFoot"));
        if (held) rat.position.add(hand).sub(f);
        else { // отлетел от препятствия назад и упал лицом вперёд: ноги к преследователю
            const k = 1 - Math.pow(1 - Math.min(1, t / STAGGER), 2), z = lerp(0, FOOT_Z, k), lie = ss((t - STAGGER * 0.8) / (LAND - STAGGER * 0.8));
            rat.position.set(this.x0 + (this.x0 - f.x) * lie, (0.13 - f.y) * lie, z - f.z * lie);
            rat.updateMatrixWorld(true);
            this.foot.copy(wp(hb("LeftFoot")));
        }
        rat.updateMatrixWorld(true);
    }

    // камера: сбоку и низко, оба силуэта рядом и не закрывают друг друга
    aim(cam, target) {
        const t = this.t, o = ss(t / 0.85), lifted = ss((t - GRAB) / YANK), mid = lerp(this.chaser.position.z, FOOT_Z - lerp(1.15, 0.5, lifted), 0.5);
        const push = Math.min(0.45, Math.max(0, (t - GRAB) * 0.14));
        cam.position.lerp(new THREE.Vector3(this.x0 + this.side * (3.45 - push), 1.3, mid - 0.7), o);
        target.lerp(new THREE.Vector3(this.x0, lerp(0.55, 1.02, lifted), mid), ss(t / 0.45));
        const shake = Math.max(0, 1 - Math.abs(t - GRAB - 0.25) / 0.12) * 0.04 + Math.abs(this.whip(t)[1]) * 0.09;
        cam.position.x += Math.sin(t * 43) * shake;
        cam.position.y += Math.cos(t * 37) * shake;
    }

    dispose() {
        for (const c of this.coins) this.game.scene.remove(c.c);
        this.hero.restore();
        this.miz.restore();
        const rat = this.game.rat;
        rat.quaternion.identity();
        rat.position.set(this.x0, 0, 0);
    }
}
