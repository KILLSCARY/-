// Бой 1 на 1 в духе Tekken — прямо на ночной улице забега (тот же дождь, неон, свечение): камера по диагонали,
// герой ближе к нам, соперник лицом к камере. Раунды по FIGHT.roundTime, до FIGHT.winRounds побед.
// Управление: кнопки УДАР / БЛОК (держать) / УКЛОН / СУПЕР, на ПК — J (удар), S/↓ (блок), A D/← → (уклон), W/↑ (супер).
// Анимации: если в glb есть клипы с именами из FIGHT_CLIPS (punch, block, hit, ko, idle_fight…) — играют они.
// Пока их нет — позы собираются из костей Mixamo: каждую кость руки, ноги и корпуса поворачиваем так, чтобы она
// смотрела в нужную сторону мира (стойка, джеб, кросс, хук, блок, уклон, отдача). Нокаут — клип «dead» модели.
import * as THREE from "./vendor/three.module.js";
import { clone as cloneSkinned } from "./vendor/jsm/SkeletonUtils.js";
import { loadModel, upgradeTextures } from "./models.js";
import { FIGHT, FIGHT_CLIPS, FIGHTERS, MASK_SCENE } from "./config.js";
import { MaskScene } from "./maskscene.js";
import { tg } from "./tg.js";
import { raiseBlock, isParry, phase2Of, inPhase2, zoneDamage } from "./fightrules.js";

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

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(); // рабочие векторы для поз (без выделений памяти в кадре)
const COMIC = ["БАХ!", "ХРЯСЬ!", "БУМ!", "БДЫЩ!", "ШМЯК!"]; // слова комикс-вспышки на сильных ударах

// время, где бёдра ниже всего (во второй половине клипа нокаута); иначе — доля FIGHT.koHold
function koLowest(clip) {
    const tr = clip.tracks.find((t) => /hips\.position$/i.test(t.name));
    let best = clip.duration * FIGHT.koHold;
    if (!tr) return best;
    let minY = Infinity;
    for (let i = 0; i < tr.times.length; i++) {
        if (tr.times[i] < clip.duration * 0.4) continue;
        const y = tr.values[i * 3 + 1];
        if (y < minY - 1e-4) { minY = y; best = tr.times[i]; }
    }
    return best;
}

export class Fight {
    // opts: { hero, opponent, bonus: { super, hp }, onEnd(win) }
    constructor(game, opts) {
        this.g = game;
        this.opts = opts;
        document.body.classList.add("in-fight"); // меню прячем на время боя, иначе просвечивает под экзаменом
        this.heroCfg = FIGHTERS[opts.hero] || FIGHTERS.mouse; // пока дерётся только Спиди
        this.oppCfg = FIGHTERS[opts.opponent];
        this.round = 0;
        this.wins = [0, 0];
        this.superV = Math.min(FIGHT.superMax, opts.bonus?.super || 0);
        this.hpBonus = opts.bonus?.hp || 0;
        this.exam = opts.exam || null; // экзамен Инакова: { list, need, lives, time, charges } — бой-тест вместо кнопок
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
        const gor = this.exam && MASK_SCENE.on; // сцена «Маска» (v6): модель Гориллы, голова костюма — отдельная сетка gorilla_head
        let left = gor ? 3 : 2;
        if (gor) loadModel(MASK_SCENE.model, (gltf) => { this.gorGltf = gltf; if (--left === 0) this.ready(); }, () => { if (--left === 0) this.ready(); });
        // экран загрузки уже показан игрой (Game.showFightLoad, сразу после заставки «БОСС»); снимает его ready()
        if ($("f-load").hidden) { $("f-load").classList.remove("out"); $("f-load").hidden = false; }
        // сеть подвисла и модель не пришла ни с успехом, ни с ошибкой — не держим экран загрузки вечно
        this.loadFailT = setTimeout(() => { if (this.phase === "load" && !this.disposed) this.loadFailed(); }, 25000);
        // clipsUrl — боевые клипы, перенесённые с другого бойца (Горилла): докладываем к модели до attach
        const withClips = (f, gltf) => !f.cfg.clipsUrl ? Promise.resolve(gltf) : fetch(f.cfg.clipsUrl).then((r) => r.json())
            // uuid клипа в JSON бывает null, а микшер кэширует действия по uuid: без своего все клипы — одно действие
            .then((list) => { for (const c of list) { const clip = THREE.AnimationClip.parse(c); if (!clip.uuid) clip.uuid = THREE.MathUtils.generateUUID(); gltf.animations.push(clip); } return gltf; }).catch(() => gltf);
        for (const f of this.f) loadModel(f.cfg.model, (gltf) => withClips(f, gltf).then((g) => { if (this.disposed) return; this.attach(f, g); upgradeTextures(f.model, f.cfg.hd, this.g.tier?.hd); if (--left === 0) this.ready(); }),
            () => { if (--left === 0) this.ready(); });
        // подсветка бойцов: тёплый слева-спереди, красный и оранжевый контровые
        const key = new THREE.PointLight(0xffd2b0, 0.45, 9); // мягко: белая шляпа Спиди не должна пересвечиваться
        key.position.set(-2.4, 2.2, 0.4);
        const rimR = new THREE.PointLight(0xff2a40, 3.2, 8);
        rimR.position.set(1.8, 2.2, -2.4);
        const rimB = new THREE.PointLight(0xff8a1f, 2.4, 8);
        rimB.position.set(-1.8, 1.8, -2.0);
        // Каждый точечный свет считается для всей улицы (и пересобирает её шейдеры), поэтому контровые — только на
        // высокой графике. На средней и слабой ключевым светом служит подсветка героя из забега (герой в бою скрыт).
        if (game.tier.lights >= 4) this.group.add(key, rimR, rimB);
        else if (game.rim) {
            this.rimWas = { pos: game.rim.position.clone(), color: game.rim.color.getHex(), i: game.rim.intensity, d: game.rim.distance };
            game.rim.position.set(-1.6, 2.0, 0.6); game.rim.color.setHex(0xffd2b0); game.rim.intensity = 1.1; game.rim.distance = 7;
        }
        // что стоит между камерой (сбоку, x ≈ −4.5) и бойцами — фонари, урны, знаки с тротуара — на время боя прячем
        const corridor = new THREE.Box3(new THREE.Vector3(-5.6, 0, -2.4), new THREE.Vector3(-0.8, 4, 2.4)), bb = new THREE.Box3();
        this.hidden = [];
        for (const o of game.scene.children) {
            if (!o.visible || o === this.group || o.isLight || o.isCamera || o === game.rat || o === game.world?.reflector) continue;
            bb.setFromObject(o);
            if (bb.isEmpty() || bb.max.x - bb.min.x > 12 || bb.max.z - bb.min.z > 12) continue; // дома и дорога — большие, их не трогаем
            if (bb.intersectsBox(corridor)) { o.visible = false; this.hidden.push(o); }
        }
        // бойцы в паре метров от камеры: дальний конец улицы не нужен — меньше домов в кадре
        this.farWas = game.camera.far; game.camera.far = 34; game.camera.updateProjectionMatrix();
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

        $("f-name-l").textContent = this.heroCfg.short || this.heroCfg.name; // в шапке боя — «Спиди»
        $("f-name-r").textContent = this.oppCfg.name;
        { const el = $("f-ph-l"); if (el) el.style.backgroundImage = this.heroCfg.portrait ? `url(${this.heroCfg.portrait})` : ""; }
        { const el = $("f-ph-r"); if (el) el.style.backgroundImage = this.oppCfg.portrait ? `url(${this.oppCfg.portrait})` : ""; }
        $("fight").hidden = false;
        $("fight").classList.toggle("exam", !!this.exam);
        $("f-exam").hidden = true;
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
        let box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3());
        // у сеток со сжатием gltfpack габариты скина бывают в других единицах (у Мизулины вышло ×100) —
        // тогда рост берём по костям: от стоп до макушки
        const bones = new THREE.Box3();
        m.traverse((o) => { if (o.isBone) bones.expandByPoint(o.getWorldPosition(new THREE.Vector3())); });
        const bh = bones.getSize(new THREE.Vector3()).y;
        if (bh > 0 && (size.y / bh > 1.6 || size.y / bh < 0.6)) { box = bones; size = bones.getSize(new THREE.Vector3()); box.min.y -= size.y * 0.02; size.y *= 1.04; }
        const k = f.cfg.height / (size.y || 1);
        m.scale.setScalar(k);
        m.position.set(0, -box.min.y * k, 0);
        m.traverse((o) => {
            if (o.isMesh) {
                o.frustumCulled = false;
                o.castShadow = true;
                o.material = o.material.clone(); // вспышка при попадании — только у этого бойца
                const cap = f.cfg.capWhite; // белая шляпа Спиди пересвечивается — гасим только почти белые пиксели текстуры
                if (cap) o.material.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace("#include <map_fragment>",
                    `#include <map_fragment>\n float wl = min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b)); diffuseColor.rgb *= mix(1.0, ${cap.toFixed(2)}, smoothstep(0.55, 0.9, wl));`); };
                if (o.material.emissive) f.mats.push(o.material);
            }
            if (o.isBone) {
                f.b[o.name.replace(/^mixamorig:?/, "")] = o;
                (f.rest ||= []).push([o, o.quaternion.clone(), o.position.clone()]);
            }
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
        // нокаут: g_ko (сборка Grok — валится навзничь на месте), иначе своё падение модели
        const ko = list.find((a) => a.name === "g_ko") || list.find((a) => a.name === "ko") || list.find((a) => a.name === "dead");
        if (ko) f.clips.ko = f.mixer.clipAction(ko);
        f.walk = list.find((a) => a.name === "walk" || a.name === "run");
        // приёмы из клипов боя (FIGHTERS[…].moves): каждый — кусок клипа [from, to], время ставим сами
        if (f.cfg.moves) {
            // на клип — два действия (второе — на копии клипа): одно действие не играет два времени сразу,
            // а джеб и кросс — куски одного клипа, и переход между ними должен смешивать оба
            f.acts = {};
            // базу гасим ДО действий приёмов: базой бывает первый клип файла (jab) — то же действие, что и стойка,
            // и остановленная после play() стойка не играла: модель стояла в позе из файла (у Ислама — кадр бега)
            if (f.base) { f.base.stop(); f.base = null; } // стойка — тоже кусок клипа (moves.idle)
            const parts = Object.values(f.cfg.moves).flatMap((m) => (m.seq ? [m, ...Object.values(m.seq)] : [m]));
            for (const m of parts) {
                if (f.acts[m.clip]) continue;
                const clip = list.find((a) => a.name === m.clip);
                if (!clip) continue;
                const twin = clip.clone();
                twin.name = `${clip.name}#2`;
                f.acts[m.clip] = [f.mixer.clipAction(clip), f.mixer.clipAction(twin)];
                for (const a of f.acts[m.clip]) { a.play(); a.timeScale = 0; a.setEffectiveWeight(0); }
            }
            f.tracked = new Set();
            for (const pair of Object.values(f.acts)) for (const t of pair[0].getClip().tracks) f.tracked.add(t.name.slice(0, t.name.lastIndexOf(".")));
            f.moves = f.cfg.moves;
        }
        f.proc = !f.clips.punch; // процедурные удары, пока нет своих клипов
        console.info(`[fight] ${f.cfg.name}: клипы`, list.map((a) => a.name), "крючки боя:", Object.keys(f.clips));
    }

    // бойцы так и не загрузились — выход в меню без поражения (сюжет и заряды на месте)
    loadFailed() {
        $("f-load").classList.remove("out");
        $("f-load").hidden = false;
        $("fl-title").textContent = "Бой не загрузился";
        $("f-load-sub").innerHTML = `Не получилось загрузить бойцов — проверь интернет.<br><button class="btn-small" id="f-load-back">В меню</button>`;
        $("f-load-back").onclick = () => { this.dispose(); this.g.abortFight(); };
    }

    // экран загрузки гаснет, только когда бой (или сцена «Маска») уже нарисован пару кадров: текстуры в видеопамяти,
    // камера на месте — никакого подвисания и рывка на глазах у игрока (rAF может стоять в фоне — страховка по таймеру)
    revealSoon() {
        let frames = 0;
        const reveal = () => {
            if (this.disposed || this.revealed) return;
            this.revealed = true;
            const el = $("f-load");
            el.classList.add("out");
            setTimeout(() => { if (el.classList.contains("out")) { el.hidden = true; el.classList.remove("out"); } }, 420);
        };
        const tick = () => { if (++frames >= 3) reveal(); else requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
        setTimeout(reveal, 700);
    }

    // модели на месте: шейдеры новых материалов собираем сразу, под экраном загрузки (иначе первый кадр боя «встаёт»)
    ready() {
        if (this.phase !== "load") return;
        clearTimeout(this.loadFailT);
        const go = () => {
            if (this.disposed) return; // бой уже закрыли
            try { this.g.renderer.compile(this.g.scene, this.g.camera); } catch {}
            this.phase = "intro";
            if (this.exam && MASK_SCENE.on && this.f[1].model) { // сцена «Маска» — до баннера «ЭКЗАМЕН»
                this.phase = "cut"; this.masked = true;
                $("fb").classList.add("off");
                this.cut = new MaskScene(this, "pre", () => { this.cut = null; $("fb").classList.remove("off"); this.phase = "intro"; this.startRound(); });
                this.revealSoon();
                return;
            }
            this.startRound();
            this.revealSoon();
        };
        $("f-load-sub").textContent = "Почти готово…";
        setTimeout(go, 60); // дать экрану загрузки отрисовать «Почти готово» до тяжёлой сборки шейдеров
    }

    startRound() {
        this.round++;
        if (this.round > 1) this.superV = 0; // супер не переносится в следующий раунд
        const rh = this.oppCfg.hpRounds;
        if (rh) this.f[1].hpMax = rh[Math.min(this.round, rh.length) - 1];
        for (const f of this.f) {
            f.hp = f.hpMax; f.shown = f.hpMax; f.act = "idle"; f.t = 0; f.cd = 0; f.combo = 0; f.kb = 0; f.z = f.home;
            if (f.clips.ko) f.clips.ko.stop();
            // у бойцов с приёмами из клипов (moves) «victory» — то же действие, что moves.win: после stop() миксер его
            // больше не применял, и со 2-го раунда победитель стоял в последней позе. Такое действие ведёт clipPose
            if (f.clips.win && !f.acts?.[f.clips.win.getClip().name]) f.clips.win.stop();
            f.base?.reset().play();
            if (f.base && f.base !== f.clips.idle) { f.base.timeScale = 0; f.base.time = 0; }
            f.cur = null; f.prev = null; f.segId = null; f.koYaw = undefined; f.koLift = undefined;
        }
        this.timeLeft = this.exam ? Infinity : FIGHT.roundTime;
        // ИИ: раунд за раундом злее (FIGHTERS[…].ai)
        const ai = this.oppCfg.ai, r = Math.min(this.round, 3) - 1;
        this.ai = { next: 1.0, guard: 0, streak: 0, block: ai.block[r], every: ai.every[r], heavy: ai.heavy[r], combo: ai.combo[r], third: ai.third[r], p2: phase2Of(this.oppCfg), rage2: false };
        this.phase = "intro";
        this.introT = 0;
        const L = this.oppCfg.lines;
        if (this.exam && this.masked) { /* реплики уже прозвучали в сцене «Маска» */ }
        else if (this.exam) { // Горилла молчит — говорит Павел
            this.say(L.examIntro?.[0] || L.intro);
            if (L.examIntro?.[1]) setTimeout(() => this.phase !== "end" && this.say(L.examIntro[1]), 2700);
        } else this.say(this.round === 1 ? L.intro : this.round === 2 ? L.round2 || null : this.round === 3 ? L.final : null);
        // начало первого раунда: сколько HP дали ответы на табличках
        if (this.round === 1 && this.hpBonus > 0) setTimeout(() => this.phase !== "end" && this.g.gorilla?.(`+${this.hpBonus} HP от ответов на табличках`, true, 2600), 600);
        // подсказка про тап по зонам — в первых боях игрока
        const pd = this.g.profile?.data;
        if (this.round === 1 && !this.exam && pd && (pd.tapHints || 0) < 3) { pd.tapHints = (pd.tapHints || 0) + 1; setTimeout(() => this.phase !== "end" && this.g.gorilla?.("Тапай по боссу: в голову — сильнее, по ногам — ногой. Блок в момент удара — парирование", false, 3200), this.hpBonus > 0 ? 3600 : 900); }
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

    // who — кто говорит (по умолчанию соперник), ms — сколько держать реплику
    say(text, who, ms) {
        const el = $("f-say");
        clearTimeout(this.sayT);
        if (!text) { el.hidden = true; return; }
        el.innerHTML = `<b>${who || this.oppCfg.short || this.oppCfg.name}</b>${text}`;
        el.classList.toggle("hero", who === "Спиди");
        el.hidden = false;
        el.classList.remove("in"); void el.offsetWidth; el.classList.add("in");
        this.sayT = setTimeout(() => (el.hidden = true), ms || 2600);
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
            if (Math.hypot(dx, dy) < 28) return this.input(this.tapZone(e.clientX, e.clientY)); // тап по сопернику: голова/корпус — рукой, ноги — ногой
            if (Math.abs(dy) > Math.abs(dx)) this.input(dy > 0 ? "block" : "super");
            else this.input("dodge");
        });
        const keys = { j: "punch", " ": "punch", l: "low", k: "super", w: "super", ArrowUp: "super", a: "dodge", d: "dodge", ArrowLeft: "dodge", ArrowRight: "dodge" };
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

    input(cmd, again = false) {
        if (this.phase !== "fight") return;
        // тап в голову — тот же удар рукой, но сильнее (FIGHT.zones); кнопка и тап по корпусу — в корпус
        if (cmd === "head") { this.aim = "head"; cmd = "punch"; } else if (cmd === "punch" && !again) this.aim = null;
        const h = this.f[0];
        const free = h.act === "idle" || (h.act === "block" && cmd !== "block");
        // буфер нажатий (как input buffer во Fray): удар/уклон, нажатый чуть раньше, чем боец освободился,
        // не теряется — сработает, как только станет можно (окно FIGHT.buffer с)
        if (!again && (cmd === "punch" || cmd === "dodge" || cmd === "low") && !(cmd === "punch" && h.act === "punch" && h.t > h.dur * 0.55) && (!free || h.cd > 0))
            this.buf = { cmd, t: this.t };
        if (cmd === "punch") {
            // связка: следующий удар можно нажать в конце текущего — джеб, кросс, третий — с доворотом (сильнее)
            if (h.act === "punch" && h.t > h.dur * 0.55) { h.queued = true; return; }
            if (!free || h.cd > 0) return;
            this.punch(h);
        } else if (cmd === "low") { // удар ногой (тап по ногам соперника)
            if (!free || h.cd > 0) return;
            if (!h.moves?.low) return this.input("punch", again);
            this.act(h, "low", 0.7);
            h.cd = FIGHT.punchCd;
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
            this.cine(true);
            this.big("СУПЕР!", "gold");
            clearTimeout(this.bigT);
            this.bigT = setTimeout(() => { if (this.phase === "fight") this.big(""); }, 900);
            this.slow = 0.55;
            this.g.audio?.play("boost");
            this.g.kick?.(0.1, 6);
        }
    }

    // куда тапнули по сопернику: голова — удар рукой сильнее, корпус — рукой, ниже бёдер — ногой; мимо соперника — обычный удар рукой
    tapZone(x, y) {
        const o = this.f?.[1], cam = this.g.camera;
        if (!o?.b?.Hips) return "punch";
        const rect = this.g.renderer.domElement.getBoundingClientRect();
        const scr = (bone) => { const p = bone.getWorldPosition(_v1).project(cam); return { x: rect.left + (p.x * 0.5 + 0.5) * rect.width, y: rect.top + (-p.y * 0.5 + 0.5) * rect.height }; };
        const hips = scr(o.b.Hips), head = scr(o.b.Head || o.b.Hips), foot = scr(o.b.LeftFoot || o.b.Hips);
        const halfW = Math.max(60, Math.abs(foot.y - head.y) * 0.35);
        if (Math.abs(x - hips.x) > halfW * 1.6 || y < head.y - halfW * 0.8 || y > foot.y + 40) return "punch";
        const zone = y > hips.y + (foot.y - hips.y) * 0.15 ? "low" : y < head.y + (hips.y - head.y) * 0.3 ? "head" : "punch";
        this.tapMark(x, y, zone);
        return zone;
    }

    // метка тапа: кружок там, куда целился (рука — красный, нога — жёлтый)
    tapMark(x, y, zone) {
        const el = document.createElement("i");
        el.className = `f-tap ${zone}`;
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        $("fight").appendChild(el);
        setTimeout(() => el.remove(), 400);
    }

    punch(f) {
        f.aim = f === this.f[0] ? this.aim : null; // куда целился герой (тап в голову)
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
        if ((act === "heavyWind" || act === "heavy") && f.heavyVar) return f.moves[act + f.heavyVar] || f.moves[act] || null;
        return f.moves[act] || null;
    }

    act(f, act, time) {
        const L = this.oppCfg?.lines;
        // реплики соперника под приём (v2.7 §13.3), не чаще раза в 3 с
        const ml = L?.moveLines, key = act === "punch" ? (f.combo === 2 ? "hook" : "punch") : act;
        if (ml?.[key] && f === this.f?.[1] && act !== "block" && this.t - (this.mlT ?? -9) > 3 && (key === "win" || Math.random() < 0.6)) { this.mlT = this.t; this.say(pick(ml[key])); }
        if (L?.blockIn && f === this.f?.[1]) { // реплики блока Мизулиной
            const now = performance.now();
            if (act === "block" && f.act !== "block") {
                if (!this.blockSaidAt || now - this.blockSaidAt > 6000) { this.say(L.blockIn); this.blockHoldI = 0; }
                else this.say(L.blockHold[(this.blockHoldI = ((this.blockHoldI ?? -1) + 1)) % L.blockHold.length]);
                this.blockSaidAt = now;
            }
        }
        if (act === "block" && f.act !== "block" && f === this.f?.[0]) raiseBlock(f, this.t);
        f.act = act; f.actId = (f.actId || 0) + 1; f.t = 0; f.dur = time; f.hitDone = false; f.queued = false; f.hitsDone = 0;
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
        const unstoppable = kind === "super" || att.act === "super" || att.act === "superFin"; // серию супера не заблокировать и не уклониться
        let dmg = Math.round(c[kind] * (counter ? FIGHT.counter : 1));
        if (att.examPool != null) { // экзамен: урон за ответ задан заранее; серия супера делит его, добивание забирает остаток
            const fin = kind === "super" || kind === "heavy" || att.act === "punch";
            dmg = fin ? att.examPool : Math.min(att.examPool, Math.round(att.examPool0 * 0.08));
            att.examPool -= dmg;
            if (fin) att.examPool = null;
        }
        const head = !this.exam && att.aim === "head" && (kind === "jab" || kind === "cross" || kind === "hook");
        if (head) dmg = zoneDamage(dmg, "head");
        const st = (this.stats ||= {}), key = `${att === this.f[0] ? "h" : "o"}_${kind}`;
        const contact = this.fistPos(att, kind === "heavy" ? 1 : att.hand);
        // уклон: мимо; от хука с замахом — бьющий проваливается и открыт для контратаки
        if (def.act === "dodge" && def.t < def.dur * 0.85 && !unstoppable) {
            this.popText(def, "МИМО", "miss");
            if (kind === "heavy") { this.act(att, "recoil", FIGHT.whiffTime); this.popText(att, "КОНТРАТАКА!", "crit"); }
            return 0;
        }
        // парирование: блок героя поднят точно перед ударом — урона нет, бьющий надолго открыт (бей — будет контр ×1.5)
        if (def === this.f[0] && !this.exam && isParry(def, this.t, unstoppable)) {
            def.parryAt = null; // одно парирование на подъём блока
            this.popText(def, "ПАРИРОВАЛ!", "crit");
            this.spark(contact, 1.1, 0xffd65a);
            this.act(att, "recoil", FIGHT.parry.stun * (kind === "heavy" ? 1.3 : 1));
            this.superV = Math.min(FIGHT.superMax, this.superV + FIGHT.parry.super);
            this.stop = 0.12; this.slow = 0.45; this.shake = 0.1;
            this.g.audio?.play("boost");
            tg.haptic("medium");
            st.parry = (st.parry || 0) + 1;
            if (!this.parryTold) { this.parryTold = true; this.g.gorilla?.("Блок в последний момент — парирование. Теперь бей!", false, 2400); }
            return 0;
        }
        // блок: урон почти весь гасится, бьющего отбрасывает — у защитника окно для ответа
        if (def.act === "block" && !unstoppable) {
            const d = Math.max(1, Math.round(dmg * (1 - FIGHT.blockCut)));
            def.hp = Math.max(0, def.hp - d);
            def.kb = 0.12;
            def.t = Math.min(def.t, def.dur * 0.5);
            this.popText(def, "БЛОК", "block");
            this.spark(contact, 0.45, 0xe8ecef);
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
        const armor = def.act === "super" || def.act === "superFin" || (kind === "jab" || kind === "cross") && (def.act === "heavyWind" || def.act === "heavy" || (def.act === "punch" && def.t > def.dur * 0.2));
        if (armor) { def.flash = 0.6; this.popText(def, `−${dmg}`, ""); this.spark(contact, 0.5, 0xffffff); this.g.audio?.play("hit"); return dmg; }
        this.act(def, "hit", FIGHT.stun[kind]);
        def.kb = kind === "jab" ? 0.1 : kind === "cross" ? 0.16 : kind === "super" ? 0.6 : 0.32;
        def.flash = 1;
        def.hitSide = att.hand ? 1 : -1;
        this.spark(contact, kind === "jab" ? 0.6 : kind === "super" ? 1.4 : 0.9, kind === "super" ? 0xffd65a : 0xffffff);
        this.popText(def, counter ? `КОНТР −${dmg}` : head ? `В ГОЛОВУ −${dmg}` : `−${dmg}`, counter || head || kind === "heavy" || kind === "super" || kind === "hook" ? "crit" : "");
        if (kind === "heavy" || kind === "hook" || kind === "super" || counter) { // комикс-вспышка и волна по асфальту — сильный удар видно сразу
            this.comic(contact, kind === "super" ? "super" : kind === "heavy" ? "heavy" : "");
            this.shockwave(def, kind === "super" ? 1.6 : 1);
        }
        this.stop = kind === "jab" ? 0.07 : kind === "super" ? 0.32 : 0.12; // стоп-кадр — удар «чувствуется»
        this.punchIn = kind === "jab" ? 0.03 : kind === "super" ? 0.12 : 0.06; // камера на миг «вздрагивает» к удару
        if (kind === "super") { this.slow = 0.2; this.flashScreen(); }
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

    // «БАХ!» звёздочкой у точки удара (как в комиксе), слово — случайное
    comic(pos, cls) {
        const p = pos.clone().project(this.g.camera);
        const el = document.createElement("b");
        el.className = `f-comic ${cls}`;
        el.textContent = COMIC[Math.floor(Math.random() * COMIC.length)];
        el.style.left = `${(p.x * 0.5 + 0.5) * 100}%`;
        el.style.top = `${(-p.y * 0.5 + 0.5) * 100}%`;
        el.style.setProperty("--r", `${(Math.random() - 0.5) * 24}deg`);
        $("fight").appendChild(el);
        setTimeout(() => el.remove(), 650);
    }

    // волна по асфальту из-под ног получившего удар
    shockwave(f, size) {
        if (!this.ringGeo) this.ringGeo = new THREE.RingGeometry(0.7, 1, 40);
        const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
        m.rotation.x = -Math.PI / 2;
        m.position.set(f.root.position.x, 0.04, f.root.position.z);
        this.group.add(m);
        this.sparks.push({ m, t: 0, size, ring: true });
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
        if (this.spamT) this.spamT = Math.max(0, this.spamT - dt);
        ai.guard -= dt;
        // реакция на удар героя: ставит блок с вероятностью ai.block (чем дольше герой долбит, тем охотнее)
        if (h.act === "punch" && h.seen !== h.actId) { // каждый удар серии — отдельно (в связке act не возвращается в idle)
            h.seen = h.actId;
            // кто долбит без пауз — нарывается на блок: шанс растёт с каждым ударом подряд
            ai.spam = this.t - (ai.lastHeroPunch ?? -9) < 0.95 ? (ai.spam || 0) + 1 : 0;
            ai.lastHeroPunch = this.t;
            // 4 удара подряд без паузы — контратака и подсказка
            if (ai.spam >= 3 && (o.act === "idle" || o.act === "block" || o.act === "hit") && !this.spamT) {
                this.spamT = 6; ai.spam = 0; o.act = "idle";
                this.act(o, "block", 0.2);
                if (o.moves?.knee) setTimeout(() => this.phase === "fight" && o.act !== "ko" && this.act(o, "knee", 0.6), 200); else this.queueAi([["punch", 0.2], ["punch", 0.05]]);
                if (c.lines.spam) this.say(c.lines.spam);
                if (!this.spamTold) { this.spamTold = true; this.g.gorilla?.("Не спамь. Жди окно.", false, 2600); }
                return;
            }
            const p = Math.min(0.9, ai.block + ai.spam * 0.18);
            if ((o.act === "idle" || o.act === "block" || o.act === "hit") && Math.random() < p) { this.act(o, "block", 0.55); ai.next = Math.min(ai.next, 0.35); }
        }
        // наказание: герой ударил в блок и отлетел — сразу двойка
        if (h.act === "recoil" && !h.punished && (o.act === "idle" || o.act === "block")) {
            h.punished = true;
            o.act = "idle";
            if (o.moves?.knee && Math.random() < 0.5) this.act(o, "knee", 0.6); // вплотную — коленом
            else this.queueAi([["punch", 0.04], ["punch", 0.05]]);
        }
        if (h.act !== "recoil") h.punished = false;
        // пропустил три подряд — закрывается и отвечает
        if (this.t - (o.lastHit || 0) > 1.1) o.streak = 0;
        // 4 удара подряд — окно контратаки: выходит из оглушения, закрывается и сразу отвечает (серия без пауз не проходит)
        if (o.streak >= 4 && (o.act === "idle" || o.act === "hit")) {
            o.streak = 0;
            this.act(o, "block", 0.4);
            this.popText(o, "КОНТРАТАКА", "crit"); (this.stats ||= {}).counterWin = (this.stats.counterWin || 0) + 1;
            this.queueAi(Math.random() < 0.5 ? [["punch", 0.05], ["punch", 0.05]] : [["punch", 0.05]]);
            ai.spam = Math.max(ai.spam || 0, 3);
            ai.next = 0.7;
        }
        // вторая фаза: ниже половины здоровья — ярость (раз за раунд), дальше бьёт чаще и тяжелее
        if (!ai.rage2 && inPhase2(o.hp, o.hpMax, ai.p2) && o.act !== "ko") {
            ai.rage2 = true;
            this.big("ЯРОСТЬ", "red");
            clearTimeout(this.bigT);
            this.bigT = setTimeout(() => { if (this.phase === "fight") this.big(""); }, 900);
            if (c.lines.rage) this.say(c.lines.rage);
            this.shake = 0.2;
            this.g.audio?.play("crash");
            (this.stats ||= {}).rage = this.round;
        }
        const p2 = ai.rage2 ? ai.p2 : null;
        if (o.act !== "idle" || ai.next > 0 || ai.queue?.length) return this.runQueue(dt);
        const rage = (1 + (1 - o.hp / o.hpMax) * 0.35) * (p2 ? p2.speed : 1);
        const r = Math.random();
        if (r < ai.heavy + (p2 ? p2.heavy : 0)) {
            o.heavyVar = this.round >= 3 && o.moves?.heavy2 && Math.random() < 0.5 ? 2 : 0; // второй тяжёлый (moves.heavy2), если задан
            this.act(o, "heavyWind", c.telegraph[Math.min(this.round, 3) - 1] * (p2 ? p2.tele : 1));
            if (Math.random() < 0.5) this.say(pick(c.lines.heavy));
        } else if (r < ai.heavy + (p2 ? p2.heavy : 0) + ai.combo) this.queueAi([["punch", 0], ["punch", 0.05], ...(Math.random() < ai.third ? [["punch", 0.05]] : [])]);
        else if (r < ai.heavy + (p2 ? p2.heavy : 0) + ai.combo + 0.18) { this.act(o, "block", 0.6 + Math.random() * 0.5); }
        else this.queueAi([["punch", 0]]);
        ai.next = (ai.every[0] + Math.random() * (ai.every[1] - ai.every[0])) / rage;
    }

    queueAi(list) { this.ai.queue = list.map(([a, d]) => ({ a, d })); this.runQueue(0); }

    runQueue(dt = 0) {
        const o = this.f[1], q = this.ai.queue;
        if (!q?.length) return;
        if (o.act !== "idle" && !(o.act === "punch" && o.t > o.dur * 0.8)) return;
        const n = q[0];
        n.d -= Math.max(0, dt);
        if (n.d > 0) return;
        q.shift();
        this.punch(o);
    }

    update(dt) {
        if (this.phase === "end" && !this.left) { this.t += dt; for (const f of this.f) { f.mixer?.update(dt); this.pose(f, dt); } this.camera(dt); return; }
        if (this.phase === "end") return;
        if (this.bot) this.bot(dt);
        // стоп-кадр и замедление
        if (this.stop > 0) { this.stop -= dt; dt *= 0.05; }
        this.slow += (1 - this.slow) * Math.min(1, dt * 1.5);
        dt *= this.slow;
        this.t += dt;
        this.camT += dt;
        for (const f of this.f) {
            f.mixer?.update(dt);
            // нокаут: в последних кадрах клипа падения боец снова стоит — замираем, пока лежит
            const ko = f.act === "ko" && f.clips.ko;
            if (ko && f.koStop == null) f.koStop = f.cfg.koHold != null ? ko.getClip().duration * f.cfg.koHold : koLowest(ko.getClip()); // лежит в самой низкой точке бёдер
            if (ko && ko.time > f.koStop) { ko.time = f.koStop; ko.paused = true; f.mixer.update(0); }
            if (ko) { // и в нокауте: падает на месте, а не уезжает вместе с клипом; разворот — один раз по первому кадру,
                this.pinHips(f); // иначе в кувырке линия бёдер крутится и корпус бы вертело
                if (f.koYaw === undefined) { this.faceOpponent(f, false); f.koYaw = f.model.rotation.y; }
                f.model.rotation.y = f.koYaw;
                // в клипе нет движения бёдер — тело опускаем так, чтобы самая нижняя кость легла на асфальт
                f.root.position.y = 0;
                f.root.updateMatrixWorld(true);
                let low = Infinity;
                const p = new THREE.Vector3();
                for (const [bone] of f.rest) low = Math.min(low, bone.getWorldPosition(p).y);
                f.koLift = (f.koLift ?? 0) + ((0.06 - low) - (f.koLift ?? 0)) * Math.min(1, dt * 12);
                f.root.position.y = f.koLift;
            }
        }
        this.updateSparks(dt);
        if (this.phase === "load") { this.camera(dt); return; }
        if (this.phase === "cut" || this.phase === "outro") { // сцена «Маска»: бойцы стоят, идёт сцена
            this.cut?.update(dt);
            for (const f of this.f) { f.t += dt; f.mixer?.update(dt); this.pose(f, dt); }
            this.camera(dt);
            return;
        }
        const [h, o] = this.f;
        if (this.phase === "intro") {
            this.introT += dt;
            if (this.introT > 0.25 && this.bigShown === 0) { this.bigShown = 1; this.big(this.exam ? "ЭКЗАМЕН" : this.round === 3 ? "ФИНАЛЬНЫЙ РАУНД" : `РАУНД ${this.round}`, this.round === 3 || this.exam ? "red" : ""); this.g.audio?.play("count"); }
            if (this.introT > 1.5 && this.bigShown === 1) { this.bigShown = 2; this.big("БОЙ!", "red"); this.g.audio?.play("go"); }
            if (this.introT > 2.1) { this.phase = "fight"; this.big(""); if (this.exam) { this.exam.wait = this.round === 1 ? 2.6 : 0.4; } }
        } else if (this.phase === "fight") {
            this.timeLeft -= dt;
            if (this.exam) this.examStep(dt); else this.think(dt);
            if (this.holdBlock && h.act === "idle") this.act(h, "block", FIGHT.blockTime);
            if (h.act === "block" && this.holdBlock) h.t = Math.min(h.t, h.dur * 0.5); // держит, пока палец на кнопке
            for (const [a, d] of [[h, o], [o, h]]) {
                a.cd = Math.max(0, a.cd - dt);
                if (a.act === "punch" && !a.hitDone && a.t > a.dur * (a.hitAt ?? 0.42)) {
                    a.hitDone = true;
                    if (this.inReach(a, d)) this.strike(a, d, a.combo === 2 ? "hook" : a.hand ? "cross" : "jab");
                }
                if (a.act === "heavy" && !a.hitDone && a.t > a.dur * (a.hitAt ?? 0.38)) { a.hitDone = true; if (this.inReach(a, d)) this.strike(a, d, "heavy"); }
                if (a.act === "knee" && !a.hitDone && a.t > a.dur * (a.hitAt ?? 0.4)) { a.hitDone = true; if (this.inReach(a, d)) this.strike(a, d, "hook"); }
                if (a.act === "low" && !a.hitDone && a.t > a.dur * (a.hitAt ?? 0.6)) { a.hitDone = true; if (this.inReach(a, d)) this.strike(a, d, "low"); }
                if (a.act === "superFin" && !a.hitDone && a.t > a.dur * (a.hitAt ?? 0.5)) { a.hitDone = true; this.strike(a, d, "super"); }
                if (a.act === "super" && a.hitsAt) { // серия из клипа: последний — супер
                    while (a.act === "super" && a.hitsAt && a.hitsDone < a.hitsAt.length && a.t > a.dur * a.hitsAt[a.hitsDone]) {
                        const last = ++a.hitsDone === a.hitsAt.length && !a.moves?.superFin; // с добиванием серия — лёгкие, супер — в нём
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
            // «K.O.» и реплика — когда падение уже началось
            if (this.koBig && (this.koBig.t -= dt) <= 0) { const k = this.koBig; this.koBig = null; this.big("K.O.", k.cls); this.shake = 0.25; if (k.line) this.say(k.line); }
            if (this.endT <= 0) {
                if (this.exam && this.masked && this.f[1].hp <= 0 && this.mask && !this.outroCut) { // сдал: Павел протягивает маску
                    this.outroCut = true; this.phase = "outro"; this.big(""); this.say(null); // сразу: иначе пока идёт затемнение, roundEnd вызывает finish() поверх сцены
                    this.cut = new MaskScene(this, "post", () => { this.cut = null; this.finish(); });
                } else if (this.exam || this.wins[0] >= FIGHT.winRounds || this.wins[1] >= FIGHT.winRounds || this.round >= FIGHT.rounds) this.finish();
                else this.startRound();
            }
        }
        for (const f of this.f) {
            f.t += dt;
            if (f.act !== "idle" && f.act !== "ko" && f.act !== "win" && f.t >= f.dur) {
                if (f.act === "heavyWind") { this.act(f, "heavy", FIGHT.heavyTime); this.pose(f, dt); continue; }
                if (f.act === "super") { f.superN = -1; if (f.moves?.superFin) { this.act(f, "superFin", 0.8); if (f === h) this.slow = 0.35; this.pose(f, dt); continue; } }
                const q = f.queued;
                f.act = "idle"; f.t = 0;
                if (q && f === h) this.punch(f);
            }
            f.shown += (f.hp - f.shown) * Math.min(1, dt * (f.shown - f.hp > 0 ? 2.2 : 10)); // красный «след» урона
            this.pose(f, dt);
        }
        if (this.buf) { // отложенное нажатие: боец освободился — выполняем, устарело — забываем
            const b = this.buf;
            if (this.t - b.t > FIGHT.buffer) this.buf = null;
            else if ((h.act === "idle" || h.act === "block") && h.cd <= 0) { this.buf = null; this.input(b.cmd, true); }
        }
        if (this.cineOn && h.act !== "super" && h.act !== "superFin") this.cine(false);
        this.camera(dt);
        this.hud();
    }

    // супер — как в кино: чёрные полосы сверху и снизу, камера ближе
    cine(on) { this.cineOn = on; $("fight").classList.toggle("cine", on); }

    flashScreen() { const el = $("f-flash"); el.classList.remove("on"); void el.offsetWidth; el.classList.add("on"); }

    // попадание — только если бьющая рука/нога реально дошла до корпуса или головы соперника
    inReach(a, d) {
        if (!a.b?.Hips || !d.b?.Hips) return Math.abs(a.z - d.z) < FIGHT.gap + 0.1;
        const P = (b) => b ? b.getWorldPosition(new THREE.Vector3()) : null;
        const limbs = [a.b.LeftHand, a.b.RightHand, a.b.LeftFoot, a.b.RightFoot, a.b.LeftToeBase, a.b.RightToeBase].map(P).filter(Boolean);
        const tgt = [d.b.Head, d.b.Neck, d.b.Spine2, d.b.Spine1, d.b.Spine, d.b.Hips].map(P).filter(Boolean);
        let best = Infinity;
        for (const l of limbs) for (const t of tgt) best = Math.min(best, Math.hypot(l.x - t.x, l.z - t.z) + Math.max(0, Math.abs(l.y - t.y) - 0.35));
        (this.reach ||= []).push(best); ((this.reachBy ||= {})[a === this.f[0] ? "h" : "o"] ||= []).push(+best.toFixed(2));
        return best < FIGHT.contact;
    }

    endRound() {
        const [h, o] = this.f;
        const heroWon = h.hp > 0 && (o.hp <= 0 || h.hp / h.hpMax >= o.hp / o.hpMax);
        this.wins[heroWon ? 0 : 1]++;
        const loser = heroWon ? o : h, winner = heroWon ? h : o, ko = loser.hp <= 0;
        if (ko) {
            loser.act = "ko"; loser.t = 0;
            const a = loser.clips.ko;
            if (a) {
                const from = loser.cfg.koFrom; // клип падения с середины (koFrom, с): поза перетекает в лежачую за koFade с
                loser.base?.stop();
                for (const pair of Object.values(loser.acts || {})) for (const x of pair) { if (from != null && x.getEffectiveWeight() > 0) x.fadeOut(loser.cfg.koFade ?? 0.45); else x.setEffectiveWeight(0); }
                a.reset().setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.timeScale = 1.2; a.paused = false; a.setEffectiveWeight(1); a.play();
                if (from != null) { a.time = from; a.fadeIn(loser.cfg.koFade ?? 0.45); }
            }
            this.slow = 0.25;
            this.shake = 0.4;
        } else { loser.act = "idle"; }
        winner.act = "win"; winner.t = 0;
        const last = !!this.exam || this.wins[0] >= FIGHT.winRounds || this.wins[1] >= FIGHT.winRounds || this.round >= FIGHT.rounds;
        const L = this.oppCfg.lines;
        if (ko) { this.big(""); this.koBig = { t: 1.0, cls: heroWon ? "gold" : "red", line: heroWon && last ? (this.exam ? L.examKo : L.ko) : null }; }
        else this.big("ВРЕМЯ!", heroWon ? "gold" : "red");
        if (!last) this.say(heroWon ? L.roundLost : L.roundWon);
        if (this.exam) { $("f-exam").hidden = true; this.exam.q = null; }
        this.phase = "roundEnd";
        this.endT = (last ? (this.exam && heroWon ? 4.2 : 3.2) : 2.6) + (ko ? 0.8 : 0);
        this.g.audio?.play(heroWon ? "record" : "crash");
        $("fb").classList.add("off");
    }

    finish() {
        this.phase = "end";
        const win = this.wins[0] > this.wins[1];
        this.big("");
        if (!this.outro) { // экран итога боя: поражение / победа, затем выход
            this.outro = true;
            const el = document.createElement("div");
            el.className = `f-result ${win ? "win" : "lose"}`;
            el.innerHTML = `<b>${win ? "ПОБЕДА" : "ПОРАЖЕНИЕ"}</b><span>${this.wins[0]} : ${this.wins[1]}</span><p></p><button class="btn btn-main">Дальше</button>`;
            el.querySelector("p").textContent = win ? "Права P2P отстояны." : `«${this.oppCfg.lines.lose}»`;
            $("fight").appendChild(el);
            this.g.audio?.play(win ? "record" : "crash");
            const go = () => { if (this.left) return; this.left = true; el.remove(); this.finish(); };
            el.querySelector("button").onclick = go;
            this.outroT = setTimeout(go, this.fast ? 10 : 4500);
            return;
        }
        clearTimeout(this.outroT);
        this.dispose();
        this.opts.onEnd(win, { rounds: this.wins.slice() });
    }

    dispose() {
        this.disposed = true;
        document.body.classList.remove("in-fight");
        clearTimeout(this.loadFailT);
        $("f-load-sub").textContent = "Бойцы выходят на ринг";
        $("fl-title").textContent = "Готовим бой…";
        $("f-load").hidden = true;
        $("f-load").classList.remove("out");
        $("fight").hidden = true;
        $("fight").classList.remove("exam", "cine");
        for (const o of this.hidden || []) o.visible = true;
        $("f-exam").hidden = true;
        $("f-skip").hidden = true; $("f-flash").classList.remove("on", "dark");
        this.g.camera.fov = this.g.baseFov;
        if (this.farWas) this.g.camera.far = this.farWas;
        this.g.camera.updateProjectionMatrix();
        if (this.rimWas) { const r = this.g.rim; r.position.copy(this.rimWas.pos); r.color.setHex(this.rimWas.color); r.intensity = this.rimWas.i; r.distance = this.rimWas.d; }
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
        let mv = key === "idle" ? f.moves.idle : key === "win" ? f.moves.win : this.moveOf(f);
        let seg = "";
        if (mv.seq) { // блок из трёх клипов: заход → удержание по кругу → выход (заход и выход ужимаем под короткий блок)
            const q = mv.seq, d = f.dur || 1, tIn = Math.min(q.in.time, d * 0.35), tOut = Math.min(q.out.time, d * 0.35);
            const part = f.t < tIn ? "in" : f.t > d - tOut ? "out" : "loop";
            const p = q[part], k = part === "in" ? f.t / tIn : part === "out" ? (f.t - (d - tOut)) / tOut : 0;
            mv = { ...p, fit: true, hold: false };
            seg = part;
            var seqTime = part === "loop" ? p.from + ((f.t - tIn) % (p.to - p.from)) : p.from + (p.to - p.from) * Math.min(1, Math.max(0, k));
        }
        let time;
        if ((key === "idle" || key === "win") && mv.loop) time = mv.from + ((this.t * (mv.speed || 1)) % (mv.to - mv.from)); // стойка по кругу
        else if (key === "idle" || key === "win") { // стойка: короткий спокойный кусок туда-обратно по синусу — без рывка на развороте
            const len = mv.to - mv.from, ph = (this.t * (mv.speed || 1) * Math.PI) / (mv.period || len * 2 || 1);
            time = len > 0 ? mv.from + len * (0.5 - 0.5 * Math.cos(ph)) : mv.from;
        } else if (mv.hold) time = Math.min(mv.to, mv.from + f.t * (mv.speed || 1)); // замах в своём темпе, дальше держит
        else time = mv.from + (mv.to - mv.from) * Math.min(1, f.t / (f.dur || 1));
        if (seg) time = seqTime;
        const id = key === "punch" ? `p${f.combo}${f.hand}` : key + (f.heavyVar || "") + seg;
        if (f.segId !== id) { // переход: прошлый кусок гаснет за 0.12 с; тот же клип — на втором слоте
            f.prev = f.cur || null;
            f.cur = { clip: mv.clip, slot: f.prev && f.prev.clip === mv.clip ? 1 - f.prev.slot : 0, time };
            f.blend = f.prev ? 0 : 1;
            f.segId = id;
        }
        f.cur.time = time;
        f.blend = Math.min(1, f.blend + dt / 0.12);
        // кости без дорожек в клипах — в исходную позу (иначе повороты поз из костей копились бы кадр за кадром).
        // Кости с дорожками НЕ трогаем: миксер three.js пишет в кость, только если значение изменилось с прошлого кадра,
        // и при стоящем времени клипа (стойка, удержание блока) сброшенная кость так и оставалась бы в исходной позе — тряска
        for (const [bone, q, p] of f.rest) if (!f.tracked.has(bone.name)) { bone.quaternion.copy(q); bone.position.copy(p); }
        for (const [name, pair] of Object.entries(f.acts)) pair.forEach((a, slot) => {
            let w = 0;
            if (name === f.cur.clip && slot === f.cur.slot) { w = f.blend; a.time = time; }
            else if (f.prev && f.blend < 1 && name === f.prev.clip && slot === f.prev.slot) { w = 1 - f.blend; a.time = f.prev.time; }
            a.setEffectiveWeight(w);
        });
        f.mixer.update(0);
        if (key === "idle" && !f.hip0) f.hip0 = f.b.Hips?.position.clone();
        this.pinHips(f);
        this.faceOpponent(f, key === "idle");
        const b = f.b, k = Math.min(1, f.t / (f.dur || 1)), fw = f.fwd, rt = f.right;
        const V = (x, y, z) => new THREE.Vector3().addScaledVector(rt, x).addScaledVector(UP, y).addScaledVector(fw, z);
        let dz = 0, dip = 0, sideX = 0;
        const own = !!this.moveOf(f); // у действия свой клип — позы из костей не нужны, только шаг корня
        if (own) {
            if (f.act === "hit" || f.act === "recoil") dz -= (f.act === "hit" ? f.kb : 0.18) * (1 - smooth(k));
            if (f.act === "punch" || f.act === "knee" || f.act === "low" || f.act === "super" || f.act === "superFin") dz += (f.cfg.lunge ?? 0.16) * bell(k, Math.min(0.8, Math.max(0.2, (f.hitAt ?? 0.5) - 0.05)), 1); // шаг в удар — кулак должен достать
            if (f.act === "heavy" || f.act === "heavyWind") dz -= 0.28 * (f.act === "heavy" ? bell(k, 0.35, 1) : smooth(k)); // нога не проходит сквозь соперника
        }
        else if (f.act === "block") {
            const w = Math.min(smooth(f.t / 0.08), f.t > f.dur * 0.75 ? 1 - smooth((f.t - f.dur * 0.75) / (f.dur * 0.25)) : 1);
            aim(b.LeftArm, b.LeftForeArm, V(-0.25, -0.35, 0.75), w);
            aim(b.LeftForeArm, b.LeftHand, V(0.35, 1, 0.1), w);
            aim(b.RightArm, b.RightForeArm, V(0.25, -0.35, 0.75), w);
            aim(b.RightForeArm, b.RightHand, V(-0.35, 1, 0.1), w);
            twist(b.Spine1, rt, -0.12 * w); // чуть вперёд, за руки
            dip += 0.04 * w;
        } else if (f.act === "dodge") {
            const w = bell(k, 0.3, 1);
            twist(b.Spine, fw, -0.45 * w * f.dir);
            twist(b.Spine1, rt, 0.25 * w);
            dip += 0.12 * w; sideX = -0.25 * w; dz -= 0.15 * w;
        } else if (f.act === "hit" || f.act === "recoil") {
            // вокруг своей оси «вправо» на +угол — корпус и голова откидываются назад. Повороты по цепочке
            // складываются (поясница + грудь + шея), поэтому всего не больше ~20° — иначе тело ломается
            const w = 1 - smooth(k), back = f.act === "hit" ? 0.36 : 0.22;
            twist(b.Spine, rt, back * 0.35 * w);
            twist(b.Spine2, rt, back * 0.35 * w);
            twist(b.Neck, rt, back * 0.3 * w);
            if (f.act === "hit") twist(b.Spine1, UP, (f.hitSide || 1) * 0.18 * w);
            dz -= (f.act === "hit" ? f.kb : 0.18) * w;
        }
        this.place(f, dz, dip, sideX, dt);
    }

    // бёдра — на месте стойки по горизонтали (в клипах тело шагает и уезжает, а ходит боец у нас сам), по высоте — как в клипе.
    // «Верх» у бёдер у каждой модели свой: у Павла скелет повёрнут на −90° (высота — локальная Z), у Спиди — Y.
    // Поэтому вертикаль берём из мира, переведённую в систему родителя бёдер, и убираем только горизонталь.
    pinHips(f) {
        const hips = f.b.Hips;
        if (!hips || !f.hip0) return;
        if (!f.hipUp) {
            f.model.updateMatrixWorld(true);
            const q = hips.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
            f.hipUp = UP.clone().applyQuaternion(q).normalize();
        }
        const d = hips.position.clone().sub(f.hip0);
        hips.position.copy(f.hip0).addScaledVector(f.hipUp, d.dot(f.hipUp));
        f.model.updateMatrixWorld(true);
    }

    // бёдра — к сопернику: в клипах ударов корпус разворачивается, и боец оказывался то спиной, то лицом к камере.
    // Направление — линия тазобедренных суставов по земле; в стойке запоминаем, дальше доворачиваем всю модель
    faceOpponent(f, ref) {
        const L = f.b.LeftUpLeg, R = f.b.RightUpLeg;
        if (!L || !R) return;
        f.model.rotation.y = 0;
        f.model.updateMatrixWorld(true);
        const v = R.getWorldPosition(_v1).sub(L.getWorldPosition(_v2)); // общие векторы — без мусора каждый кадр
        const a = Math.atan2(v.x, v.z);
        if (ref || f.yaw0 === undefined) { if (ref) f.yaw0 = a; else return; }
        let d = f.yaw0 - a;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        d = Math.max(-0.3, Math.min(0.3, d)); // не больше ~17°: в ударах ногами линия бёдер крутится, корпус не заваливаем
        f.faceD = f.faceD === undefined ? d : f.faceD + (d - f.faceD) * 0.25;
        f.model.rotation.y = f.faceD + (f.cfg.yaw || 0) * f.dir; // cfg.yaw — доворот корпуса к камере
        f.model.updateMatrixWorld(true);
    }

    // корень: шаг вперёд/назад, «танец» на месте, ноги на асфальте; вспышка при попадании
    place(f, dz, dip, sideX, dt) {
        const step = Math.sin(this.t * 2.2 + f.dir * 1.3) * 0.05 * (f.act === "idle" ? 1 : 0.3);
        dip += (f.act === "idle" ? 1 : 0.4) * (0.5 + 0.5 * Math.sin(this.t * 3.1 + f.dir)) * 0.018; // дыхание: корпус чуть пружинит
        const tz = f.home + (dz + step) * -f.dir;
        f.z += (tz - f.z) * Math.min(1, dt * 14);
        f.root.position.set(sideX * f.dir, f.act === "ko" ? f.koLift ?? 0 : 0, f.z); // в нокауте высоту ставит update()
        // ноги на асфальте: самая нижняя точка стоп — на земле (иначе при приседе ступни уходят под дорогу)
        if (f.model && f.act !== "ko") {
            f.model.updateMatrixWorld(true);
            f.root.position.y = 0;
            f.root.updateMatrixWorld(true);
            let low = Infinity;
            const p = _v1;
            for (const n of ["LeftToeBase", "RightToeBase", "LeftFoot", "RightFoot"]) if (f.b[n]) low = Math.min(low, f.b[n].getWorldPosition(p).y);
            const air = this.moveOf(f)?.air;
            if (low < Infinity && !air) f.lift = (f.lift ?? 0) + ((f.cfg.foot ?? 0.04) - low - (f.lift ?? 0)) * Math.min(1, dt * 10);
            f.root.position.y += (f.lift ?? 0) - dip;
        }
        f.flash = Math.max(0, f.flash - dt * 6);
        for (const m of f.mats) {
            const w = 0; // замах видно по клипу и надписи — без подсветки тела
            m.emissive.setRGB(0, 0, 0); // без заливки тела: попадание видно по искре, отдаче и цифрам
        }
        const warn = this.f[1].act === "heavyWind";
        if (warn !== this.warnShown) { this.warnShown = warn; $("f-warn").hidden = !warn; }
    }

    updateSparks(dt) {
        for (let i = this.sparks.length - 1; i >= 0; i--) {
            const s = this.sparks[i];
            s.t += dt;
            const k = s.t / (s.ring ? 0.45 : 0.28);
            if (s.ring) { s.m.scale.setScalar(s.size * (0.3 + smooth(k) * 1.4)); s.m.material.opacity = 0.7 * (1 - k); }
            else {
                s.m.scale.setScalar(s.size * 0.5 * (0.3 + smooth(Math.min(1, k * 2.2)) * 0.9));
                s.m.material.opacity = 1 - smooth(k);
            }
            if (k >= 1) { this.group.remove(s.m); s.m.material.dispose(); this.sparks.splice(i, 1); }
        }
    }

    // камера: из-за спины героя (как в забеге) съезжает вбок — по диагонали к линии боя, оба в кадре;
    // на нокауте и супере — ближе
    camera(dt) {
        const cam = this.g.camera, portrait = cam.aspect < 0.8;
        const k = smooth(this.camT / 1.4);
        const ko = this.phase === "roundEnd" && this.f.some((f) => f.act === "ko");
        const sup = this.f[0].act === "super", fin = this.f[0].act === "superFin";
        if (this.punchIn) this.punchIn = Math.max(0, this.punchIn - dt * 0.6);
        const zoom = (ko ? 0.7 : fin ? 0.62 : sup ? 0.78 : 1) - (this.punchIn || 0);
        this.zoom = (this.zoom ?? 1) + (zoom - (this.zoom ?? 1)) * Math.min(1, dt * 3);
        const d = (portrait ? 1 : 0.8) * this.zoom;
        // вид сбоку, как в Tekken: герой справа, соперник слева, оба в рост
        // камера дальше и чуть выше: видно и руки, и ноги обоих, удары читаются
        const pos = (this.v1 ||= new THREE.Vector3()).set(-4.7 * d, 1.25, 0.12 * d); // строго сбоку, как в Shadow Fight: оба в профиль
        const from = (this.v2 ||= new THREE.Vector3()).set(0, portrait ? 3.3 : 2.5, 5.0);
        cam.position.lerpVectors(from, pos, k);
        if (ko) { // нокаут: камера выше и сбоку от упавшего — его видно из-за победителя
            const l = this.f.find((f) => f.act === "ko");
            this.koK = Math.min(1, (this.koK || 0) + dt * 1.2);
            const lz = l.z + l.dir * 0.7; // упавший лежит навзничь — на ~0.7 м за своим местом
            cam.position.lerp((this.v5 ||= new THREE.Vector3()).set(-2.9, 1.9, lz - l.dir * 0.5), smooth(this.koK));
        } else this.koK = 0;
        cam.position.x += Math.sin(this.t * 0.5) * 0.12; // камера чуть плывёт
        cam.position.y += Math.sin(this.t * 0.7) * 0.04;
        if (this.shake > 0) {
            this.shake = Math.max(0, this.shake - dt * 1.6);
            cam.position.x += (Math.random() - 0.5) * this.shake * 0.5;
            cam.position.y += (Math.random() - 0.5) * this.shake * 0.5;
        }
        const look = (this.v3 ||= new THREE.Vector3()).set(0, portrait ? 1.0 : 0.95, -0.02);
        if (ko) { const l = this.f.find((f) => f.act === "ko"); look.lerp(new THREE.Vector3(0, 0.45, l.z + l.dir * 0.45), smooth(this.koK)); }
        cam.lookAt(look.lerp((this.v4 ||= new THREE.Vector3()).set(0, 0.9, -8), 1 - k));
        // сцена «Маска»: камера ближе к маске, только пока она падает
        const fm = this.cut?.focus && this.mask ? 1 : 0;
        this.maskK = (this.maskK || 0) + (fm - (this.maskK || 0)) * Math.min(1, dt * 2.5);
        if (this.maskK > 0.001) {
            const mp = this.mask.position, k2 = smooth(this.maskK);
            cam.position.lerp((this.v6 ||= new THREE.Vector3()).set(mp.x - 2.7, 1.25, mp.z + 0.35), k2);
            const lk = (this.v7 ||= new THREE.Vector3()).set(0, portrait ? 1.0 : 0.95, -0.02).lerp(new THREE.Vector3(mp.x, Math.max(0.35, mp.y * 0.6 + 0.25), mp.z), k2);
            cam.lookAt(lk);
        }
        const fov = portrait ? FIGHT.fov : this.g.baseFov;
        if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
    }

    // ---- экзамен Инакова: вопрос → 4 с на ответ → верно: удар Спиди (3 подряд или верное число — супер), ошибка: удар Павла ----
    examStep(dt) {
        const ex = this.exam;
        if (ex.wait > 0) {
            ex.wait -= dt;
            if (ex.wait > 0) return;
            // удар за ответ засчитывается по касанию и мог пройти мимо (или в блок) — урон за ответ всё равно снимаем,
            // чтобы полоска HP Павла шла по ответам; исход по счёту решает examSettle
            const [h, o] = this.f;
            if (h.examPool) o.hp = Math.max(0, o.hp - h.examPool);
            if (o.examPool) h.hp = Math.max(0, h.hp - o.examPool);
            h.examPool = o.examPool = null;
            if (!this.examSettle()) this.examAsk();
            return;
        }
        if (!ex.q) return;
        ex.left -= dt;
        const k = Math.max(0, ex.left / ex.max);
        const bar = $("fx-time");
        bar.style.transform = `scaleX(${k.toFixed(3)})`;
        bar.classList.toggle("low", ex.left < 1.5);
        if (ex.left <= 0) this.examAnswer(-1);
    }

    // экзамен решён по счёту (верно ≥ need или ошибок ≥ lives, или вопросы кончились), а HP не дошло до нуля —
    // удар промахнулся, серию супера прервал следующий вопрос и т. п. Без этого бой висел: вопросов нет, таймера нет (Infinity).
    examSettle() {
        const ex = this.exam, [h, o] = this.f;
        if (h.hp <= 0 || o.hp <= 0) return true;
        const out = ex.i >= ex.list.length;
        if (ex.ok >= ex.need) { o.hp = 0; return true; }
        if (ex.bad >= ex.lives || out) { h.hp = 0; return true; }
        return false;
    }

    examAsk() {
        const ex = this.exam, [h, o] = this.f;
        if (h.hp <= 0 || o.hp <= 0 || ex.i >= ex.list.length) return;
        const q = ex.list[ex.i++];
        const order = q.a.map((_, i) => i).sort(() => Math.random() - 0.5);
        ex.q = { ...q, order, right: order.indexOf(0) };
        ex.left = ex.max = ex.time;
        $("fx-label").textContent = `Экзамен · вопрос ${ex.i}/${ex.list.length} · верно ${ex.ok}/${ex.need} · ошибок ${ex.bad}/${ex.lives}`;
        $("fx-q").textContent = q.q;
        const box = $("fx-a");
        box.innerHTML = "";
        order.forEach((ai, i) => {
            const b = document.createElement("button");
            b.textContent = q.a[ai];
            b.onpointerdown = (e) => { e.preventDefault(); e.stopPropagation(); if (this.exam.q) this.examAnswer(i); };
            box.append(b);
        });
        const ch = $("fx-charge");
        ch.hidden = !ex.charges;
        ch.textContent = `Заряд с табличек: убрать неверный вариант (осталось ${ex.charges})`;
        ch.onpointerdown = (e) => {
            e.preventDefault(); e.stopPropagation();
            const cur = this.exam.q;
            if (!cur || !this.exam.charges) return;
            const wrong = [...box.children].map((b, i) => i).filter((i) => i !== cur.right && !box.children[i].classList.contains("gone"));
            if (!wrong.length) return;
            box.children[pick(wrong)].classList.add("gone");
            this.exam.charges--;
            ch.textContent = `Заряд с табличек: убрать неверный вариант (осталось ${this.exam.charges})`;
            ch.hidden = !this.exam.charges;
        };
        $("f-exam").hidden = false;
        this.g.audio?.play("swipe");
    }

    examAnswer(i) {
        const ex = this.exam, q = ex.q, [h, o] = this.f, L = this.oppCfg.lines;
        ex.q = null;
        const box = $("fx-a");
        [...box.children].forEach((b, j) => { b.classList.toggle("ok", j === q.right); b.classList.toggle("bad", j === i && j !== q.right); b.onpointerdown = null; });
        $("fx-charge").hidden = true;
        if (i === q.right) {
            ex.ok++; ex.streak++;
            const sup = ex.streak >= 3 || q.num;
            if (sup) ex.streak = 0;
            h.examPool = h.examPool0 = ex.ok >= ex.need ? o.hp : Math.ceil(o.hpMax / ex.need); // последний верный — добивает весь остаток
            h.act = "idle"; o.act = "idle";
            if (sup) { this.act(h, "super", FIGHT.superTime); this.big("СУПЕР!", "gold"); setTimeout(() => this.phase === "fight" && this.big(""), 900); this.slow = 0.55; this.g.audio?.play("boost"); }
            else { h.combo = 1; this.punch(h); }
            $("fx-q").textContent = `${pick(L.examOk || ["Верно."])} ${q.solve || ""}`.trim();
            ex.wait = sup ? 2.6 : 1.8;
        } else {
            ex.bad++; ex.streak = 0;
            o.examPool = o.examPool0 = ex.bad >= ex.lives ? h.hp : Math.ceil(h.hpMax / ex.lives);
            h.act = "idle"; o.act = "idle";
            this.act(o, "heavyWind", 0.4);
            $("fx-q").textContent = `${i < 0 ? "Время вышло. " : ""}${L.examTrap || ""} ${q.err || ""}`.trim();
            ex.wait = 3.0;
        }
        $("fx-label").textContent = `Экзамен · верно ${ex.ok}/${ex.need} · ошибок ${ex.bad}/${ex.lives}`;
        $("fx-time").style.transform = "scaleX(0)";
    }

    hud() {
        // DOM трогаем, только когда значение поменялось: запись стилей каждый кадр поверх WebGL — лишний пересчёт и нагрев
        const [h, o] = this.f;
        const c = (this.hudC ||= {});
        const set = (key, v, fn) => { if (c[key] !== v) { c[key] = v; fn(v); } };
        const bar = (id, v) => set(id, Math.max(0, v).toFixed(3), (k) => { $(id).style.transform = `scaleX(${k})`; });
        bar("f-hp-l", h.hp / (h.hpMax || 1));
        bar("f-hp-r", o.hp / (o.hpMax || 1));
        bar("f-dmg-l", h.shown / (h.hpMax || 1));
        bar("f-dmg-r", o.shown / (o.hpMax || 1));
        set("time", Math.max(0, Math.ceil(this.timeLeft ?? FIGHT.roundTime)), (v) => { $("f-time").textContent = v; });
        set("low", (this.timeLeft ?? 99) < 10 && this.phase === "fight", (v) => $("f-time").classList.toggle("low", v));
        const sv = Math.min(1, this.superV / FIGHT.superMax);
        set("sv", sv.toFixed(2), (v) => { $("fb-super").style.setProperty("--k", v); $("fb-super").classList.toggle("full", sv >= 1); });
        set("pips", this.wins.join(), () => {
            $("f-pips-l").innerHTML = Array.from({ length: FIGHT.winRounds }, (_, i) => `<i class="${i < this.wins[0] ? "on" : ""}"></i>`).join("");
            $("f-pips-r").innerHTML = Array.from({ length: FIGHT.winRounds }, (_, i) => `<i class="${i < this.wins[1] ? "on" : ""}"></i>`).join("");
        });
        set("fb", this.phase === "fight", (v) => { if (v) $("fb").classList.remove("off"); });
    }
}
