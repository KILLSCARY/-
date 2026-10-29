// Активистки на обочине Нячанга (локация Димы и Саши): стоят группами у бордюра, над головой — лозунг, подбежал —
// кидают в героя помидор, банан, банку, тапок или кокос. Предмет летит дугой в полосу героя, на асфальте заранее
// мигает красное пятно — куда прилетит: уйди в другую полосу или прыгни. Попало — брызги на экран, споткнулся;
// каждое HECKLERS.hitsToChase-е попадание — на хвосте Малахов, попадание при нём — поймал (как второй удар).
// Девушки — пул, модели — HECKLERS.models (свои, из Meshy) или, пока их нет, прохожая NPCS.girl.
import * as THREE from "./vendor/three.module.js";
import { HECKLERS, NPCS } from "./config.js";
import { loadModel } from "./models.js";

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const pickW = (list) => { let r = Math.random() * list.reduce((s, i) => s + i.w, 0); return list.find((i) => (r -= i.w) < 0) || list[0]; };

// предметы — из простых фигур, геометрии общие на все броски
function makeItems() {
    const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...o });
    const out = {};
    out.tomato = () => {
        const g = new THREE.Group();
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 9), std(0xd42a1e, { roughness: 0.25 }));
        body.scale.y = 0.85;
        const top = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.04, 5), std(0x2f7a2a));
        top.position.y = 0.11;
        g.add(body, top);
        return g;
    };
    out.banana = () => {
        const m = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.045, 7, 12, Math.PI * 0.8), std(0xf2d03a, { roughness: 0.6 }));
        m.rotation.z = Math.PI * 0.6;
        const g = new THREE.Group(); g.add(m);
        return g;
    };
    out.can = () => {
        const g = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.2, 12), std(pick([0xc8102e, 0x1f6fd1, 0x2ea84a]), { metalness: 0.7, roughness: 0.3 }));
        const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.02, 12), std(0xd0d0d0, { metalness: 0.9, roughness: 0.25 }));
        lid.position.y = 0.11;
        g.add(body, lid);
        return g;
    };
    out.slipper = () => {
        const g = new THREE.Group();
        const sole = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.025, 0.27), std(0x3a7bd5));
        const strap = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 5, 10, Math.PI), std(0xf0f0f0));
        strap.position.set(0, 0.012, -0.03);
        g.add(sole, strap);
        return g;
    };
    out.coconut = () => {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), std(0x5a3a22, { roughness: 0.95 })));
        return g;
    };
    return out;
}

export class Hecklers {
    constructor(game) {
        this.g = game;
        this.pool = [];
        this.flying = [];
        this.models = []; // свои девушки из HECKLERS.models — по мере загрузки
        const make = makeItems(), tpl = {};
        this.make = (id) => (tpl[id] ||= make[id]()).clone(); // геометрии и материалы — общие у всех бросков
        this._v = new THREE.Vector3();
        this.marks = [];
        this.reset();
        for (const cfg of HECKLERS.models) loadModel(cfg.url, (gltf) => {
            this.models.push({ cfg, m: this.g.world.fitRig(gltf, cfg.height) });
            for (const p of [...this.pool]) { // свои девушки пришли — запасные прохожие больше не нужны
                if (p.userData.own || p.userData.active) continue;
                p.removeFromParent(); p.userData.bubble?.remove();
                this.pool.splice(this.pool.indexOf(p), 1);
            }
        }, () => {}, { deferred: true });
    }

    reset() {
        this.nextAt = HECKLERS.firstAt;
        this.hits = 0;
        for (const p of this.pool) this.hide(p);
        for (const f of this.flying) { f.removeFromParent(); f.userData.mark.visible = false; }
        this.flying.length = 0;
        for (const m of this.marks) m.visible = false;
        this.splatEl?.replaceChildren();
    }

    get on() { return this.g.location === "vietnam"; }

    hide(p) {
        p.visible = false;
        p.userData.active = false;
        if (p.userData.bubble) p.userData.bubble.hidden = true;
    }

    makeGirl() {
        const w = this.g.world;
        const own = this.models.length ? pick(this.models) : null;
        const m = own ? own.m : w.npcModels.girl;
        if (!m) return null; // модель ещё грузится
        const cfg = own ? own.cfg : { idle: NPCS.girl.idle };
        const g = w.rig(m, cfg.idle);
        g.userData.cfg = cfg;
        g.userData.own = !!own;
        let hand = null;
        g.traverse((o) => { if (!hand && /RightHand$/.test(o.name)) hand = o; });
        g.userData.hand = hand;
        const bubble = document.createElement("div");
        bubble.className = "card-bubble heckle-bubble";
        bubble.hidden = true;
        document.getElementById("hud")?.appendChild(bubble);
        g.userData.bubble = bubble;
        w.scene.add(g);
        this.pool.push(g);
        return g;
    }

    // группа у бордюра с одной стороны; кричат одна-две, кидают все (каждая — в свой момент)
    spawnGroup(z) {
        const w = this.g.world, n = Math.round(rnd(...HECKLERS.group)), side = pick([-1, 1]);
        let made = 0;
        for (let i = 0; i < n; i++) {
            const p = this.pool.find((q) => !q.userData.active) || this.makeGirl();
            if (!p) break;
            const x = side * rnd(3.5, 4.6);
            p.position.set(x, 0.18, z - i * rnd(1.4, 2.4));
            p.rotation.y = -side * 0.7; // к бегущему, вполоборота к дороге
            Object.assign(p.userData, { active: true, thrown: false, throwZ: rnd(...HECKLERS.throwAt), shout: i < 2 && Math.random() < 0.8 });
            if (p.userData.shout) p.userData.bubble.textContent = pick(HECKLERS.shouts);
            p.visible = true;
            made++;
        }
        return made > 0;
    }

    blocked() {
        const g = this.g;
        return !this.on || g.state !== "playing" || g.bossCalm || g.bossFight || g.storyCatch || g.fx?.fly > 0;
    }

    update(dt, move) {
        const g = this.g;
        if (!this.on && !this.pool.some((p) => p.userData.active) && !this.flying.length) return;
        if (!this.blocked() && g.distance >= this.nextAt) {
            if (this.spawnGroup(HECKLERS.spawnZ)) this.nextAt = g.distance + rnd(...HECKLERS.gap);
        }
        for (const p of this.pool) {
            const u = p.userData;
            if (!u.active) continue;
            p.position.z += move;
            if (p.position.z > -70 && p.position.z < 8) u.mixer?.update(dt);
            if (!u.thrown && p.position.z > u.throwZ && !this.blocked()) { u.thrown = true; this.toss(p); }
            if (p.position.z > 12 || !this.on) this.hide(p);
            this.placeBubble(p);
        }
        for (let i = this.flying.length - 1; i >= 0; i--) {
            const f = this.flying[i], d = f.userData;
            d.t += dt / HECKLERS.flight;
            const k = Math.min(1, d.t);
            f.position.lerpVectors(d.from, d.to, k);
            f.position.y += Math.sin(k * Math.PI) * HECKLERS.arc;
            f.rotation.x += dt * d.spin; f.rotation.z += dt * d.spin * 0.6;
            d.mark.material.opacity = 0.35 + 0.45 * Math.abs(Math.sin(d.t * 14));
            d.mark.scale.setScalar(0.6 + k * 0.6);
            if (k >= 1 && !d.done) {
                d.done = true;
                d.mark.visible = false;
                const hit = g.state === "playing" && Math.abs(g.x - d.to.x) < 0.75 && g.y < HECKLERS.dodgeY && !(g.fx?.fly > 0);
                if (hit) { f.removeFromParent(); this.flying.splice(i, 1); this.hit(d.item); continue; }
                d.miss = 0; // промах: летит дальше за спину и падает
            }
            if (d.done) {
                d.miss += dt;
                f.position.z += dt * 9; f.position.y -= d.miss * 6 * dt * 4;
                if (f.position.y < 0 || d.miss > 1) { f.removeFromParent(); this.flying.splice(i, 1); }
            }
        }
    }

    // бросок: из руки девушки в полосу героя (или в соседнюю); на асфальте впереди мигает пятно — куда прилетит
    toss(p) {
        const g = this.g, w = g.world, u = p.userData;
        const lane = Math.random() < HECKLERS.aimOwn ? g.lane : Math.max(0, Math.min(2, g.lane + pick([-1, 1])));
        const item = pickW(HECKLERS.items);
        const from = new THREE.Vector3();
        if (u.hand) u.hand.getWorldPosition(from); else from.set(p.position.x, 1.5, p.position.z);
        const f = this.make(item.id);
        f.position.copy(from);
        w.scene.add(f);
        const mark = this.marks.find((m) => !m.visible) || this.makeMark();
        mark.position.set(w.lanes[lane], 0.04, -0.6);
        mark.visible = true;
        f.userData = { t: 0, from, to: new THREE.Vector3(w.lanes[lane], HECKLERS.aimY, 0), item, mark, spin: rnd(6, 14), done: false };
        this.flying.push(f);
        // бросок рукой: свой клип, если есть; у прохожей — короткий разворот корпусом к дороге
        const throwClip = u.cfg?.throw && u.mixer?._actions.find((a) => a.getClip().name === u.cfg.throw);
        if (throwClip) { throwClip.reset().setLoop(THREE.LoopOnce, 1).fadeIn(0.1).play(); throwClip.clampWhenFinished = false; }
        else p.rotation.y *= 0.3;
        if (u.shout && Math.random() < 0.5) u.bubble.textContent = pick(HECKLERS.shouts); // на броске — новый лозунг
    }

    makeMark() {
        const c = document.createElement("canvas");
        c.width = c.height = 64;
        const x = c.getContext("2d"), r = x.createRadialGradient(32, 32, 8, 32, 32, 32);
        r.addColorStop(0, "rgba(255,40,40,0)"); r.addColorStop(0.55, "rgba(255,40,40,.9)"); r.addColorStop(0.75, "rgba(255,40,40,.9)"); r.addColorStop(1, "rgba(255,40,40,0)");
        x.fillStyle = r; x.fillRect(0, 0, 64, 64);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({
            map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, opacity: 0.6,
        }));
        m.renderOrder = 3;
        this.g.world.scene.add(m);
        this.marks.push(m);
        return m;
    }

    // попадание: брызги на экран; первое — споткнулся, каждое hitsToChase-е — Малахов на хвосте, при нём — поймал
    hit(item) {
        const g = this.g;
        this.splat(item);
        if (g.fx.safe > 0) return;
        if (g.fx.shield) { g.fx.shield = false; g.fx.safe = 1; g.audio.play("boost"); return; }
        if (g.stumble > 0) { if (!g.spareLife?.({ position: { x: 99 }, visible: true, userData: {} })) g.gameOver("caught"); return; }
        this.hits++;
        if (this.hits % HECKLERS.hitsToChase === 0) return g.hitOnce({ position: { x: 99 }, visible: true, userData: {} });
        g.trip = 0.85;
        g.slowLeft = Math.max(g.slowLeft || 0, HECKLERS.slow);
        g.audio.play("hit");
        g.kick?.(0.2, 4);
    }

    // брызги на экране: несколько клякс цвета предмета, стекают и тают
    splat(item) {
        if (!this.splatEl) {
            this.splatEl = document.createElement("div");
            this.splatEl.className = "splat-fx";
            document.body.appendChild(this.splatEl);
        }
        const el = document.createElement("div");
        el.className = "splat";
        const blobs = [];
        for (let i = 0; i < 6; i++) {
            const x = rnd(20, 80), y = rnd(25, 70), r = rnd(6, 16);
            blobs.push(`radial-gradient(circle at ${x}% ${y}%, ${item.color} 0 ${r}%, transparent ${r + 1.5}%)`);
        }
        el.style.background = blobs.join(",");
        this.splatEl.appendChild(el);
        setTimeout(() => el.remove(), 1600);
    }

    placeBubble(p) {
        const el = p.userData.bubble, cam = this.g.camera;
        if (!el) return;
        const z = p.position.z;
        const show = p.userData.active && p.userData.shout && this.g.state === "playing" && z > -48 && z < -2 && cam;
        if (!show) { if (!el.hidden) el.hidden = true; return; }
        const v = this._v.set(p.position.x, 2.15, z).project(cam);
        if (v.z > 1 || Math.abs(v.x) > 1.1) { el.hidden = true; return; }
        const k = Math.min(1.1, Math.max(0.72, 1.2 + z / 70));
        el.style.transform = `translate(${((v.x + 1) / 2) * innerWidth}px, ${((1 - v.y) / 2) * innerHeight}px) translate(-50%, -100%) scale(${k.toFixed(2)})`;
        el.hidden = false;
    }
}
