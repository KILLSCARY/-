// Активистки на обочине Дубая (локация Димы и Саши): стоят группами у бордюра, над головой — лозунг, подбежал —
// кидают в героя помидор, банан, банку, тапок или кокос. Предмет летит дугой в полосу героя, на асфальте заранее
// мигает пятно — куда прилетит: можно уйти в другую полосу или прыгнуть. Попало — только брызги на экран.
// Девушки — пул, модели — HECKLERS.models (свои, из Meshy) или, пока их нет, прохожая NPCS.girl.
import * as THREE from "./vendor/three.module.js";
import { HECKLERS, NPCS } from "./config.js";
import { updateAmbientAnimation } from "./frame-timing.js";
import { loadModel } from "./models.js";

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const pickW = (list) => { let r = Math.random() * list.reduce((s, i) => s + i.w, 0); return list.find((i) => (r -= i.w) < 0) || list[0]; };

// Клякса на экране рисуется на холсте — раз на вид и вариант (3 на предмет), дальше из кэша. Неровное пятно с лучами
// брызг, капли вокруг, подтёки вниз, объём (свет сверху-слева) и блик; у помидора семечки, у банана тёмные крапинки,
// у банки пена с пузырями, у кокоса стружка, тапок оставляет отпечаток подошвы.
// Было: одна SVG-капля пяти цветов — все попадания выглядели одинаковыми «медузами»
const SPLAT_LOOK = {
    tomato: { base: "#d42a1e", dark: "#7e0e10", light: "#ff8a66", bits: "#f6d77a", bitR: [3, 5] },
    banana: { base: "#f2cf3a", dark: "#a8801a", light: "#fff3a8", bits: "#5c3d14", bitR: [1.5, 3] },
    can: { base: "#efe7d6", dark: "#b9ab8c", light: "#ffffff", foam: true },
    coconut: { base: "#f3eee2", dark: "#cbbd9e", light: "#ffffff", bits: "#7a5636", bitR: [2, 4] },
    slipper: { print: true, base: "#e2d3b4" }, // пыльный след подошвы — светлый: тёмный терялся на ночной дороге
};
const splatCache = new Map();
function splatImage(id, variant) {
    const key = `${id}${variant}`;
    if (splatCache.has(key)) return splatCache.get(key);
    const look = SPLAT_LOOK[id] || SPLAT_LOOK.tomato, S = 320, c = document.createElement("canvas");
    c.width = c.height = S;
    const g = c.getContext("2d");
    let seed = 7 + variant * 131 + id.length * 977;
    const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const cx = S / 2, cy = S * 0.42;
    if (look.print) { // отпечаток подошвы: след с протектором и брызги грязи
        g.save(); g.translate(cx, cy + 10); g.rotate((r() - 0.5) * 0.5);
        g.fillStyle = look.base; g.globalAlpha = 0.82;
        g.beginPath(); g.ellipse(0, -38, 46, 62, 0, 0, Math.PI * 2); g.fill(); // носок
        g.beginPath(); g.ellipse(0, 62, 34, 42, 0, 0, Math.PI * 2); g.fill(); // пятка
        g.fillRect(-32, -10, 64, 70);
        g.globalCompositeOperation = "destination-out"; g.globalAlpha = 0.7; g.lineWidth = 5;
        for (let y = -88; y < 100; y += 16) { g.beginPath(); for (let x = -50; x <= 50; x += 12) g.lineTo(x, y + (x / 12 % 2 ? 6 : 0)); g.stroke(); } // протектор
        g.restore();
        g.fillStyle = look.base;
        for (let i = 0; i < 14; i++) { const a = r() * 7, d = 95 + r() * 55; g.globalAlpha = 0.5 + r() * 0.4; g.beginPath(); g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.9, 2 + r() * 6, 0, 7); g.fill(); }
    } else {
        const R = S * (0.19 + r() * 0.03);
        const body = (pad = 0) => { // неровный край: точки по кругу со случайным радиусом, сглаженные кривыми
            const n = 22, pts = [];
            for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, k = 0.78 + r() * 0.42; pts.push([cx + Math.cos(a) * (R * k + pad), cy + Math.sin(a) * (R * k * 0.92 + pad)]); }
            g.beginPath(); g.moveTo((pts[0][0] + pts[n - 1][0]) / 2, (pts[0][1] + pts[n - 1][1]) / 2);
            for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; g.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2); }
            g.closePath();
        };
        g.fillStyle = look.base;
        for (let i = 0; i < 4 + Math.floor(r() * 3); i++) { // подтёки вниз с каплей на конце
            const x = cx + (r() - 0.5) * R * 1.4, w = 6 + r() * 10, len = R * (0.6 + r() * 1.1);
            g.beginPath(); g.moveTo(x - w / 2, cy); g.lineTo(x - w * 0.35, cy + len); g.lineTo(x + w * 0.35, cy + len); g.lineTo(x + w / 2, cy); g.fill();
            g.beginPath(); g.arc(x, cy + len, w * 0.62, 0, 7); g.fill();
        }
        for (let i = 0; i < 9 + Math.floor(r() * 5); i++) { // лучи брызг: клин от пятна наружу и капля на конце
            const a = r() * Math.PI * 2, d0 = R * 0.7, d1 = R * (1.25 + r() * 0.75), w = 0.06 + r() * 0.08;
            g.beginPath();
            g.moveTo(cx + Math.cos(a - w * 3) * d0, cy + Math.sin(a - w * 3) * d0);
            g.lineTo(cx + Math.cos(a) * d1, cy + Math.sin(a) * d1);
            g.lineTo(cx + Math.cos(a + w * 3) * d0, cy + Math.sin(a + w * 3) * d0);
            g.fill();
            g.beginPath(); g.arc(cx + Math.cos(a) * d1, cy + Math.sin(a) * d1, 3 + r() * 5, 0, 7); g.fill();
        }
        for (let i = 0; i < 16; i++) { const a = r() * Math.PI * 2, d = R * (1.5 + r() * 0.9); g.beginPath(); g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1.5 + r() * 4.5, 0, 7); g.fill(); } // капли вокруг
        const vol = g.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R * 1.25);
        vol.addColorStop(0, look.light); vol.addColorStop(0.45, look.base); vol.addColorStop(1, look.dark);
        g.fillStyle = vol; body(); g.fill();
        g.save(); body(); g.clip();
        if (look.foam) for (let i = 0; i < 26; i++) { // пена: пузыри разного размера
            const x = cx + (r() - 0.5) * R * 1.7, y = cy + (r() - 0.5) * R * 1.6, br = 3 + r() * 9;
            g.fillStyle = "rgba(255,255,255,.55)"; g.strokeStyle = "rgba(150,130,100,.45)"; g.lineWidth = 1.5;
            g.beginPath(); g.arc(x, y, br, 0, 7); g.fill(); g.stroke();
        }
        if (look.bits) for (let i = 0; i < 22; i++) { // семечки, крапинки, стружка
            const x = cx + (r() - 0.5) * R * 1.6, y = cy + (r() - 0.5) * R * 1.5, [b0, b1] = look.bitR;
            g.fillStyle = look.bits; g.globalAlpha = 0.85;
            g.beginPath(); g.ellipse(x, y, b0 + r() * (b1 - b0), (b0 + r() * (b1 - b0)) * 0.55, r() * 3, 0, 7); g.fill();
        }
        g.globalAlpha = 1;
        g.fillStyle = "rgba(255,255,255,.42)"; // блик
        g.beginPath(); g.ellipse(cx - R * 0.38, cy - R * 0.42, R * 0.32, R * 0.14, -0.5, 0, 7); g.fill();
        g.restore();
    }
    const url = c.toDataURL();
    splatCache.set(key, url);
    return url;
}

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
    }

    // свои девушки (~1 МБ каждая) грузятся, только когда локация впервые понадобилась — у остальных героев их нет
    loadModels() {
        if (this.loading) return;
        this.loading = true;
        const count = this.g.tier.npc < 0.5 ? 2 : this.g.tier.npc < 1 ? 3 : 4;
        const variants = [0, 3, 6, 9].slice(0, count).map(i => HECKLERS.models[i]).filter(Boolean);
        for (const cfg of variants) loadModel(cfg.url, (gltf) => {
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
        for (const timer of this.splatTimers?.values() || []) clearTimeout(timer);
        this.splatTimers?.clear();
        for (const p of this.pool) this.hide(p);
        for (const f of this.flying) { f.removeFromParent(); f.userData.mark.visible = false; }
        this.flying.length = 0;
        for (const m of this.marks) m.visible = false;
        this.splatEl?.replaceChildren();
    }

    get on() { if (this.g.location !== "vietnam") return false; this.loadModels(); return true; }

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
        const cfg = own ? { ...HECKLERS.clips, ...own.cfg } : { idle: NPCS.girl.idle };
        const g = w.rig(m, cfg.idle); // клип крика — с разного места, чтобы не кричали хором в такт
        g.userData.cfg = cfg;
        g.userData.own = own;
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
        const w = this.g.world, side = pick([-1, 1]);
        const limit = this.g.tier.npc < 0.5 ? 3 : this.g.tier.npc < 1 ? 4 : 6;
        const available = limit - this.pool.filter(p => p.userData.active).length;
        if (available <= 0) return false;
        let n = Math.min(available, Math.round(rnd(...HECKLERS.group)));
        if ((this.g.tier?.npc ?? 1) < 1) n = Math.min(n, 2); // слабый телефон: девушки по ~31 тыс. треугольников — не больше двух в группе
        let made = 0;
        for (let i = 0; i < n; i++) {
            const p = this.pool.find((q) => !q.userData.active) || this.makeGirl();
            if (!p) break;
            const x = side * rnd(3.5, 4.6);
            p.position.set(x, 0.18, z - i * rnd(1.4, 2.4));
            p.rotation.y = -side * 0.7; // к бегущему, вполоборота к дороге
            const u = p.userData;
            if (u.throwAct) { u.throwAct.stop(); u.idleAct?.stop().play(); } // из пула — снова кричит, а не застыла в замахе
            Object.assign(u, { active: true, thrown: false, releaseIn: 0, backIn: 0, throwZ: rnd(...HECKLERS.throwAt), shout: i % 2 === 0 && Math.random() < 0.85 }); // кричит через одну — облачка соседок не наезжают друг на друга
            if (p.userData.shout) p.userData.bubble.textContent = this.shout();
            p.visible = true;
            made++;
        }
        return made > 0;
    }

    // лозунг под героя: «Дима…» — только Диме, «Саша…/Товарус…» — только Саше, остальные — обоим
    shout() {
        const other = this.g.heroId === "dima" ? /Саш|Товарус/ : /Дима/;
        return pick(HECKLERS.shouts.filter((t) => !other.test(t)));
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
            // Замах близко к игроку обновляем каждый кадр; крики вдали — как прочие NPC.
            if (u.releaseIn > 0 || u.backIn > 0) u.mixer?.update(dt);
            else updateAmbientAnimation(p, dt, this.g.tier);
            if (!u.thrown && p.position.z > u.throwZ && !this.blocked()) { u.thrown = true; this.windup(p); }
            if (u.releaseIn > 0 && (u.releaseIn -= dt) <= 0 && !this.blocked()) this.toss(p);
            if (u.backIn > 0 && (u.backIn -= dt) <= 0) { u.throwAct?.fadeOut(0.25); u.idleAct?.reset().fadeIn(0.25).play(); }
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

    // замах: свой клип броска (из него берётся только начало — замах и бросок вперёд, release — когда предмет
    // уходит из руки, throwEnd — когда вернуться к крику); у прохожей — сразу бросок, корпус к дороге
    windup(p) {
        const u = p.userData, c = u.cfg;
        const clip = u.own?.m.gltf.animations.find((a) => a.name === c.throw);
        const act = clip && u.mixer?.clipAction(clip);
        if (!act) { p.rotation.y *= 0.3; return this.toss(p); }
        u.idleAct = u.mixer._actions.find((a) => a !== act && a.isRunning());
        u.idleAct?.fadeOut(0.15);
        act.reset().setLoop(THREE.LoopOnce, 1).fadeIn(0.15).play();
        u.throwAct = act;
        u.releaseIn = c.release;
        u.backIn = c.throwEnd;
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
        mark.visible = HECKLERS.mark !== false;
        f.userData = { t: 0, from, to: new THREE.Vector3(w.lanes[lane], HECKLERS.aimY, 0), item, mark, spin: rnd(6, 14), done: false };
        this.flying.push(f);
        if (u.shout && Math.random() < 0.5) u.bubble.textContent = this.shout(); // на броске — новый лозунг
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

    // Косметическое попадание: не расходует щит, не тормозит, не зовёт погоню и не завершает забег.
    hit(item) { this.splat(item); }

    splat(item) {
        if (!this.splatEl) {
            this.splatEl = document.createElement("div");
            this.splatEl.className = "splat-fx";
            this.splatEl.setAttribute("aria-hidden", "true");
            document.body.appendChild(this.splatEl);
            this.splatTimers = new Map();
        }
        // Не больше трёх пятен: HUD и дорога остаются различимыми даже при серии попаданий.
        while (this.splatEl.childElementCount >= 3) {
            const old = this.splatEl.firstElementChild;
            clearTimeout(this.splatTimers.get(old)); this.splatTimers.delete(old); old.remove();
        }
        const el = document.createElement("img");
        el.className = "splat"; el.alt = ""; el.draggable = false;
        el.src = splatImage(item.id, Math.floor(Math.random() * 3));
        el.style.left = `${rnd(25, 75)}%`; el.style.top = `${rnd(22, 43)}%`;
        el.style.setProperty("--tilt", `${rnd(-28, 28)}deg`);
        this.splatEl.appendChild(el);
        this.splatTimers.set(el, setTimeout(() => { el.remove(); this.splatTimers.delete(el); }, 2400));
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
