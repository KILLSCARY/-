// Бой 1 на 1 в духе Tekken — прямо на ночной улице забега (тот же дождь, неон, свечение): камера по диагонали,
// герой ближе к нам, соперник лицом к камере. Раунды по FIGHT.roundTime, до FIGHT.winRounds побед.
// Управление: кнопки УДАР / БЛОК (держать) / УКЛОН / СУПЕР, на ПК — J (удар), S/↓ (блок), A D/← → (уклон), W/↑ (супер).
// Анимации: если в glb есть клипы с именами из FIGHT_CLIPS (punch, block, hit, ko, idle_fight…) — играют они.
// Пока их нет — позы собираются из костей Mixamo: каждую кость руки, ноги и корпуса поворачиваем так, чтобы она
// смотрела в нужную сторону мира (стойка, джеб, кросс, хук, блок, уклон, отдача). Нокаут — клип «dead» модели.
import * as THREE from "./vendor/three.module.js";
import { clone as cloneSkinned } from "./vendor/jsm/SkeletonUtils.js";
import { loadModel } from "./models.js";
import { FIGHT, FIGHT_CLIPS, FIGHTERS } from "./config.js";
import { tg } from "./tg.js";

const $ = (id) => document.getElementById(id);
const smooth = (k) => { k = Math.min(1, Math.max(0, k)); return k * k * (3 - 2 * k); };
const bell = (k, a, b) => (k <= a ? smooth(k / a) : 1 - smooth((k - a) / (b - a))); // 0 → 1 к a, → 0 к b
const pick = (a) => (Array.isArray(a) ? a[Math.floor(Math.random() * a.length)] : a);
const UP = new THREE.Vector3(0, 1, 0);

// повернуть кость так, чтобы направление «кость → child» смотрело по dir (мир), с весом w
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _qi = new THREE.Quaternion();
function aim(bone, child, dir, w = 1) {
    if (!bone || !child || w <= 0.001) return;
    bone.getWorldPosition(_a);
    child.getWorldPosition(_b);
    _b.sub(_a);
    if (_b.lengthSq() < 1e-8) return;
    _q.setFromUnitVectors(_b.normalize(), _a.copy(dir).normalize());
    if (w < 1) _q.slerpQuaternions(_qi, _q, w);
    bone.getWorldQuaternion(_q2).premultiply(_q);
    bone.parent.getWorldQuaternion(_qp).invert();
    bone.quaternion.copy(_qp.multiply(_q2));
    bone.updateMatrixWorld(true);
}
// повернуть кость вокруг оси мира (скрутка корпуса)
function twist(bone, axis, ang) {
    if (!bone || Math.abs(ang) < 1e-4) return;
    _q.setFromAxisAngle(axis, ang);
    bone.getWorldQuaternion(_q2).premultiply(_q);
    bone.parent.getWorldQuaternion(_qp).invert();
    bone.quaternion.copy(_qp.multiply(_q2));
    bone.updateMatrixWorld(true);
}

// искра удара: текстура на всех одна
let sparkTex = null;
function sparkTexture() {
    if (sparkTex) return sparkTex;
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d");
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.25, "rgba(255,230,150,.9)"); r.addColorStop(1, "rgba(255,120,40,0)");
    g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = "rgba(255,255,255,.95)"; g.lineWidth = 5; g.lineCap = "round";
    for (let i = 0; i < 8; i++) { // лучи
        const a = (i / 8) * Math.PI * 2 + 0.2, l = i % 2 ? 40 : 60;
        g.beginPath(); g.moveTo(64 + Math.cos(a) * 14, 64 + Math.sin(a) * 14); g.lineTo(64 + Math.cos(a) * l, 64 + Math.sin(a) * l); g.stroke();
    }
    sparkTex = new THREE.CanvasTexture(c);
    sparkTex.encoding = THREE.sRGBEncoding;
    return sparkTex;
}

export class Fight {
    // opts: { hero, opponent, bonus: { super, hp }, onEnd(win) }
    constructor(game, opts) {
        this.g = game;
        this.opts = opts;
        this.heroCfg = FIGHTERS[opts.hero] || FIGHTERS.mouse; // пока дерётся только Спиди
        this.oppCfg = FIGHTERS[opts.opponent];
        this.round = 0;
        this.wins = [0, 0];
        this.superV = Math.min(FIGHT.superMax, opts.bonus?.super || 0);
        this.hpBonus = opts.bonus?.hp || 0;
        this.t = 0;
        this.camT = 0;
        this.stop = 0;     // стоп-кадр при попадании (сек)
        this.slow = 1;     // замедление (нокаут)
        this.shake = 0;
        this.phase = "load"; // load → intro → fight → roundEnd → end
        this.group = new THREE.Group();
        game.scene.add(this.group);
        this.sparks = [];
        this.build();
        this.bindInput();
    }

    build() {
        // герой ближе к камере (z > 0) и смотрит на −Z, соперник — на +Z, лицом к камере
        this.f = [this.makeFighter(this.heroCfg, 1), this.makeFighter(this.oppCfg, -1)];
        this.f[0].hpMax = this.heroCfg.hp + this.hpBonus;
        this.f[1].hpMax = this.oppCfg.hp;
        for (const f of this.f) { f.hp = f.hpMax; f.shown = f.hpMax; }
        let left = 2;
        for (const f of this.f) loadModel(f.cfg.model, (gltf) => { this.attach(f, gltf); if (--left === 0) this.ready(); },
            () => { if (--left === 0) this.ready(); });
        // подсветка бойцов: тёплый слева-спереди, красный и синий контровые
        const key = new THREE.PointLight(0xffd2b0, 1.4, 9);
        key.position.set(-1.6, 2.6, 2.2);
        const rimR = new THREE.PointLight(0xff2a40, 3.2, 8);
        rimR.position.set(1.8, 2.2, -2.4);
        const rimB = new THREE.PointLight(0x3a7bff, 2.4, 8);
        rimB.position.set(-1.8, 1.8, -2.0);
        this.group.add(key, rimR, rimB);
        // световой круг на асфальте — «ринг»
        const ringTex = (() => {
            const c = document.createElement("canvas"); c.width = c.height = 256;
            const g = c.getContext("2d");
            const r = g.createRadialGradient(128, 128, 60, 128, 128, 128);
            r.addColorStop(0, "rgba(255,255,255,0)"); r.addColorStop(0.82, "rgba(255,255,255,.0)"); r.addColorStop(0.9, "rgba(255,255,255,.9)"); r.addColorStop(1, "rgba(255,255,255,0)");
            g.fillStyle = r; g.fillRect(0, 0, 256, 256);
            const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
        })();
        this.ring = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6), new THREE.MeshBasicMaterial({ map: ringTex, color: 0xe3343a, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
        this.ring.rotation.x = -Math.PI / 2;
        this.ring.position.set(0, 0.03, 0);
        this.group.add(this.ring);

        $("f-name-l").textContent = this.heroCfg.name;
        $("f-name-r").textContent = this.oppCfg.name;
        $("f-ph-l").style.backgroundImage = this.heroCfg.portrait ? `url(${this.heroCfg.portrait})` : "";
        $("f-ph-r").style.backgroundImage = this.oppCfg.portrait ? `url(${this.oppCfg.portrait})` : "";
        $("fight").hidden = false;
        this.big("");
        this.hud();
    }

    makeFighter(cfg, dir) {
        const root = new THREE.Group();
        const home = dir * FIGHT.gap / 2;
        root.position.set(0, 0, home);
        root.rotation.y = dir > 0 ? Math.PI : 0; // модели Meshy смотрят в +Z
        this.group.add(root);
        return { cfg, dir, root, home, z: home, act: "idle", t: 0, dur: 0, cd: 0, combo: 0, hand: 0, mixer: null, clips: {}, b: {},
            fwd: new THREE.Vector3(0, 0, -dir), right: new THREE.Vector3(dir, 0, 0), kb: 0, flash: 0, mats: [] };
    }

    attach(f, gltf) {
        const m = cloneSkinned(gltf.scene);
        m.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3());
        const k = f.cfg.height / (size.y || 1);
        m.scale.setScalar(k);
        m.position.set(0, -box.min.y * k, 0);
        m.traverse((o) => {
            if (o.isMesh) {
                o.frustumCulled = false;
                o.castShadow = true;
                o.material = o.material.clone(); // вспышка при попадании — только у этого бойца
                if (o.material.emissive) f.mats.push(o.material);
            }
            if (o.isBone) f.b[o.name.replace(/^mixamorig:?/, "")] = o;
        });
        f.model = m;
        f.root.add(m);
        f.mixer = new THREE.AnimationMixer(m);
        const list = gltf.animations || [];
        for (const [hook, names] of Object.entries(FIGHT_CLIPS)) {
            const clip = names.map((n) => list.find((a) => a.name.toLowerCase() === n.toLowerCase())).find(Boolean);
            if (clip) f.clips[hook] = f.mixer.clipAction(clip);
        }
        // база — стоящая поза: свой idle_fight, иначе первый кадр прыжка (стоит ровно), иначе бег
        const base = f.clips.idle || f.mixer.clipAction(list.find((a) => a.name === "jump") || list.find((a) => a.name === "run") || list[0]);
        f.base = base;
        base.play();
        if (!f.clips.idle) { base.timeScale = 0; base.time = 0; }
        const ko = list.find((a) => a.name === "dead");
        if (ko && !f.clips.ko) f.clips.ko = f.mixer.clipAction(ko);
        f.walk = list.find((a) => a.name === "walk" || a.name === "run");
        // приёмы из клипов боя (FIGHTERS[…].moves): каждый — кусок клипа [from, to], время ставим сами
        if (f.cfg.moves) {
            f.acts = {};
            for (const m of Object.values(f.cfg.moves)) {
                if (f.acts[m.clip]) continue;
                const clip = list.find((a) => a.name === m.clip);
                if (!clip) continue;
                const a = f.mixer.clipAction(clip);
                a.play(); a.timeScale = 0; a.setEffectiveWeight(0);
                f.acts[m.clip] = a;
            }
            if (f.base && !f.acts[f.base.getClip().name]) { f.base.stop(); f.base = null; }
            f.moves = f.cfg.moves;
        }
        f.proc = !f.clips.punch; // процедурные удары, пока нет своих клипов
        console.info(`[fight] ${f.cfg.name}: клипы`, list.map((a) => a.name), "крючки боя:", Object.keys(f.clips));
    }

    ready() {
        this.phase = "intro";
        this.startRound();
    }

    startRound() {
        this.round++;
        for (const f of this.f) {
            f.hp = f.hpMax; f.shown = f.hpMax; f.act = "idle"; f.t = 0; f.cd = 0; f.combo = 0; f.kb = 0; f.z = f.home;
            if (f.clips.ko) f.clips.ko.stop();
            if (f.clips.win) f.clips.win.stop();
            f.base?.reset().play();
            if (f.base && f.base !== f.clips.idle) { f.base.timeScale = 0; f.base.time = 0; }
            f.seg = null;
        }
        this.timeLeft = FIGHT.roundTime;
        // ИИ: раунд за раундом злее (FIGHTERS[…].ai)
        const ai = this.oppCfg.ai, r = Math.min(this.round, 3) - 1;
        this.ai = { next: 1.0, guard: 0, streak: 0, block: ai.block[r], every: ai.every[r], heavy: ai.heavy[r], combo: ai.combo[r], third: ai.third[r] };
        this.phase = "intro";
        this.introT = 0;
        this.say(this.round === 1 ? this.oppCfg.lines.intro : this.round === 3 ? this.oppCfg.lines.final : null);
        this.bigShown = 0;
        this.hud();
    }

    big(text, cls = "") {
        const b = $("f-big");
        b.textContent = text;
        b.className = "f-big " + cls;
        b.hidden = !text;
        if (text) { b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop"); }
    }

    say(text) {
        const el = $("f-say");
        clearTimeout(this.sayT);
        if (!text) { el.hidden = true; return; }
        el.innerHTML = `<b>${this.oppCfg.short || this.oppCfg.name}</b>${text}`;
        el.hidden = false;
        el.classList.remove("in"); void el.offsetWidth; el.classList.add("in");
        this.sayT = setTimeout(() => (el.hidden = true), 2600);
    }

    // ---- ввод: кнопки, свайпы и клавиатура ----
    bindInput() {
        const on = (id, ev, fn) => { const el = $(id); el.addEventListener(ev, fn); (this.unbind ||= []).push(() => el.removeEventListener(ev, fn)); };
        const tap = (cmd) => (e) => { e.preventDefault(); e.stopPropagation(); this.input(cmd); };
        on("fb-punch", "pointerdown", tap("punch"));
        on("fb-dodge", "pointerdown", tap("dodge"));
        on("fb-super", "pointerdown", tap("super"));
        on("fb-block", "pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); this.holdBlock = true; this.input("block"); });
        const release = () => { this.holdBlock = false; };
        on("fb-block", "pointerup", release);
        on("fb-block", "pointercancel", release);
        on("fb-block", "pointerleave", release);
        // по пустому месту: тап — удар, свайп вниз — блок, в сторону — уклон, вверх — супер
        let s = null;
        on("fight", "pointerdown", (e) => { s = { x: e.clientX, y: e.clientY }; });
        on("fight", "pointerup", (e) => {
            if (!s) return;
            const dx = e.clientX - s.x, dy = e.clientY - s.y;
            s = null;
            if (Math.hypot(dx, dy) < 28) return this.input("punch");
            if (Math.abs(dy) > Math.abs(dx)) this.input(dy > 0 ? "block" : "super");
            else this.input("dodge");
        });
        const keys = { j: "punch", " ": "punch", k: "super", w: "super", ArrowUp: "super", a: "dodge", d: "dodge", ArrowLeft: "dodge", ArrowRight: "dodge" };
        const kd = (e) => {
            if (e.key === "s" || e.key === "ArrowDown") { e.preventDefault(); this.holdBlock = true; this.input("block"); return; }
            const k = keys[e.key];
            if (k && !e.repeat) { e.preventDefault(); this.input(k); }
        };
        const ku = (e) => { if (e.key === "s" || e.key === "ArrowDown") this.holdBlock = false; };
        addEventListener("keydown", kd);
        addEventListener("keyup", ku);
        this.unbind.push(() => removeEventListener("keydown", kd), () => removeEventListener("keyup", ku));
    }

    input(cmd) {
        if (this.phase !== "fight") return;
        const h = this.f[0];
        const free = h.act === "idle" || (h.act === "block" && cmd !== "block");
        if (cmd === "punch") {
            // связка: следующий удар можно нажать в конце текущего — джеб, кросс, третий — с доворотом (сильнее)
            if (h.act === "punch" && h.t > h.dur * 0.55) { h.queued = true; return; }
            if (!free || h.cd > 0) return;
            this.punch(h);
        } else if (cmd === "block") {
            if (h.act === "idle") this.act(h, "block", FIGHT.blockTime);
        } else if (cmd === "dodge") {
            if (!free || h.cd > 0) return;
            this.act(h, "dodge", FIGHT.dodgeTime);
            h.cd = FIGHT.dodgeCd;
        } else if (cmd === "super") {
            if (this.superV < FIGHT.superMax) { this.flashHint("Супер копится от ударов и верных ответов"); return; }
            if (!free) return;
            this.superV = 0;
            this.act(h, "super", FIGHT.superTime);
            this.big("СУПЕР!", "gold");
            clearTimeout(this.bigT);
            this.bigT = setTimeout(() => { if (this.phase === "fight") this.big(""); }, 900);
            this.slow = 0.55;
            this.g.audio?.play("boost");
            this.g.kick?.(0.1, 6);
        }
    }

    punch(f) {
        f.combo = f.act === "punch" || f.t < 0.25 ? (f.combo + 1) % 3 : 0;
        f.hand = f.combo % 2; // 0 — левая (джеб), 1 — правая (кросс)
        const t = f.cfg.punchTime || FIGHT.punchTime;
        this.act(f, "punch", f.combo === 2 ? t * 1.25 : t);
        f.cd = FIGHT.punchCd;
    }

    flashHint(t) {
        const el = $("f-hint");
        el.textContent = t;
        el.hidden = false;
        clearTimeout(this.hintT);
        this.hintT = setTimeout(() => (el.hidden = true), 1600);
    }

    // какой приём из клипов играет действие (null — поза из костей поверх стойки)
    moveOf(f, act = f.act) {
        if (!f.moves) return null;
        if (act === "punch") return f.moves[f.combo === 2 ? "hook" : f.hand ? "cross" : "jab"] || null;
        return f.moves[act] || null;
    }

    act(f, act, time) {
        f.act = act; f.t = 0; f.dur = time; f.hitDone = false; f.queued = false; f.hitsDone = 0;
        const mv = this.moveOf(f, act);
        if (mv && !mv.fit) f.dur = (mv.to - mv.from) / (mv.speed || 1); // длина — по клипу
        f.hitAt = mv?.hit !== undefined ? (mv.hit - mv.from) / (mv.to - mv.from) : null;
        f.hitsAt = mv?.hits ? mv.hits.map((h) => (h - mv.from) / (mv.to - mv.from)) : null;
        const hook = act === "heavyWind" || f.moves ? null : act; // есть приёмы из клипов — крючки FIGHT_CLIPS не нужны
        const a = hook && f.clips[hook];
        f.usedClip = !!a;
        if (a) {
            a.reset().setLoop(THREE.LoopOnce, 1);
            a.clampWhenFinished = true;
            a.fadeIn(0.06).play();
        }
    }

    // удар att → def; kind: jab, cross, hook, heavy, super. Возвращает урон.
    strike(att, def, kind) {
        const c = att.cfg.dmg, counter = def.act === "recoil"; // по открытому после блока или промаха — контр, урон ×1.5
        const unstoppable = kind === "super" || att.act === "super"; // серию супера не заблокировать и не уклониться
        const dmg = Math.round(c[kind] * (counter ? FIGHT.counter : 1));
        const st = (this.stats ||= {}), key = `${att === this.f[0] ? "h" : "o"}_${kind}`;
        const contact = this.fistPos(att, kind === "heavy" ? 1 : att.hand);
        // уклон: мимо; от хука с замахом — бьющий проваливается и открыт для контратаки
        if (def.act === "dodge" && def.t < def.dur * 0.85 && !unstoppable) {
            this.popText(def, "МИМО", "miss");
            if (kind === "heavy") { this.act(att, "recoil", FIGHT.whiffTime); this.popText(att, "КОНТРАТАКА!", "crit"); }
            return 0;
        }
        // блок: урон почти весь гасится, бьющего отбрасывает — у защитника окно для ответа
        if (def.act === "block" && !unstoppable) {
            const d = Math.max(1, Math.round(dmg * (1 - FIGHT.blockCut)));
            def.hp = Math.max(0, def.hp - d);
            def.kb = 0.12;
            def.t = Math.min(def.t, def.dur * 0.5);
            this.popText(def, "БЛОК", "block");
            this.spark(contact, 0.45, 0x9fd8ff);
            this.g.audio?.play("coin");
            this.act(att, "recoil", kind === "heavy" ? FIGHT.recoilTime * 1.4 : FIGHT.recoilTime);
            st[key + "_blk"] = (st[key + "_blk"] || 0) + 1;
            return d;
        }
        def.hp = Math.max(0, def.hp - dmg);
        st[key] = (st[key] || 0) + dmg;
        def.streak = (def.streak || 0) + 1;
        def.lastHit = this.t;
        // броня: лёгкие удары не сбивают замах хука — только урон
        // и начатый удар лёгким не сбить — размен: оба получают
        const armor = (kind === "jab" || kind === "cross") && (def.act === "heavyWind" || def.act === "heavy" || (def.act === "punch" && def.t > def.dur * 0.2));
        if (armor) { def.flash = 0.6; this.popText(def, `−${dmg}`, ""); this.spark(contact, 0.5, 0xffffff); this.g.audio?.play("hit"); return dmg; }
        this.act(def, "hit", FIGHT.stun[kind]);
        def.kb = kind === "jab" ? 0.1 : kind === "cross" ? 0.16 : kind === "super" ? 0.6 : 0.32;
        def.flash = 1;
        def.hitSide = att.hand ? 1 : -1;
        this.spark(contact, kind === "jab" ? 0.6 : kind === "super" ? 1.4 : 0.9, kind === "super" ? 0xffd65a : 0xffffff);
        this.popText(def, counter ? `КОНТР −${dmg}` : `−${dmg}`, counter || kind === "heavy" || kind === "super" || kind === "hook" ? "crit" : "");
        this.stop = kind === "jab" ? 0.045 : kind === "super" ? 0.16 : 0.09; // стоп-кадр — удар «чувствуется»
        this.shake = kind === "jab" ? 0.05 : kind === "super" ? 0.3 : 0.16;
        this.g.audio?.play(kind === "jab" || kind === "cross" ? "hit" : "crash");
        if (def === this.f[0]) tg.haptic(kind === "jab" ? "light" : "heavy");
        if (att === this.f[0] && kind !== "super") this.superV = Math.min(FIGHT.superMax, this.superV + FIGHT.superPerHit);
        if (def === this.f[0]) this.superV = Math.min(FIGHT.superMax, this.superV + FIGHT.superPerHurt); // и за пропущенный
        return dmg;
    }

    // где кулак (для искры): кость руки, иначе грудь соперника
    fistPos(f, hand) {
        const b = hand ? f.b.RightHand : f.b.LeftHand;
        const p = new THREE.Vector3();
        if (b) b.getWorldPosition(p); else p.set(0, 1.3, 0);
        return p;
    }

    spark(pos, size, color) {
        const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTexture(), color, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, toneMapped: false }));
        m.position.copy(pos);
        m.scale.setScalar(0.01);
        m.material.rotation = Math.random() * Math.PI;
        m.renderOrder = 20;
        this.group.add(m);
        this.sparks.push({ m, t: 0, size });
    }

    popText(f, text, cls) {
        const head = f.b.Head, p = new THREE.Vector3();
        if (head) head.getWorldPosition(p); else p.set(0, 1.7, f.z);
        p.y += 0.25;
        p.project(this.g.camera);
        const el = document.createElement("b");
        el.className = `f-pop ${cls}`;
        el.textContent = text;
        el.style.left = `${(p.x * 0.5 + 0.5) * 100}%`;
        el.style.top = `${(-p.y * 0.5 + 0.5) * 100}%`;
        $("fight").appendChild(el);
        setTimeout(() => el.remove(), 800);
    }

    // ---- ИИ соперника ----
    // Держит блок кусками, ловит серии героя и наказывает за удары в блок, бьёт двойками и хуком с замахом
    // (замах подсвечен — «ставь блок или уклонись»). С каждым раундом быстрее и чаще блокирует.
    think(dt) {
        const o = this.f[1], h = this.f[0], ai = this.ai, c = this.oppCfg;
        ai.next -= dt;
        ai.guard -= dt;
        // реакция на удар героя: ставит блок с вероятностью ai.block (чем дольше герой долбит, тем охотнее)
        if (h.act === "punch" && h.t < 0.05 && !h.seen) {
            h.seen = true;
            // кто долбит без пауз — нарывается на блок: шанс растёт с каждым ударом подряд
            ai.spam = this.t - (ai.lastHeroPunch ?? -9) < 0.95 ? (ai.spam || 0) + 1 : 0;
            ai.lastHeroPunch = this.t;
            const p = Math.min(0.88, ai.block + ai.spam * 0.13);
            if ((o.act === "idle" || o.act === "block") && Math.random() < p) { this.act(o, "block", 0.55); ai.next = Math.min(ai.next, 0.35); }
        }
        if (h.act !== "punch") h.seen = false;
        // наказание: герой ударил в блок и отлетел — сразу двойка
        if (h.act === "recoil" && !h.punished && (o.act === "idle" || o.act === "block")) {
            h.punished = true;
            o.act = "idle";
            this.queueAi([["punch", 0.04], ["punch", 0.05]]);
        }
        if (h.act !== "recoil") h.punished = false;
        // пропустил три подряд — закрывается и отвечает
        if (this.t - (o.lastHit || 0) > 1.1) o.streak = 0;
        if (o.streak >= 3 && o.act === "idle") {
            o.streak = 0;
            this.act(o, "block", 0.45);
            this.queueAi([["punch", 0.3]]);
            ai.next = 0.9;
        }
        if (o.act !== "idle" || ai.next > 0) return this.runQueue();
        const rage = 1 + (1 - o.hp / o.hpMax) * 0.35;
        const r = Math.random();
        if (r < ai.heavy) {
            this.act(o, "heavyWind", c.telegraph[Math.min(this.round, 3) - 1]);
            if (Math.random() < 0.5) this.say(pick(c.lines.heavy));
        } else if (r < ai.heavy + ai.combo) this.queueAi([["punch", 0], ["punch", 0.05], ...(Math.random() < ai.third ? [["punch", 0.05]] : [])]);
        else if (r < ai.heavy + ai.combo + 0.18) { this.act(o, "block", 0.6 + Math.random() * 0.5); }
        else this.queueAi([["punch", 0]]);
        ai.next = (ai.every[0] + Math.random() * (ai.every[1] - ai.every[0])) / rage;
    }

    queueAi(list) { this.ai.queue = list.map(([a, d]) => ({ a, d })); this.runQueue(); }

    runQueue() {
        const o = this.f[1], q = this.ai.queue;
        if (!q?.length) return;
        if (o.act !== "idle" && !(o.act === "punch" && o.t > o.dur * 0.8)) return;
        const n = q[0];
        n.d -= 1 / 60;
        if (n.d > 0) return;
        q.shift();
        this.punch(o);
    }

    update(dt) {
        if (this.phase === "end") return;
        if (this.bot) this.bot(dt);
        // стоп-кадр и замедление
        if (this.stop > 0) { this.stop -= dt; dt *= 0.05; }
        this.slow += (1 - this.slow) * Math.min(1, dt * 1.5);
        dt *= this.slow;
        this.t += dt;
        this.camT += dt;
        for (const f of this.f) f.mixer?.update(dt);
        this.updateSparks(dt);
        if (this.phase === "load") { this.camera(dt); return; }
        const [h, o] = this.f;
        if (this.phase === "intro") {
            this.introT += dt;
            if (this.introT > 0.25 && this.bigShown === 0) { this.bigShown = 1; this.big(this.round === 3 ? "ФИНАЛЬНЫЙ РАУНД" : `РАУНД ${this.round}`, this.round === 3 ? "red" : ""); this.g.audio?.play("count"); }
            if (this.introT > 1.5 && this.bigShown === 1) { this.bigShown = 2; this.big("БОЙ!", "red"); this.g.audio?.play("go"); }
            if (this.introT > 2.1) { this.phase = "fight"; this.big(""); }
        } else if (this.phase === "fight") {
            this.timeLeft -= dt;
            this.think(dt);
            if (this.holdBlock && h.act === "idle") this.act(h, "block", FIGHT.blockTime);
            if (h.act === "block" && this.holdBlock) h.t = Math.min(h.t, h.dur * 0.5); // держит, пока палец на кнопке
            for (const [a, d] of [[h, o], [o, h]]) {
                a.cd = Math.max(0, a.cd - dt);
                if (a.act === "punch" && !a.hitDone && a.t > a.dur * (a.hitAt ?? 0.42)) {
                    a.hitDone = true;
                    if (this.inReach(a, d)) this.strike(a, d, a.combo === 2 ? "hook" : a.hand ? "cross" : "jab");
                }
                if (a.act === "heavy" && !a.hitDone && a.t > a.dur * (a.hitAt ?? 0.38)) { a.hitDone = true; if (this.inReach(a, d)) this.strike(a, d, "heavy"); }
                if (a.act === "super" && a.hitsAt) { // серия из клипа: последний — супер
                    while (a.act === "super" && a.hitsAt && a.hitsDone < a.hitsAt.length && a.t > a.dur * a.hitsAt[a.hitsDone]) {
                        const last = ++a.hitsDone === a.hitsAt.length;
                        a.hand = a.hitsDone % 2;
                        this.strike(a, d, last ? "super" : "jab");
                    }
                } else if (a.act === "super" && a.t > a.dur * 0.2) { // серия из пяти ударов и апперкот
                    const n = Math.floor((a.t / a.dur - 0.2) / 0.13);
                    if (n > (a.superN ?? -1) && n <= 5) { a.superN = n; a.hand = n % 2; this.strike(a, d, n === 5 ? "super" : "jab"); }
                }
            }
            if (h.hp <= 0 || o.hp <= 0 || this.timeLeft <= 0) this.endRound();
        } else if (this.phase === "roundEnd") {
            this.endT -= dt;
            if (this.endT <= 0) {
                if (this.wins[0] >= FIGHT.winRounds || this.wins[1] >= FIGHT.winRounds || this.round >= FIGHT.rounds) this.finish();
                else this.startRound();
            }
        }
        for (const f of this.f) {
            f.t += dt;
            if (f.act !== "idle" && f.act !== "ko" && f.act !== "win" && f.t >= f.dur) {
                if (f.act === "heavyWind") { this.act(f, "heavy", FIGHT.heavyTime); this.pose(f, dt); continue; }
                if (f.act === "super") f.superN = -1;
                const q = f.queued;
                f.act = "idle"; f.t = 0;
                if (q && f === h) this.punch(f);
            }
            f.shown += (f.hp - f.shown) * Math.min(1, dt * (f.shown - f.hp > 0 ? 2.2 : 10)); // красный «след» урона
            this.pose(f, dt);
        }
        this.camera(dt);
        this.hud();
    }

    inReach(a, d) { return Math.abs(a.z - d.z) < FIGHT.gap + 0.35; }

    endRound() {
        const [h, o] = this.f;
        const heroWon = h.hp > 0 && (o.hp <= 0 || h.hp / h.hpMax >= o.hp / o.hpMax);
        this.wins[heroWon ? 0 : 1]++;
        const loser = heroWon ? o : h, winner = heroWon ? h : o, ko = loser.hp <= 0;
        if (ko) {
            loser.act = "ko"; loser.t = 0;
            const a = loser.clips.ko;
            if (a) {
                loser.base?.stop();
                for (const x of Object.values(loser.acts || {})) x.setEffectiveWeight(0);
                a.reset().setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.timeScale = 1.2; a.setEffectiveWeight(1); a.play();
            }
            this.slow = 0.25;
            this.shake = 0.4;
        } else { loser.act = "idle"; }
        winner.act = "win"; winner.t = 0;
        const last = this.wins[0] >= FIGHT.winRounds || this.wins[1] >= FIGHT.winRounds || this.round >= FIGHT.rounds;
        this.big(ko ? "K.O." : "ВРЕМЯ!", heroWon ? "gold" : "red");
        if (!last) this.say(heroWon ? this.oppCfg.lines.roundLost : this.oppCfg.lines.roundWon);
        this.phase = "roundEnd";
        this.endT = last ? 3.0 : 2.6;
        this.g.audio?.play(heroWon ? "record" : "crash");
        $("fb").classList.add("off");
    }

    finish() {
        this.phase = "end";
        const win = this.wins[0] > this.wins[1];
        this.big("");
        this.dispose();
        this.opts.onEnd(win, { rounds: this.wins.slice() });
    }

    dispose() {
        $("fight").hidden = true;
        $("fb").classList.remove("off");
        for (const u of this.unbind || []) u();
        clearTimeout(this.sayT);
        $("f-say").hidden = true;
        this.g.scene.remove(this.group);
        this.group.traverse((o) => {
            if (o.isSkinnedMesh) o.skeleton?.dispose();
            if (o.isMesh || o.isSprite) { o.material?.map?.dispose?.(); o.material?.dispose?.(); if (!o.isSkinnedMesh) o.geometry?.dispose?.(); }
        });
    }

    // ---- позы из костей ----
    pose(f, dt) {
        if (!f.model) return;
        const b = f.b, k = Math.min(1, f.t / (f.dur || 1)), fw = f.fwd, rt = f.right;
        const opp = this.f[f === this.f[0] ? 1 : 0];
        const V = (x, y, z) => new THREE.Vector3().addScaledVector(rt, x).addScaledVector(UP, y).addScaledVector(fw, z);
        let dz = 0, dip = 0, sideX = 0;
        const breathe = Math.sin(this.t * 3.4 + f.dir) * 0.5 + 0.5;
        if (f.act === "ko" || f.usedClip) { this.place(f, dz, dip, sideX, dt); return; }
        if (f.moves) { this.clipPose(f, dt); return; }
        f.model.updateMatrixWorld(true);
        const win = f.act === "win";
        // корпус: чуть вперёд, к сопернику; на отдаче — назад, в уклоне — вбок и вниз
        let lean = 0.12, side = 0, tw = 0;
        let guardW = win ? 0 : 1;
        // ноги: левая впереди, колени согнуты
        const crouch = 0.1 + (f.act === "block" ? 0.08 : 0) + (f.act === "dodge" ? 0.25 * bell(k, 0.3, 1) : 0) + breathe * 0.03;
        aim(b.LeftUpLeg, b.LeftLeg, V(-0.08, -1, 0.2 + crouch), 1);
        aim(b.LeftLeg, b.LeftFoot, V(-0.03, -1, -0.08 - crouch * 0.6), 1);
        aim(b.RightUpLeg, b.RightLeg, V(0.1, -1, -0.1 + crouch * 0.6), 1);
        aim(b.RightLeg, b.RightFoot, V(0.05, -1, -0.26 - crouch), 1);
        dip += crouch * 0.35;
        // руки по действию
        let L = { u: V(-0.28, -0.85, 0.42), f: V(0.22, 0.62, 0.78) }; // стойка: локти вниз, кулаки у подбородка, левая чуть впереди
        let R = { u: V(0.3, -0.9, 0.25), f: V(-0.28, 0.75, 0.62) };
        const tgt = new THREE.Vector3();
        if (opp.b.Head) opp.b.Head.getWorldPosition(tgt); else tgt.set(0, 1.5, opp.z);
        tgt.y -= 0.08;
        const shoulder = new THREE.Vector3();
        if (f.act === "punch") {
            const hook = f.combo === 2, w = bell(k, hook ? 0.45 : 0.4, 1), hand = f.hand ? b.RightArm : b.LeftArm;
            hand?.getWorldPosition(shoulder);
            const to = tgt.clone().sub(shoulder).normalize();
            const arm = hook ? { u: V(f.hand ? 0.85 : -0.85, 0.05, 0.55), f: to.clone().addScaledVector(rt, f.hand ? -0.45 : 0.45) } : { u: to, f: to };
            const blend = (g, p) => ({ u: g.u.clone().lerp(p.u, w), f: g.f.clone().lerp(p.f, w) });
            if (f.hand) R = blend(R, arm); else L = blend(L, arm);
            tw = (f.hand ? 1 : -1) * (hook ? 0.55 : 0.32) * w;
            dz += (hook ? 0.22 : 0.14) * w;
            lean += 0.12 * w;
        } else if (f.act === "heavyWind") { // замах: правая рука далеко назад, корпус скручен
            const w = smooth(k * 1.6);
            R = { u: R.u.clone().lerp(V(0.75, 0.15, -0.55), w), f: R.f.clone().lerp(V(0.2, 0.9, -0.2), w) };
            tw = -0.5 * w; lean -= 0.08 * w; dz -= 0.12 * w;
        } else if (f.act === "heavy") { // хук справа с выходом вперёд
            const w = bell(k, 0.4, 1);
            R = { u: R.u.clone().lerp(V(0.9, 0.1, 0.5), w), f: R.f.clone().lerp(tgt.clone().sub(f.b.RightArm?.getWorldPosition(shoulder) || shoulder).normalize().addScaledVector(rt, -0.5), w) };
            tw = 0.75 * w - 0.5 * (1 - smooth(k * 3)); dz += 0.32 * w; lean += 0.15 * w;
        } else if (f.act === "block") {
            const w = Math.min(smooth(f.t / 0.08), f.t > f.dur * 0.75 ? 1 - smooth((f.t - f.dur * 0.75) / (f.dur * 0.25)) : 1);
            L = { u: L.u.clone().lerp(V(-0.25, -0.35, 0.75), w), f: L.f.clone().lerp(V(0.35, 1, 0.1), w) };
            R = { u: R.u.clone().lerp(V(0.25, -0.35, 0.75), w), f: R.f.clone().lerp(V(-0.35, 1, 0.1), w) };
            lean += 0.18 * w;
        } else if (f.act === "dodge") {
            const w = bell(k, 0.3, 1);
            side = 0.45 * w; lean += 0.2 * w; sideX = -0.25 * w; dz -= 0.15 * w;
        } else if (f.act === "hit") {
            const w = 1 - smooth(k);
            lean -= 0.55 * w; tw = (f.hitSide || 1) * 0.4 * w; dz -= f.kb * w;
            L = { u: L.u.clone().lerp(V(-0.8, -0.3, 0.2), w * 0.6), f: L.f.clone().lerp(V(-0.4, 0.4, 0.5), w * 0.6) };
            R = { u: R.u.clone().lerp(V(0.8, -0.3, 0.2), w * 0.6), f: R.f.clone().lerp(V(0.4, 0.4, 0.5), w * 0.6) };
        } else if (f.act === "recoil") { // отбросило: корпус назад, руки разведены — открыт
            const w = 1 - smooth(k);
            lean -= 0.35 * w; dz -= 0.18 * w;
            L = { u: L.u.clone().lerp(V(-0.7, -0.5, 0.3), w), f: L.f.clone().lerp(V(-0.3, 0.3, 0.6), w) };
            R = { u: R.u.clone().lerp(V(0.7, -0.5, 0.3), w), f: R.f.clone().lerp(V(0.3, 0.3, 0.6), w) };
        } else if (f.act === "super") {
            const w = Math.min(smooth(k * 6), 1 - smooth((k - 0.85) / 0.15));
            const n = f.superN ?? 0, which = n % 2, ph = ((f.t / f.dur - 0.2) / 0.13) % 1;
            const sw = k > 0.2 ? bell(Math.max(0, ph), 0.4, 1) : 0;
            const shoulderB = which ? b.RightArm : b.LeftArm;
            shoulderB?.getWorldPosition(shoulder);
            const to = tgt.clone().sub(shoulder).normalize();
            const upper = n === 5 ? V(0, 1, 0.5) : to;
            if (which) R = { u: R.u.clone().lerp(upper, sw), f: R.f.clone().lerp(n === 5 ? V(0, 1, 0.2) : to, sw) };
            else L = { u: L.u.clone().lerp(upper, sw), f: L.f.clone().lerp(to, sw) };
            tw = (which ? 1 : -1) * 0.35 * sw; dz += 0.35 * w; lean += 0.15 * w;
        } else if (win) {
            // победа: руки вверх и подпрыгивание
            L = { u: V(-0.4, 1, 0.1), f: V(-0.1, 1, 0) };
            R = { u: V(0.4, 1, 0.1), f: V(0.1, 1, 0) };
            dip -= Math.abs(Math.sin(f.t * 7)) * 0.12;
            lean = -0.05;
        }
        // стойка «дышит»: кулаки чуть ходят
        const bob = (breathe - 0.5) * 0.06 * guardW;
        L.f.y += bob; R.f.y -= bob;
        // корпус
        const spineDir = V(side, 1, lean);
        aim(b.Spine, b.Spine1, spineDir, 0.85);
        aim(b.Spine1, b.Spine2, spineDir, 0.85);
        twist(b.Spine1, UP, tw * 0.5 * -f.dir);
        twist(b.Spine2, UP, tw * 0.5 * -f.dir);
        aim(b.Spine2, b.Neck, V(side * 0.6, 1, lean * 0.6), 0.8);
        // голова — на соперника (подбородок прижат)
        const head = new THREE.Vector3();
        b.Neck?.getWorldPosition(head);
        const look = tgt.clone().sub(head).normalize().multiplyScalar(0.6).add(UP);
        aim(b.Neck, b.Head, look, f.act === "hit" ? 0.3 : 0.7);
        // руки
        aim(b.LeftArm, b.LeftForeArm, L.u, 1);
        aim(b.LeftForeArm, b.LeftHand, L.f, 1);
        aim(b.RightArm, b.RightForeArm, R.u, 1);
        aim(b.RightForeArm, b.RightHand, R.f, 1);
        this.place(f, dz, dip, sideX, dt);
    }

    // приёмы из клипов: кусок клипа по времени действия, между приёмами — короткий переход;
    // блок, уклон, попадание и отдача — поверх стойки костями (своих клипов у них пока нет)
    clipPose(f, dt) {
        const key = this.moveOf(f) ? f.act : f.act === "win" && f.moves.win ? "win" : "idle";
        const mv = key === "idle" ? f.moves.idle : key === "win" ? f.moves.win : this.moveOf(f);
        let time;
        if (key === "idle" || key === "win") { // стойка по кругу туда-обратно — «дышит»
            const len = mv.to - mv.from, ph = (this.t * (mv.speed || 1) / len) % 2;
            time = mv.from + len * (ph < 1 ? ph : 2 - ph);
        } else time = mv.from + (mv.to - mv.from) * Math.min(1, f.t / (f.dur || 1));
        const id = key === "punch" ? `p${f.combo}${f.hand}` : key;
        if (f.segId !== id) { // переход: прошлый кусок гаснет за 0.1 с
            f.prev = f.seg ? { clip: f.seg.clip, time: f.segTime } : null;
            f.blend = 0;
            f.segId = id;
        }
        f.seg = mv; f.segTime = time;
        f.blend = Math.min(1, (f.blend ?? 1) + dt / 0.1);
        for (const [name, a] of Object.entries(f.acts)) {
            let w = 0;
            if (name === mv.clip) { w += f.blend; a.time = time; }
            if (f.prev && name === f.prev.clip) { w += 1 - f.blend; if (name !== mv.clip) a.time = f.prev.time; }
            a.setEffectiveWeight(Math.min(1, w));
        }
        f.mixer.update(0);
        // бёдра — на месте стойки: в клипах ударов тело шагает и уезжает, а ходит боец у нас сам
        const hips = f.b.Hips;
        if (hips) {
            if (!f.hip0 && key === "idle") f.hip0 = hips.position.clone();
            if (f.hip0) { hips.position.x = f.hip0.x; hips.position.z = f.hip0.z; }
        }
        f.model.updateMatrixWorld(true);
        const b = f.b, k = Math.min(1, f.t / (f.dur || 1)), fw = f.fwd, rt = f.right;
        const V = (x, y, z) => new THREE.Vector3().addScaledVector(rt, x).addScaledVector(UP, y).addScaledVector(fw, z);
        let dz = 0, dip = 0, sideX = 0;
        if (f.act === "block") {
            const w = Math.min(smooth(f.t / 0.08), f.t > f.dur * 0.75 ? 1 - smooth((f.t - f.dur * 0.75) / (f.dur * 0.25)) : 1);
            aim(b.LeftArm, b.LeftForeArm, V(-0.25, -0.35, 0.75), w);
            aim(b.LeftForeArm, b.LeftHand, V(0.35, 1, 0.1), w);
            aim(b.RightArm, b.RightForeArm, V(0.25, -0.35, 0.75), w);
            aim(b.RightForeArm, b.RightHand, V(-0.35, 1, 0.1), w);
            twist(b.Spine1, rt, 0.12 * w * f.dir);
            dip += 0.04 * w;
        } else if (f.act === "dodge") {
            const w = bell(k, 0.3, 1);
            twist(b.Spine, fw, -0.45 * w * f.dir);
            twist(b.Spine1, rt, 0.25 * w * f.dir);
            dip += 0.12 * w; sideX = -0.25 * w; dz -= 0.15 * w;
        } else if (f.act === "hit" || f.act === "recoil") {
            const w = 1 - smooth(k), back = f.act === "hit" ? 0.5 : 0.3;
            twist(b.Spine, rt, -back * 0.5 * w * f.dir);
            twist(b.Spine2, rt, -back * 0.6 * w * f.dir);
            twist(b.Neck, rt, -back * 0.8 * w * f.dir);
            if (f.act === "hit") twist(b.Spine1, UP, (f.hitSide || 1) * 0.35 * w);
            dz -= (f.act === "hit" ? f.kb : 0.18) * w;
        }
        this.place(f, dz, dip, sideX, dt);
    }

    // корень: шаг вперёд/назад, «танец» на месте, ноги на асфальте; вспышка при попадании
    place(f, dz, dip, sideX, dt) {
        const step = Math.sin(this.t * 2.2 + f.dir * 1.3) * 0.06 * (f.act === "idle" ? 1 : 0.3);
        const tz = f.home + (dz + step) * -f.dir;
        f.z += (tz - f.z) * Math.min(1, dt * 14);
        f.root.position.set(sideX * f.dir, 0, f.z);
        // ноги на асфальте: самая нижняя точка стоп — на земле (иначе при приседе ступни уходят под дорогу)
        if (f.model && f.act !== "ko") {
            f.model.updateMatrixWorld(true);
            let low = Infinity;
            const p = new THREE.Vector3();
            for (const n of ["LeftToeBase", "RightToeBase", "LeftFoot", "RightFoot"]) if (f.b[n]) low = Math.min(low, f.b[n].getWorldPosition(p).y);
            if (low < Infinity) f.root.position.y += (f.cfg.foot ?? 0.04) - low;
        }
        f.flash = Math.max(0, f.flash - dt * 6);
        for (const m of f.mats) {
            const w = 0; // замах видно по клипу и надписи — без подсветки тела
            m.emissive.setRGB(f.flash * 0.12 + w, f.flash * 0.05 + w * 0.4, f.flash * 0.04); // попадание — короткий красноватый отсвет
        }
        const warn = this.f[1].act === "heavyWind";
        if (warn !== this.warnShown) { this.warnShown = warn; $("f-warn").hidden = !warn; }
    }

    updateSparks(dt) {
        for (let i = this.sparks.length - 1; i >= 0; i--) {
            const s = this.sparks[i];
            s.t += dt;
            const k = s.t / 0.28;
            s.m.scale.setScalar(s.size * (0.3 + smooth(Math.min(1, k * 2.2)) * 0.9));
            s.m.material.opacity = 1 - smooth(k);
            if (k >= 1) { this.group.remove(s.m); s.m.material.dispose(); this.sparks.splice(i, 1); }
        }
    }

    // камера: из-за спины героя (как в забеге) съезжает вбок — по диагонали к линии боя, оба в кадре;
    // на нокауте и супере — ближе
    camera(dt) {
        const cam = this.g.camera, portrait = cam.aspect < 0.8;
        const k = smooth(this.camT / 1.4);
        const ko = this.phase === "roundEnd" && this.f.some((f) => f.act === "ko");
        const sup = this.f[0].act === "super";
        const zoom = ko ? 0.7 : sup ? 0.82 : 1;
        this.zoom = (this.zoom ?? 1) + (zoom - (this.zoom ?? 1)) * Math.min(1, dt * 3);
        const d = (portrait ? 1 : 0.8) * this.zoom;
        const pos = (this.v1 ||= new THREE.Vector3()).set(-3.1 * d, 1.35 + 0.1 * d, 0.55 + 1.35 * d);
        const from = (this.v2 ||= new THREE.Vector3()).set(0, portrait ? 3.3 : 2.5, 5.0);
        cam.position.lerpVectors(from, pos, k);
        if (ko) { // нокаут: камера выше и сбоку от упавшего — его видно из-за победителя
            const l = this.f.find((f) => f.act === "ko");
            this.koK = Math.min(1, (this.koK || 0) + dt * 1.2);
            cam.position.lerp((this.v5 ||= new THREE.Vector3()).set(-2.6, 2.3, l.z + l.dir * -0.4 + 1.2 * l.dir), smooth(this.koK));
        } else this.koK = 0;
        cam.position.x += Math.sin(this.t * 0.5) * 0.12; // камера чуть плывёт
        cam.position.y += Math.sin(this.t * 0.7) * 0.04;
        if (this.shake > 0) {
            this.shake = Math.max(0, this.shake - dt * 1.6);
            cam.position.x += (Math.random() - 0.5) * this.shake * 0.5;
            cam.position.y += (Math.random() - 0.5) * this.shake * 0.5;
        }
        const look = (this.v3 ||= new THREE.Vector3()).set(0.2, portrait ? 1.12 : 1.02, -0.12);
        if (ko) { const l = this.f.find((f) => f.act === "ko"); look.lerp(new THREE.Vector3(0, 0.4, l.z - l.dir * 0.6), smooth(this.koK)); }
        cam.lookAt(look.lerp((this.v4 ||= new THREE.Vector3()).set(0, 0.9, -8), 1 - k));
        if (cam.fov !== this.g.baseFov) { cam.fov = this.g.baseFov; cam.updateProjectionMatrix(); }
    }

    hud() {
        const [h, o] = this.f;
        $("f-hp-l").style.transform = `scaleX(${Math.max(0, h.hp / (h.hpMax || 1))})`;
        $("f-hp-r").style.transform = `scaleX(${Math.max(0, o.hp / (o.hpMax || 1))})`;
        $("f-dmg-l").style.transform = `scaleX(${Math.max(0, h.shown / (h.hpMax || 1))})`;
        $("f-dmg-r").style.transform = `scaleX(${Math.max(0, o.shown / (o.hpMax || 1))})`;
        $("f-time").textContent = Math.max(0, Math.ceil(this.timeLeft ?? FIGHT.roundTime));
        $("f-time").classList.toggle("low", (this.timeLeft ?? 99) < 10 && this.phase === "fight");
        const sv = this.superV / FIGHT.superMax;
        $("fb-super").style.setProperty("--k", sv);
        $("fb-super").classList.toggle("full", sv >= 1);
        $("f-pips-l").innerHTML = Array.from({ length: FIGHT.winRounds }, (_, i) => `<i class="${i < this.wins[0] ? "on" : ""}"></i>`).join("");
        $("f-pips-r").innerHTML = Array.from({ length: FIGHT.winRounds }, (_, i) => `<i class="${i < this.wins[1] ? "on" : ""}"></i>`).join("");
        if (this.phase === "fight") $("fb").classList.remove("off");
    }
}
