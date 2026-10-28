// «Покоритель P2P 3.0» — раннер: крыс бежит по ночному району, собирает USDT,
// прыгает через баки, подкатывается под «блокировки» и объезжает тачки.

import { BALANCE, LINKS, DEATH_TEXT, TIPS, CHARACTERS, QUALITY, QUALITY_TIERS, HERO_PERKS, UPGRADES, APPEAL_PRICE, CHAPTERS, POWERUPS, WALLS, QUESTIONS, CLIENT_TYPES, WIND, VENT, HERO_SKILLS, BOSS, CHAPTER_BOSSES, BOSS_FIGHT, ARCHES, POLICE_OFFICER, CHASER, SKY, HERO_LINES, CHASER_LINES, BOOSTS, BOOST_LIMIT, STORIES, FIGHT, FIGHTERS, CHARGES, GORILLA, EXAM, CHASE_GRUDGE, HEAT_AFTER } from "./config.js";
import { Fight } from "./fight.js";
import { Profile } from "./profile.js";
import { Hub } from "./hub.js";
import { createRat, animateRat, attachModel } from "./rat.js";
import { World, SPAWN_Z, buildEnvironment } from "./world.js";
import * as THREE from "./vendor/three.module.js";
import { EffectComposer } from "./vendor/jsm/EffectComposer.js";
import { RenderPass } from "./vendor/jsm/RenderPass.js";
import { UnrealBloomPass } from "./vendor/jsm/UnrealBloomPass.js";
import { ShaderPass } from "./vendor/jsm/ShaderPass.js";
import { loadModel, releaseQueue } from "./models.js";
import { Audio } from "./audio.js";
import { tg } from "./tg.js";

// hex-цвета материалов — в sRGB, как в дизайне
THREE.ColorManagement.legacyMode = false;

// Финальный проход после bloom: ACES-тонмаппинг, sRGB и лёгкая виньетка
const OutputShader = {
    uniforms: { tDiffuse: { value: null }, exposure: { value: 1.1 } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
        uniform sampler2D tDiffuse; uniform float exposure; varying vec2 vUv;
        vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
        void main() {
            vec3 c = aces(texture2D(tDiffuse, vUv).rgb * exposure);
            c = mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
            float v = smoothstep(0.95, 0.35, length(vUv - 0.5));
            gl_FragColor = vec4(c * mix(0.55, 1.0, v), 1.0);
        }`,
};

const $ = (id) => document.getElementById(id);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
// число «досчитывается» от 0 (easeOutCubic); без анимаций — сразу итог
const countUp = (el, to, delay = 0, ms = 900) => {
    if (!to || matchMedia("(prefers-reduced-motion: reduce)").matches) { el.textContent = fmt(to); return; }
    const t0 = performance.now() + delay;
    const step = (t) => {
        const k = Math.min(1, Math.max(0, (t - t0) / ms));
        el.textContent = fmt(to * (1 - (1 - k) ** 3));
        if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
};
const fmt = (n) => Math.floor(n).toLocaleString("ru-RU").replace(/\s/g, " "); // разряды — неразрывным пробелом (узкого в шрифте Unbounded нет): «1 234» не переносится
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Слабый телефон — сразу низкая графика, чтобы не грелся. Бюджетный Android обычно с 8 ядрами, поэтому
// одних ядер мало: смотрим ещё память (Chrome отдаёт 0.5, 1, 2, 4, 8 ГБ) и название видеочипа.
function weakDevice() {
    const ios = /iPhone|iPad/.test(navigator.userAgent);
    if (navigator.deviceMemory && navigator.deviceMemory <= 4) return true;
    if (!ios && navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) return true;
    try {
        const gl = document.createElement("canvas").getContext("webgl");
        const info = gl?.getExtension("WEBGL_debug_renderer_info");
        const gpu = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
        gl?.getExtension("WEBGL_lose_context")?.loseContext();
        // Mali-400/T-серия/G31–G57, Adreno 3xx–5xx и 610–613, PowerVR — видеочипы бюджетных телефонов
        return /Mali-(4|T\d|G(31|51|52|57)\b)|Adreno \(TM\) ([3-5]\d\d|61[0-3])\b|PowerVR/i.test(gpu);
    } catch {
        return false;
    }
}

class Game {
    constructor() {
        window.game = this; // удобно для отладки из консоли
        this.camMix = 0;
        this.state = "menu"; // menu → countdown → playing ⇄ paused → over
        this.audio = new Audio();
        this.best = tg.localBest();
        this.t = 0;
        // рывки камеры: dip — присед по высоте (прыжок, приземление), shake — секунды тряски, fov — «удар» угла обзора
        this.camKick = { dip: 0, shake: 0, fov: 0 };
        this.calm = matchMedia("(prefers-reduced-motion: reduce)").matches; // «уменьшить движение» — эффекты слабее

        // телефон по умолчанию — средняя графика: он и так тянет 60 кадров, но греется
        const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) < 820);
        this.quality = QUALITY === "auto" ? (mobile && weakDevice() ? "low" : mobile ? "medium" : "high") : QUALITY;
        this.resScale = 1;
        this.autoQuality = this.quality;
        // настройки игрока (музыка, звуки, вибрация, графика) — из памяти телефона
        try { this.settings = JSON.parse(localStorage.getItem("p2p_settings") || "{}"); } catch { this.settings = {}; }
        // режим: ?startapp=q / noq задаёт его и снимает выбор при первом входе
        const sp = (tg.startParam || "").toLowerCase();
        if (sp === "q" || sp === "noq") { this.settings.questions = sp === "q"; this.settings.modeChosen = true; try { localStorage.setItem("p2p_settings", JSON.stringify(this.settings)); } catch {} }
        if (this.settings.quality && this.settings.quality !== "auto" && QUALITY_TIERS[this.settings.quality]) this.quality = this.settings.quality; // динамическое разрешение: при нехватке кадров сначала 0.85, 0.7 — и только потом графика ниже
        this.tier = QUALITY_TIERS[this.quality];

        this.setupScene();
        this.world = new World(this.scene, BALANCE.laneWidth, this.tier);
        this.world.camera = this.camera;
        this.rat = createRat();
        this.scene.add(this.rat, this.rat.userData.blob);
        this.showRat(false); // до загрузки модели героя не показываем никого — крыс из примитивов только запасной
        this.heroes = {}; // загруженные модели персонажей по id
        this.profile = new Profile();
        this.hub = new Hub(this, this.profile);
        let saved = null;
        try { saved = localStorage.getItem("p2p_hero"); } catch {}
        this.selectHero(CHARACTERS.find((c) => c.id === saved && !c.locked) ? saved : CHARACTERS[0].id);
        // невыкупленного героя (раньше все были бесплатными) меняем на стартового
        this.hub.render(); // кошелёк и плитки — сразу из локальной копии
        this.profile.ready.then(() => {
            if (!this.profile.owns(this.heroId)) this.selectHero(CHARACTERS[0].id);
            this.hub.render();
            for (const g of this.profile.granted || []) { // разовое начисление (GRANTS) — сказать, что пришло (валюта одна — USDT)
                setTimeout(() => { this.hub.toast(`${g.text}: +${fmt(g.usdt)} USDT`); this.audio.play("record"); }, 500);
            }
            // первый вход — выбор режима (по умолчанию с вопросами), потом ежедневная награда — когда облако прочитано
            setTimeout(() => (this.settings.modeChosen ? this.hub.showDaily() : this.hub.showMode()), 1200);
        });

        this.setupInput();
        this.setupUI();
        this.resetRun();
        this.onResize();

        this.setQuality(this.quality);
        this.applySettings();

        tg.init();
        tg.getBest().then((b) => { this.best = b; this.renderMenu(); });

        this.clock = new THREE.Clock();
        this.loop();
    }

    setupScene() {
        const canvas = $("game");
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
        this.renderer.outputEncoding = THREE.sRGBEncoding;

        this.scene = new THREE.Scene();
        // небо — картинка во весь экран (градиент, звёзды, луна; перерисовывается под размер экрана в onResize),
        // туман вдали — цвета горизонта (SKY)
        this.scene.background = new THREE.Color(SKY.color);
        this.scene.fog = new THREE.Fog(SKY.color, 12, 85);
        this.paintSky();
        this.scene.environment = buildEnvironment(this.renderer);

        this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 100); // дальше 100 м всё равно туман

        this.scene.add(new THREE.HemisphereLight(SKY.hemi[0], SKY.hemi[1], SKY.light));
        // «луна» спереди-сверху: от неё тени крыса и препятствий падают к камере
        this.renderer.shadowMap.enabled = this.tier.shadows;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        const moon = new THREE.DirectionalLight(SKY.moon, 0.9);
        moon.castShadow = this.tier.shadows;
        moon.shadow.mapSize.set(1024, 1024);
        Object.assign(moon.shadow.camera, { left: -6, right: 6, top: 10, bottom: -10, near: 1, far: 40 });
        moon.shadow.bias = -0.0008;
        this.scene.add(moon, moon.target);
        this.moon = moon;
        // подсветка крыса, чтобы цепь «70» читалась
        this.rim = new THREE.PointLight(0xffe2d2, 1.0, 4, 2);
        this.scene.add(this.rim);

        // постобработка: свечение окон, фонарей, фар и монет
        this.composer = new EffectComposer(this.renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }));
        this.composer.addPass(new RenderPass(this.scene, this.camera));
        this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.8, 0.5, 0.92);
        this.composer.addPass(this.bloom);
        const output = new ShaderPass(OutputShader);
        output.uniforms.exposure.value = SKY.exposure;
        this.composer.addPass(output);

        window.addEventListener("resize", () => this.onResize());
    }

    onResize() {
        const w = window.innerWidth, h = window.innerHeight;
        if (!w || !h) return; // окно ещё не развернулось (Telegram, фоновая вкладка): буферы нулевого размера — ошибки WebGL
        const ratio = Math.min(window.devicePixelRatio, this.tier.ratio) * (this.resScale || 1) * (this.heatScale || 1);
        this.renderer.setPixelRatio(ratio);
        this.renderer.setSize(w, h, false);
        this.composer.setPixelRatio(ratio);
        this.composer.setSize(w, h);
        // свечение считается в уменьшенном буфере: в 2 раза на компьютере, в 4 на телефоне
        const div = this.tier.bloom || 4;
        this.bloom.setSize(w * ratio / div, h * ratio / div);
        this.bloom.enabled = this.tier.bloom > 0;
        this.camera.aspect = w / h;
        this.paintSky(w, h);
        this.baseFov = w / h < 0.8 ? 72 : 58;
        this.camera.fov = this.baseFov + this.camKick.fov;
        this.camera.updateProjectionMatrix();
        this.hudCoin = null; // куда летят монеты — пересчитать под новый размер
        if (this.sceneCovered()) this.composer.render(); // смена размера стирает холст — последний кадр рисуем заново
    }

    // Небо под пропорции экрана (иначе луна вытянется в овал): градиент, звёзды, луна с ореолом. Звёзды — одни и те же
    // при каждой перерисовке (свой генератор с зерном), чтобы при повороте экрана небо не «перемешивалось»
    paintSky(w = window.innerWidth, h = window.innerHeight) {
        if (!this.scene || !w || !h) return;
        const key = `${Math.round(w / h * 100)}`;
        if (this.skyKey === key) return;
        this.skyKey = key;
        const W = 512, H = Math.round(512 * h / w), c = document.createElement("canvas");
        c.width = W; c.height = H;
        const g = c.getContext("2d");
        const grad = g.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, SKY.zenith); grad.addColorStop(0.5, SKY.mid); grad.addColorStop(1, SKY.horizon);
        g.fillStyle = grad; g.fillRect(0, 0, W, H);
        let seed = 11;
        const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        for (let i = 0; i < SKY.stars; i++) { g.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.7})`; g.beginPath(); g.arc(rnd() * W, rnd() * H * 0.55, 0.6 + rnd() * 1.2, 0, 7); g.fill(); }
        const m = SKY.moonDisc, mx = m.x * W, my = m.y * H, r = m.r * W;
        const halo = g.createRadialGradient(mx, my, r * 0.6, mx, my, r * 4);
        halo.addColorStop(0, "rgba(220,200,255,.45)"); halo.addColorStop(1, "rgba(220,200,255,0)");
        g.fillStyle = halo; g.fillRect(0, 0, W, H);
        g.fillStyle = "#f2eaff"; g.beginPath(); g.arc(mx, my, r, 0, 7); g.fill();
        g.fillStyle = "rgba(180,160,220,.35)";
        for (const [a, b, rr] of [[-0.3, -0.2, 0.22], [0.25, 0.15, 0.15], [0.05, 0.35, 0.12]]) { g.beginPath(); g.arc(mx + a * r, my + b * r, rr * r, 0, 7); g.fill(); }
        const tex = new THREE.CanvasTexture(c);
        tex.encoding = THREE.sRGBEncoding;
        this.scene.background?.dispose?.();
        this.scene.background = tex;
    }

    // ---- забег ---------------------------------------------------------------------------

    resetRun() {
        this.storyOk = 0; // верных ответов в этом забеге
        this.storyQ = 0; // сколько табличек главы уже выставлено в этом забеге
        this.pendingInput = null; // табличка с вводом числа: откроется, когда герой до неё добежит
        this.starsT = 0;
        this.storyCatch = false; // глава 1: Мизулина догоняет по сценарию (ролик перед боем)
        this.grudgeTold = false;
        clearTimeout(this.gorillaT); if ($("gorilla")) $("gorilla").hidden = true;
        this.storyOn = false;
        this.world.clear();
        this.lane = 1;
        this.x = 0;
        this.y = 0;
        this.vy = 0;
        this.jumping = false;
        this.slideLeft = 0;
        this.speed = BALANCE.speedStart;
        this.runTime = 0;
        this.distance = 0;
        this.hudScore = 0;
        this.usdt = 0;
        this.trx = 0;
        this.coinCount = 0;
        this.credited = { usdt: 0, trx: 0 }; // сколько из этого забега уже зачислено в кошелёк
        this.appealUsed = false;
        this.boostLeft = 0;
        this.fx = { magnet: 0, honey: 0, shield: false, safe: 0, fly: 0 }; // добавки: секунды магнита, мёда и полёта, щит, неуязвимость
        this.stumble = 0;  // после первого удара: сколько ещё секунд ДПС на хвосте
        this.slowLeft = 0;
        this.prevLane = 1;
        if (this.chaser) this.chaser.visible = false;
        this.flight = null;
        if (this.rat.userData) this.rat.userData.clipT = null;
        this.phase = 0;
        this.nextRowZ = -40;
        // стены-возражения: где следующая, серия правильных, ошибки по типам клиентов за забег
        this.nextWallAt = this.questions ? WALLS.firstAt : ARCHES.firstAt;
        this.endBossFight(true); // экзамен Инакова (this.boss) — часть финального боя
        this.bossCalm = null; // тишина перед боссом: { left: метров, i }
        this.bossTried = false; // босс в этом забеге уже был
        this.bossPendingAtStart = this.profile.bossReady();
        this.runChapter = null; // какую главу закрыл этот забег
        this.chooseLock = 0;
        this.walls = []; // стены впереди (на экзамене их бывает несколько сразу)
        this.wallStreak = 0;
        this.wallStats = {};
        this.world.noCars = false;
        // «Ислам дует»
        if (this.wind) this.world.dropObstacle(this.wind.npc);
        this.wind = null;
        this.nextWindAt = WIND.firstAt;
        // «Ислам вентилирует»
        if (this.vent) for (const o of [this.vent.fan, this.vent.npc]) this.world.dropObstacle(o);
        this.vent = null;
        this.nextVentAt = VENT.firstAt;
        this.ventPush = this.ventOff = 0;
        // умения героя: кнопка (раз за забег), «Таран», запасная жизнь, прощённая ошибка на стене
        this.skillUsed = false;
        this.ram = 0;
        this.lives = this.perk?.extraLife || 0;
        this.wallForgive = this.perk?.wallForgive || 0;
        this.fx.turbo = 0;
        this.renderSkill();
        this.boostsUsed = 0;
        this.renderBoosts();
        this.cause = null;
        this.rat.position.set(0, 0, 0);
        this.rat.rotation.set(0, 0, 0);
        this.updateHud();
    }

    // Старт только из меню или с экрана проигрыша. Отсчёт можно прервать (ушли в меню) — тогда забег не начнётся:
    // раньше он стартовал через 2,4 с всё равно, невидимо под меню
    async start() {
        if ((this.state !== "menu" && this.state !== "over") || this.heroLoading) return;
        // перед первым забегом — анкета Гориллы (доход, опыт, капитал, цель)
        if (this.questions && !this.profile.data.anketa && $("anketa").hidden) return this.showAnketa(GORILLA.anketa, () => this.start());
        this.endArrest();
        const run = this.runId = (this.runId || 0) + 1;
        this.audio.unlock();
        this.resetRun();
        $("daily").hidden = true; // ежедневная награда не висит поверх забега (заберётся в меню)
        $("mode").hidden = true;
        this.show("hud");
        this.state = "countdown";
        this.audio.music("run"); // трек забега — сразу со старта, а не после отсчёта
        const cd = $("countdown");
        const live = () => this.runId === run && this.state === "countdown";
        cd.hidden = false;
        for (const n of ["3", "2", "1"]) {
            cd.textContent = n;
            cd.classList.remove("pop"); void cd.offsetWidth; cd.classList.add("pop");
            this.audio.play("count");
            await wait(600);
            if (!live()) { cd.hidden = true; return; }
        }
        cd.textContent = "ПОГНАЛИ!";
        cd.classList.remove("pop"); void cd.offsetWidth; cd.classList.add("pop");
        this.audio.play("go");
        setTimeout(() => { if (this.runId === run) cd.hidden = true; }, 500);
        this.applyBoosts(); // добавки тратятся, только когда забег точно начался
        const st = this.story;
        const nb = this.nextBoss();
        if (!st && nb) setTimeout(() => this.runId === run && this.state === "playing" && this.gorilla(nb.text, false, 5200), 900);
        if (st && this.questions) setTimeout(() => this.runId === run && this.state === "playing" && this.gorilla((st.chase && !this.grudge && st.chaseHint) || st.hub || `${st.name}: ${st.title}. Страх ${st.fear}. Каждая верная табличка — заряд против босса.`, true, 4500), 900);
        this.chaserSaid = false;
        const lines = HERO_LINES[this.heroId];
        // реплика героя — после подсказки Гориллы о главе или боссе (она выходит на старте), а не поверх неё
        const told = this.questions && (this.story || this.nextBoss());
        if (lines) setTimeout(() => { if (this.runId === run && this.state === "playing") this.speech(CHARACTERS.find((c) => c.id === this.heroId)?.name, pick(lines), 3000); }, told ? 9500 : 2600);
        this.state = "playing";
        this.renderBoosts(); // кнопки бустов оживают со стартом
        this.audio.music("run");
        tg.guardClose(true);
        if (document.hidden) this.pause(); // свернули приложение во время отсчёта
    }

    // добавки из NS Store, купленные на этот забег: по одной каждой
    // Бусты из NS Store не включаются сами: в забеге справа кнопки купленных, нажал — сработал (как в Subway Surfers).
    // За забег — не больше BOOST_LIMIT. Автоматически — только ×2 на забеги из «Финансового Ебобо».
    applyBoosts() {
        this.boostsUsed = 0;
        const d = this.profile.data;
        if (d.x2runs > 0) { d.x2runs--; this.boostLeft = 600; this.hub.toast("В забеге: ×2 монеты"); this.profile.save(); } // «Финансовый Ебобо»
        this.renderBoosts();
        this.updateHud();
    }

    renderBoosts() {
        const bar = $("boost-bar");
        for (const el of bar.querySelectorAll(".bst:not(.bst-skill)")) el.remove();
        const left = BOOST_LIMIT - (this.boostsUsed || 0);
        const next = this.profile.data.next || {};
        let n = 0;
        for (const b of BOOSTS) {
            if (!(next[b.id] > 0) || n >= 4) continue;
            n++;
            const el = document.createElement("button");
            el.className = b.name.length > 9 ? "bst long" : "bst"; // «Устойчивость» — подпись мельче, чтобы влезла
            el.dataset.id = b.id;
            el.disabled = left <= 0 || this.state !== "playing";
            el.innerHTML = `<img src="${b.art}" alt=""><b>${b.name}</b><i>${next[b.id]}</i>`;
            el.onclick = () => { if (this.boostTap()) this.useBoost(b.id); };
            bar.prepend(el);
        }
    }

    // кнопка буста или умения нажата тапом, а не концом свайпа, который начался на ней
    boostTap() {
        return performance.now() - (this.lastSwipe || 0) > 500;
    }

    useBoost(id) {
        const b = BOOSTS.find((x) => x.id === id), next = this.profile.data.next;
        if (!b || this.state !== "playing" || !(next[id] > 0) || (this.boostsUsed || 0) >= BOOST_LIMIT) return;
        next[id]--;
        this.boostsUsed = (this.boostsUsed || 0) + 1;
        this.profile.save();
        if (id === "fokus") { this.fx.magnet = Math.max(this.fx.magnet, b.time); this.fx.focus = b.walls; }
        if (id === "ryvok") { this.fx.honey = b.time; if (this.grudge && this.stumble > 0) this.speech("Мизулина", CHASE_GRUDGE.lines.dash); }
        if (id === "ustoychivost") this.fx.windproof = true;
        if (id === "spokoystvie") this.wallForgive = Math.max(this.wallForgive || 0, 1);
        if (id === "shchit") this.fx.shield = true;
        if (id === "berserk") { this.ram = Math.max(this.ram || 0, b.charges); this.fly(b.time); }
        if (id === "magnit") this.fx.magnet = Math.max(this.fx.magnet, b.time);
        this.hub.toast(`${b.name}: ${b.text}`);
        this.audio.play("boost");
        tg.haptic("heavy");
        this.kick(0.15, 5);
        this.renderBoosts();
        this.updateHud();
    }

    // Апелляция: продолжить с того же места за USDT (валюта одна), один раз за забег
    appeal() {
        if (this.state !== "over" || this.appealUsed || !this.profile.pay({ usdt: APPEAL_PRICE })) return;
        // сцена задержания: Мизулина застыла в жесте «протокол» (бег остановлен), а класс arresting прячет
        // бусты и плашки добавок. Без этого после апелляции за героем ехала застывшая фигура, а кнопок бустов не было
        this.endArrest();
        this.appealUsed = true;
        this.audio.play("buy");
        for (const o of this.world.obstacles) {
            if (o.position.z > -25 && o.position.z < 6) { o.visible = false; o.userData.type = "decor"; }
        }
        this.fx.safe = 2;
        this.cause = null;
        this.show("hud");
        this.state = "playing";
        this.audio.music("run");
        tg.guardClose(true);
    }

    get perk() {
        return HERO_PERKS[this.heroId] || {};
    }

    // В меню с паузы или с экрана проигрыша. Ушёл с паузы — собранное в забеге всё равно в кошелёк.
    toMenu() {
        this.endArrest();
        if (this.state === "paused") {
            const du = this.usdt - this.credited.usdt;
            this.credited = { usdt: this.usdt, trx: 0 };
            if (du) {
                this.profile.earn(du);
                this.hub.toast(`В кошелёк +${fmt(du)} USDT`);
            }
        }
        tg.guardClose(false);
        this.state = "menu";
        this.audio.music("menu");
        this.resetRun();
        this.renderMenu();
        this.show("menu");
        setTimeout(() => this.state === "menu" && this.hub.showDaily(), 600); // награда, не забранная перед забегом
    }

    pause() {
        if (this.state !== "playing") return;
        this.state = "paused";
        this.audio.music("pause");
        this.show("pause");
    }

    resume() {
        if (this.state !== "paused") return;
        this.audio.unlock();
        this.state = "playing";
        this.audio.music("run");
        this.show("hud");
    }

    gameOver(cause) {
        this.state = "over";
        tg.guardClose(false);
        this.cause = cause;
        this.audio.music("menu");
        this.audio.play("hit");
        if (cause === "cop" || cause === "caught") this.audio.play("busted");
        // поймала погоня — сцена задержания (герой лежит, Мизулина над ним, мигалки), потом экран проигрыша
        const arrest = cause === "caught" && this.chaser?.visible && this.chaser.userData.mixer;
        if (arrest) this.startArrest();
        else if (this.chaser) this.chaser.visible = false;
        this.stumble = 0;
        tg.haptic("error");
        this.kick(0.5, 10);
        this.overAt = this.t;

        const score = this.score();
        const isBest = score > this.best;
        if (isBest) {
            this.best = score;
            tg.saveBest(score);
            setTimeout(() => this.audio.play("record"), 700);
        }
        $("over-cause").textContent = cause === "caught" && this.grudge ? `Мизулина: «${CHASE_GRUDGE.lines.caught}»` : pick(DEATH_TEXT[cause]);
        $("over-new").hidden = !isBest;
        $("over-best").innerHTML = isBest ? "" : `Рекорд <b>${fmt(this.best)}</b>`;
        document.querySelector(".over-card").classList.toggle("is-best", isBest);

        // поймала Мизулина «из принципа» — минус 20% USDT этого забега
        if (cause === "caught" && this.grudge) {
            const cut = Math.round((this.usdt - this.credited.usdt) * CHASE_GRUDGE.penalty);
            this.usdt -= cut;
            setTimeout(() => this.speech("Мизулина", CHASE_GRUDGE.lines.caught, 3600), 300);
        }
        // в кошелёк — то, что ещё не зачислено (после апелляции забег продолжается)
        const du = this.usdt - this.credited.usdt;
        this.credited = { usdt: this.usdt, trx: 0 };
        this.profile.earn(du);
        // проиграл боссу — он ждёт в следующем забеге
        const lostBoss = this.bossFight?.cfg;
        this.endBossFight();
        this.bossCalm = null;
        if (lostBoss) $("over-cause").textContent = `${lostBoss.name}: «${lostBoss.lose}»`;
        $("over-wallet").innerHTML = `В кошелёк <b>+${fmt(du)} USDT</b> · всего ${fmt(this.profile.usdt)} USDT`;
        const appeal = $("btn-appeal"), canAppeal = this.profile.usdt >= APPEAL_PRICE;
        appeal.hidden = this.appealUsed;
        appeal.disabled = !canAppeal;
        $("appeal-sub").textContent = canAppeal ? "Продолжить с того же места" : `Нужно ${fmt(APPEAL_PRICE)} USDT`;
        $("appeal-price").textContent = `${fmt(APPEAL_PRICE)} USDT`;
        const counters = [["over-score", score, 0], ["over-usdt", this.usdt, 250], ["over-dist", this.distance, 320]];
        for (const [id] of counters) $(id).textContent = "0";
        // стены за забег — в профиль (по ним менеджер поймёт тип клиента)
        this.profile.addWallStats(this.wallStats);
        this.wallStats = {};
        $("wall-q").hidden = true;
        this.slowK = 1;
        if (this.slowmo) { this.slowmo = false; document.body.classList.remove("slowmo"); }
        $("wind-q").hidden = true;
        this.world.blowWind(null);
        this.windSlide = 0;
        $("vent-q").hidden = true; // вентилятор: забег кончился — ветер тоже (и после апелляции не дует дальше)
        if (this.vent) this.vent.state = "done";
        this.ventPush = this.ventOff = 0;
        // глава закрыта в этом забеге (победа над боссом); кодовая фраза — только в режиме с вопросами
        const chapter = this.runChapter;
        const phraseBox = $("over-phrase");
        phraseBox.hidden = chapter === null;
        if (chapter !== null) {
            const done = CHAPTERS[chapter - 1];
            phraseBox.innerHTML = `<span class="label">Глава ${chapter} «${done.name}» пройдена</span>`
                + (this.questions ? `<p>Кодовая фраза</p><b>${done.phrase}</b>
                <button class="btn-small" id="btn-phrase">${done.final ? "Забрать разбор →" : "Назвать менеджеру →"}</button>` : `<p>${chapter < CHAPTERS.length ? `Дальше: ${CHAPTERS[chapter].name}` : "Сезон 1 пройден!"}</p>`);
            const bp = $("btn-phrase");
            if (bp) bp.onclick = () => tg.open(this.hub.managerLink());
        }
        setTimeout(() => {
            if (this.state !== "over") return;
            this.show("over");
            $("arrest").hidden = true;
            for (const [id, to, delay] of counters) countUp($(id), to, delay);
        }, arrest ? 2700 : 700);
    }

    // очки = профит в USDT ×10 + пройденные метры
    score() {
        return this.usdt * 10 + Math.floor(this.distance);
    }

    // ---- управление ----------------------------------------------------------------------

    move(dir) {
        if (this.state !== "playing") return;
        const lane = Math.max(0, Math.min(2, this.lane + dir));
        if (lane === this.lane) return;
        this.prevLane = this.lane;
        this.lane = lane;
        this.ventOff = 0; // против ветра вентилятора: свайп — снова точно на полосе
        this.audio.play("swipe");
        tg.haptic("light");
    }

    jump() {
        if (this.state !== "playing" || this.jumping || this.flight) return;
        // в замедлении перед стеной свайп вверх — «выбираю ответ на своей полосе». Повторный свайп по той же стене —
        // ничего (раньше он выбирал ответ следующей стены — «двойной свайп»). После выбора 0,35 с без прыжка.
        if (this.slowmo || this.runTime < this.chooseLock) {
            const w = this.walls.find((x) => !x.answered && !x.arch);
            if (w && !w.chosen) this.chooseAnswer(w, this.lane);
            if (w || this.runTime < this.chooseLock) return;
        }
        this.jumping = true;
        this.slideLeft = 0;
        this.vy = BALANCE.jumpPower * (this.fx.honey > 0 ? 1.3 : 1); // «Рывок» — прыжок выше
        this.camKick.dip = -0.16; // камера на миг приседает и догоняет героя
        this.audio.play("swipe");
        tg.haptic("medium");
    }

    slide() {
        if (this.state !== "playing" || this.flight) return;
        if (this.jumping) this.vy = -BALANCE.jumpPower * 1.4; // быстрое приземление, как в сабвее
        this.slideLeft = BALANCE.slideTime * (this.perk.slide || 1);
        this.world.splash(this.x, 0, 20, 1.2);
        this.world.ring(this.x, -0.2, 1.7, 0.5);
        this.audio.play("swipe");
        tg.haptic("light");
    }

    setupInput() {
        document.addEventListener("keydown", (e) => {
            const k = e.code;
            if (e.repeat) return; // зажатая стрелка не должна перекидывать через полосы
            // Enter на кнопке нажимает саму кнопку — второй раз её действие не повторяем (было: «В меню» + старт)
            if (k === "Enter" && e.target.closest?.("button")) return;
            if (k === "ArrowLeft" || k === "KeyA") this.move(-1);
            else if (k === "ArrowRight" || k === "KeyD") this.move(1);
            else if (k === "ArrowUp" || k === "KeyW" || k === "Space") { e.preventDefault(); this.jump(); }
            else if (k === "ArrowDown" || k === "KeyS") this.slide();
            else if (k === "KeyE" || k === "ShiftLeft" || k === "ShiftRight") this.useSkill();
            else if (/^Digit[1-4]$/.test(k)) { const el = $("boost-bar").querySelectorAll(".bst:not(.bst-skill)")[+k.slice(5) - 1]; if (el) this.useBoost(el.dataset.id); }
            else if (k === "Escape" || k === "KeyP") this.state === "paused" ? this.resume() : this.pause();
            else if (k === "Enter" && (this.state === "over" || (this.state === "menu" && this.hub.current === "run" && $("case-open").hidden))) this.start();
        });

        // свайпы: срабатывают ещё до отпускания пальца — так отзывчивее. Ловим их и с ряда бустов внизу:
        // оттуда большой палец чаще всего и свайпает вверх — буст тогда не срабатывает (он — по тапу, см. boostTap)
        let start = null;
        const area = $("game");
        const swipeFrom = (el) => el === area || !!el.closest?.("#boost-bar");
        document.addEventListener("touchstart", (e) => {
            if (!swipeFrom(e.target)) return;
            const t = e.changedTouches[0];
            start = { x: t.clientX, y: t.clientY, done: false };
        }, { passive: true });
        document.addEventListener("touchmove", (e) => {
            if (!start || start.done) return;
            const t = e.changedTouches[0];
            const dx = t.clientX - start.x, dy = t.clientY - start.y;
            if (Math.hypot(dx, dy) < 30) return;
            start.done = true;
            this.lastSwipe = performance.now();
            if (this.wind?.state === "gust" || this.wind?.state === "inhale") return; // в порыв пальцы тапают, полосы не меняем
            if (Math.abs(dx) > Math.abs(dy)) this.move(dx > 0 ? 1 : -1);
            else if (dy < 0) this.jump();
            else this.slide();
        }, { passive: true });
        document.addEventListener("touchend", () => { start = null; }, { passive: true });
        // порыв ветра: каждое касание в любом месте экрана (и каждым пальцем) — «держусь»
        const tap = (n = 1) => {
            const w = this.wind;
            if (this.state !== "playing" || !w || (w.state !== "gust" && w.state !== "inhale")) return false;
            w.taps += n;
            tg.haptic("light");
            this.x += this.wind.side * 0.12; // откат против ветра — видно, что тап помогает
            const box = $("wind-q");
            box.classList.remove("tap"); void box.offsetWidth; box.classList.add("tap");
            return true;
        };
        // pointerdown — одно событие на палец (касание + «эмулированный» клик мыши не считаются дважды)
        document.addEventListener("pointerdown", (e) => { if (!e.target.closest("button")) tap(); });
        document.addEventListener("contextmenu", (e) => e.preventDefault());

        document.addEventListener("visibilitychange", () => { if (document.hidden) this.pause(); });

        // музыка меню — с первого касания: раньше браузер звук не даст
        const wake = () => {
            this.audio.unlock();
            if (this.audio.mode === "off") this.audio.music(this.state === "playing" ? "run" : this.state === "paused" ? "pause" : "menu");
        };
        for (const ev of ["pointerdown", "keydown", "touchstart"]) document.addEventListener(ev, wake, { once: true, capture: true });
    }

    // ---- интерфейс -----------------------------------------------------------------------

    setupUI() {
        $("btn-play").onclick = () => this.start();
        $("btn-again").onclick = () => this.start();
        $("btn-pause").onclick = () => this.pause();
        $("btn-resume").onclick = () => this.resume();
        $("btn-menu").onclick = $("btn-over-menu").onclick = () => this.toMenu();
        $("btn-appeal").onclick = () => this.appeal();
        $("btn-share").onclick = () => tg.share(
            `Я поднял ${this.usdt} USDT и набрал ${this.score()} очков в «Покорителе P2P 3.0» 🐀💸 Сможешь больше?`,
            LINKS.bot
        );
        // пока в LINKS.course заглушка — кнопку не показываем, а не ведём в несуществующий канал
        const course = LINKS.course && !/your_course_channel/.test(LINKS.course);
        $("btn-course").hidden = !course;
        $("btn-course").onclick = () => tg.open(LINKS.course);
        // иконки монет, летящих в счётчик (coinFx)
        this.flyPool = Array.from({ length: 8 }, () => {
            const el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            el.setAttribute("class", "fly-coin");
            el.innerHTML = '<use href="#ico-usdt"/>';
            document.body.append(el);
            return el;
        });
        // звук выключили — так и остаётся при следующем запуске
        let soundOff = false;
        try { soundOff = localStorage.getItem("p2p_sound") === "off"; } catch {}
        if (soundOff) this.audio.setEnabled(false);
        const soundIcon = () => {
            $("btn-sound").classList.toggle("off", !this.audio.enabled);
            $("btn-sound").setAttribute("aria-pressed", String(this.audio.enabled));
        };
        soundIcon();
        $("btn-skill").onclick = () => { if (this.boostTap()) this.useSkill(); };
        $("btn-sound").onclick = () => {
            this.audio.setEnabled(!this.audio.enabled);
            try { localStorage.setItem("p2p_sound", this.audio.enabled ? "on" : "off"); } catch {}
            soundIcon();
        };
        this.renderMenu();
    }

    renderMenu() {
        this.hub.render(); // и рекорд в шапке — там же, рядом с кошельком
    }

    show(screen) {
        for (const el of document.querySelectorAll(".screen")) el.hidden = el.id !== screen;
    }

    // HUD обновляется каждый кадр, а в DOM пишем, только когда значение поменялось: на телефоне каждая запись
    // в textContent — пересчёт вёрстки
    updateHud() {
        const c = (this.hudCache ||= {});
        const text = (id, value) => { if (c[id] !== value) $(id).textContent = c[id] = value; };
        text("hud-usdt", fmt(this.usdt));
        this.hudScore = Math.max(this.hudScore || 0, this.score()); // счёт на экране только растёт
        text("hud-score", fmt(this.hudScore));
        const hurt = this.stumble > 0 && this.state === "playing";
        if (this.hudHurt !== hurt) document.body.classList.toggle("hurt", (this.hudHurt = hurt));
        // действующие добавки: плашка цвета добавки и полоска, сколько осталось (полное время — с момента, когда
        // таймер последний раз вырос: новая баночка или монета продлевает)
        const hex = (n) => `#${n.toString(16).padStart(6, "0")}`;
        this.renderFx([
            { id: "chase", name: CHASER.hud, left: this.stumble, color: "#e3343a", danger: true },
            { id: "fly", name: POWERUPS.testo.hud, left: this.flight ? this.fx.fly : 0, color: hex(POWERUPS.testo.color) },
            { id: "x2", name: "×2", left: this.boostLeft, color: "#e9c25a" },
            { id: "magnet", name: POWERUPS.choline.hud, left: this.fx.magnet, color: hex(POWERUPS.choline.color) },
            { id: "honey", name: "Рывок", left: this.fx.honey, color: "#f0a33a" },
            { id: "shield", name: "Щит", left: this.fx.shield ? Infinity : 0, color: "#ffffff" },
            { id: "turbo", name: HERO_SKILLS[this.heroId]?.name || "Турбо", left: this.fx.turbo, color: "#3dd1ff" },
            { id: "ram", name: "Таран", left: this.ram > 0 ? Infinity : 0, color: "#ffffff" },
        ]);
    }

    renderFx(list) {
        const box = $("hud-fx");
        const els = (this.fxEls ||= {}), total = (this.fxTotal ||= {}), prev = (this.fxPrev ||= {});
        for (const f of list) {
            let el = els[f.id];
            const on = f.left > 0;
            if (!on) {
                if (el && !el.hidden) el.hidden = true;
                prev[f.id] = 0;
                continue;
            }
            if (!el) {
                el = els[f.id] = document.createElement("div");
                el.className = `fx${f.danger ? " fx-danger" : ""}`;
                el.style.setProperty("--c", f.color);
                el.innerHTML = `<span class="fx-name">${f.name}</span><b></b><i></i>`;
                box.append(el);
            }
            if (el.hidden) el.hidden = false;
            if (f.left > (prev[f.id] || 0) + 0.01) total[f.id] = f.left; // таймер вырос — новое полное время
            prev[f.id] = f.left;
            const timed = Number.isFinite(f.left);
            const secs = timed ? String(Math.ceil(f.left)) : "";
            if (el.dataset.s !== secs) el.querySelector("b").textContent = el.dataset.s = secs;
            const k = timed ? Math.max(0, Math.min(1, f.left / (total[f.id] || f.left))) : 1;
            const kk = k.toFixed(2);
            if (el.dataset.k !== kk) { el.dataset.k = kk; el.querySelector("i").style.transform = `scaleX(${kk})`; }
        }
    }

    // ---- кадр ----------------------------------------------------------------------------

    loop() {
        requestAnimationFrame(() => this.loop());
        const now = performance.now();
        if (this.world.warmQueue.length && now - (this.lastWarm || 0) > 400) this.warmUp();
        // Разделы «Герои / Кейсы / NS Store» и открытие кейса закрывают сцену: её не рисуем вовсе — на холсте
        // остаётся последний кадр. Иначе улица за затемнением дёргается, а каждый кадр сцены тормозит прокрутку.
        if (this.sceneCovered()) { this.clock.getDelta(); return; }
        this.rafCount = (this.rafCount || 0) + 1; // сколько кадров даёт экран — для measureFps
        // Потолок кадров по расписанию, а не «прошло ли N мс с прошлого»: иначе на 90 Гц из 60 выходило 45,
        // а в меню на 60 Гц из 40 — 30. Пол-интервала экрана запаса — кадр рисуем, если он ближе к сроку, чем следующий.
        const budget = this.frameBudget();
        const vsync = this.vsync ? Math.min(this.vsync, budget) : 0;
        if (this.lastRaf) this.vsync = this.vsync ? this.vsync * 0.95 + (now - this.lastRaf) * 0.05 : now - this.lastRaf;
        this.lastRaf = now;
        if (now < (this.nextFrame || 0) - vsync / 2) return; // пропускаем кадр
        this.nextFrame = now - (this.nextFrame || 0) > budget ? now + budget : this.nextFrame + budget;
        const dt = Math.min(this.clock.getDelta(), 0.05);
        this.t += dt;

        if (this.state === "fight") { // бой на той же улице: дождь и NPC живут, улица стоит; камерой правит бой
            this.world.update(dt, 0, this.t);
            this.fight?.update(dt);
            this.composer.render();
            return;
        }
        if (this.state === "playing") this.step(dt);
        else if (this.state === "over" && this.arrest) this.arrestStep(dt);
        else if (this.state === "menu") this.world.update(dt, 3 * dt, this.t); // в меню улица медленно едет
        if (this.state === "playing" || (this.state === "menu" && this.frameBudget() < 50)) this.measureFps(dt);
        // тепловой ограничитель: телефон долго держит 60 кадров — греется и сам начинает тормозить. После HEAT_AFTER с
        // игры подряд рисуем в меньшем разрешении (почти незаметно на маленьком экране), сброс — после 2 мин в меню
        if (this.tier.heat) {
            if (this.state === "playing" || this.state === "fight") this.hot = (this.hot || 0) + dt;
            else if (this.state === "menu") this.hot = Math.max(0, (this.hot || 0) - dt * (HEAT_AFTER / 120));
            const want = this.hot > HEAT_AFTER ? 0.85 : 1;
            if ((this.heatScale || 1) !== want && (want < 1 || this.state === "menu")) { this.heatScale = want; this.onResize(); }
        }

        const pose = this.state === "over" ? (this.cause === "caught" || this.cause === "cop" ? "fall" : "dead")
            : this.flight ? "fly"
            : this.state === "menu" ? "run"
            : this.slideLeft > 0 ? "slide"
            : this.jumping ? "jump"
            : this.state === "countdown" || this.state === "paused" || this.state === "bossintro" ? "idle" : "run";
        if (this.state === "menu") this.phase += dt * 6;
        animateRat(this.rat, pose, this.t, this.phase, dt, this.speed);
        this.updateStars(dt);
        this.moon.position.set(this.x - 4, 12, -14);
        this.moon.target.position.set(this.x, 0, -3);

        // в меню камера спереди (видно морду и цепь), в игре — сзади-сверху
        const cam = this.camera;
        const portrait = cam.aspect < 0.8;
        const behind = this.state === "menu" ? 0 : 1;
        const arr = this.state === "over" && this.arrest;
        this.camMix += (behind - this.camMix) * Math.min(1, dt * 2.5);
        const k = this.camMix * this.camMix * (3 - 2 * this.camMix);
        // в прыжке камера чуть поднимается, в полёте — на полвысоты: видно, что герой высоко над дорогой
        const lift = this.y * (this.flight ? 0.6 : 0.15); // в прыжке камера почти не поднимается — не «улетает» вместе с героем
        this.camY = (this.camY || 0) + (lift - (this.camY || 0)) * Math.min(1, dt * 5);
        const v = (this.camVec ||= { back: new THREE.Vector3(), front: new THREE.Vector3(), target: new THREE.Vector3(), menu: new THREE.Vector3() });
        const back = v.back.set(this.x * 0.6, (portrait ? 3.3 : 2.5) + this.camY, portrait ? 5.0 : 4.4);
        const front = v.front.set(0.7, 1.5, portrait ? -3.6 : -3.0);
        const target = v.target.set(this.x * 0.4, 0.9 + this.camY * (this.flight ? 1.25 : 0.85), -8)
            .lerp(v.menu.set(0, portrait ? 0.5 : 1.0, 0), 1 - k);
        // по дуге сбоку, чтобы камера не проходила сквозь крыса
        cam.position.lerpVectors(front, back, k);
        if (this.camFocus > 0.01 && this.wind) { // Ислам дует: камера поворачивается к нему и сдвигается в его сторону
            const n = this.wind.npc.position;
            // смотрим между Исламом и героем, а сама камера отходит в сторону сноса — в кадре оба
            // на вдохе — почти на Ислама и с приближением, в порыв — между ним и героем
            const inh = this.wind.state === "inhale" ? 1 : 0;
            this.camInhale = (this.camInhale || 0) + (inh - (this.camInhale || 0)) * Math.min(1, dt * 3);
            target.lerp((v.focus ||= new THREE.Vector3()).set((n.x + this.x) / 2, 1.3, n.z * 0.6), 0.35 * this.camFocus)
                .lerp(v.focus.set(n.x, 1.5, n.z), 0.45 * this.camInhale);
            cam.position.x += -this.wind.side * 0.9 * this.camFocus;
            cam.position.z += 0.6 * this.camFocus;
        }
        cam.position.x += Math.sin(k * Math.PI) * 4;
        // рывки камеры: присед возвращается пружиной, тряска и угол обзора гаснут
        const kick = this.camKick, calm = this.calm ? 0.3 : 1;
        kick.dip += (0 - kick.dip) * Math.min(1, dt * 7);
        cam.position.y += kick.dip * calm;
        if (kick.shake > 0) {
            kick.shake = Math.max(0, kick.shake - dt);
            const a = Math.min(1, kick.shake / 0.35) * 0.14 * calm;
            cam.position.x += (Math.random() - 0.5) * 2 * a;
            cam.position.y += (Math.random() - 0.5) * 2 * a;
        }
        if (kick.fov > 0.01 || cam.fov !== this.baseFov) {
            kick.fov += (0 - kick.fov) * Math.min(1, dt * 6);
            if (kick.fov <= 0.01) kick.fov = 0;
            cam.fov = this.baseFov + kick.fov * calm;
            cam.updateProjectionMatrix();
        }
        if (this.camFocus > 0.01 && this.wind) { // приближение на Ислама
            cam.fov -= 14 * (this.camInhale || 0) * this.camFocus;
            cam.updateProjectionMatrix();
            this.zoomed = true;
        } else if (this.zoomed) { this.zoomed = false; cam.fov = this.baseFov; cam.updateProjectionMatrix(); }
        if (arr) { // задержание: камера медленно облетает героя и Мизулину сбоку, низко
            // плавно: въезд за 0.8 с, облёт ~2.5 с с замедлением и остановка (дальше кадров мало — камера уже стоит)
            const a = this.arrest, sm = (x) => x * x * (3 - 2 * x);
            const k = sm(Math.min(1, a.t / 0.8)), ang = 0.5 + 0.8 * sm(Math.min(1, a.t / 2.6));
            cam.position.lerp((v.focus2 ||= new THREE.Vector3()).set(this.x - Math.sin(ang) * 3.4 * a.side, 1.4, 0.4 + Math.cos(ang) * 3.4), k);
            target.lerp((v.focus3 ||= new THREE.Vector3()).set(this.x + a.side * 0.35, 0.5, -0.35), k);
        }
        cam.lookAt(target);
        this.rim.position.set(this.x, 1.6 + this.y, behind ? 1.6 : -1.6);
        this.rim.intensity = behind ? 1.0 : 0.35; // спереди мягче, чтобы морду не пересвечивало

        this.composer.render();
    }

    // Графика: отражения на асфальте, тени и свечение — самое дорогое (QUALITY_TIERS в config.js)
    setQuality(level) {
        const prevShadows = this.tier.shadows;
        this.quality = level;
        this.tier = QUALITY_TIERS[level];
        if (this.tier.reflections) {
            const w = Math.min(720, Math.round(window.innerWidth * this.renderer.getPixelRatio() * 0.6));
            this.world.enableReflections(w, Math.round(w * window.innerHeight / window.innerWidth));
        } else {
            this.world.disableReflections();
        }
        this.renderer.shadowMap.enabled = this.tier.shadows;
        this.moon.castShadow = this.tier.shadows;
        if (prevShadows !== this.tier.shadows) { // шейдеры с тенями и без — разные, пересобрать
            this.scene.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; });
        }
        this.bloom.strength = this.tier.bloom ? 0.8 : 0;
        this.world.setTier(this.tier); // дождь и лишние живые NPC — по новому уровню
        // дальше — туман: не рисуем то, чего всё равно не видно
        this.camera.far = this.tier.far;
        this.scene.fog.far = this.tier.far - 12;
        this.camera.updateProjectionMatrix();
        this.onResize();
    }

    // настройка: music | sfx | vibro (вкл/выкл) или quality (auto | high | medium | low)
    setSetting(key, value) {
        this.settings[key] = value;
        try { localStorage.setItem("p2p_settings", JSON.stringify(this.settings)); } catch {}
        this.applySettings();
        if (key === "quality") {
            this.resScale = 1;
            const level = value === "auto" ? this.autoQuality : value;
            if (level !== this.quality) this.setQuality(level); else this.onResize();
        }
    }

    // режим «с вопросами» (по умолчанию) или «просто бежать»
    get questions() { return this.settings.questions !== false; }

    applySettings() {
        const s = this.settings;
        this.audio.setMusic(s.music !== false);
        this.audio.setSfx(s.sfx !== false);
        tg.vibro = s.vibro !== false;
    }

    // Шейдеры и текстуры новых моделей собираем сразу после загрузки (обычно ещё в меню), а не в момент,
    // когда объект впервые показался в забеге, — иначе там рывок на десятки и сотни миллисекунд.
    warmUp() {
        this.lastWarm = performance.now();
        const g = new THREE.Group();
        for (const o of this.world.warmQueue.splice(0)) g.add(o);
        g.position.set(0, 0, -12);
        this.scene.add(g);
        this.renderer.compile(this.scene, this.camera);
        g.traverse((o) => {
            if (!o.material) return;
            for (const m of [].concat(o.material)) {
                for (const key of ["map", "normalMap", "roughnessMap", "emissiveMap", "metalnessMap"]) if (m[key]?.image) this.renderer.initTexture(m[key]);
            }
        });
        this.scene.remove(g);
    }

    // В «auto» меряем время кадра в забеге: если стабильно не успеваем — графику на ступень ниже
    measureFps(dt) {
        if (QUALITY !== "auto" || (this.settings.quality && this.settings.quality !== "auto") || (this.quality === "low" && this.resScale <= 0.7) || (this.state === "playing" && this.runTime < 1.5)) return;
        if (!this.fpsFrames) { this.fpsStart = performance.now(); this.fpsRaf = this.rafCount; }
        this.fpsFrames = (this.fpsFrames || 0) + 1;
        this.fpsTime = (this.fpsTime || 0) + dt;
        if (this.fpsTime < 3) return;
        const fps = this.fpsFrames / this.fpsTime;
        // экран сам может давать меньше потолка (30 Гц в режиме энергосбережения) — это не лаг
        const screenHz = (this.rafCount - this.fpsRaf) / ((performance.now() - this.fpsStart) / 1000);
        this.fpsFrames = this.fpsTime = 0;
        const target = Math.min(1000 / this.frameBudget(), screenHz);
        if (fps >= target * 0.8) return;
        // сначала меньше пикселей (без рывка), потом — графика на ступень ниже (пересборка шейдеров)
        if (this.resScale > 0.7) {
            this.resScale = Math.max(0.7, this.resScale - 0.15);
            this.onResize();
        } else {
            this.resScale = 0.85;
            this.setQuality(this.quality === "high" ? "medium" : "low");
        }
    }

    // Потолок кадров: в забеге 60 (на 120-герцовых экранах иначе было бы 120), в меню 30–40,
    // когда сцену закрывает вкладка, пауза или проигрыш — 12. Меньше кадров — меньше нагрев.
    frameBudget() {
        // бой: камера почти стоит, а телефон греется — на средней и слабой графике хватает 40 и 30 кадров
        if (this.state === "fight") return 1000 / Math.min(this.tier.fps[0], this.tier.fight || 60);
        if (this.state === "playing" || this.state === "countdown" || this.state === "bossintro") return 1000 / this.tier.fps[0];
        if (this.state === "over" && this.t - this.overAt < 0.7) return 1000 / this.tier.fps[0]; // тряска при проигрыше — плавно
        if (this.state === "over" && this.arrest && this.arrest.t < 2.8) return 1000 / Math.min(this.tier.fps[0], 45); // задержание: камера облетает — плавно
        if (this.state === "menu" && this.hub?.current === "run") return 1000 / this.tier.fps[1];
        return 1000 / 12;
    }

    // сцену целиком закрывает фон разделов («Герои», «Кейсы», «NS Store», «Главы») или экран открытия кейса
    sceneCovered() {
        return this.state === "menu" && ((this.hub?.current && this.hub.current !== "run") || !$("case-open").hidden);
    }

    // Выбор персонажа: модель грузится один раз, клипы прыжка и подката подгоняются под их длительность
    selectHero(id) {
        this.heroId = id;
        try { localStorage.setItem("p2p_hero", id); } catch {}
        for (const b of document.querySelectorAll(".hero")) b.classList.toggle("active", b.dataset.id === id);
        const cfg = CHARACTERS.find((c) => c.id === id);
        const air = (2 * BALANCE.jumpPower) / BALANCE.gravity;
        const opts = { ...cfg, durations: { jump: air + 0.35, slide: BALANCE.slideTime * (HERO_PERKS[id]?.slide || 1) + 0.2 } };
        // кнопку «Забег» (плитка 01) ведёт главная: пока модель грузится, в забег не пускаем
        const apply = (gltf) => {
            if (this.heroId !== id) return;
            attachModel(this.rat, gltf, opts);
            this.showRat(true);
            this.heroLoading = false;
            this.hub?.updatePlay();
            releaseQueue(); // герой на месте — теперь можно грузить препятствия и витрины
        };
        if (this.heroes[id]) return apply(this.heroes[id]);
        this.heroLoading = true;
        this.hub?.updatePlay();
        loadModel(
            cfg.url,
            (gltf) => { this.heroes[id] = gltf; apply(gltf); },
            (e) => {
                console.warn("[hero] не загрузилась модель", cfg.url, e);
                if (this.heroId !== id) return;
                this.showRat(true); // запасной вариант — крыс из примитивов
                this.heroLoading = false;
                this.hub?.updatePlay();
                releaseQueue();
            }
        );
    }

    showRat(on) {
        this.rat.visible = on;
        this.rat.userData.blob.visible = on;
    }

    step(dt) {
        this.runTime += dt;
        this.speed = Math.min(BALANCE.speedMax, BALANCE.speedStart + this.runTime * BALANCE.speedRamp);
        if (this.slowLeft > 0) { // споткнулся — пару шагов медленнее
            this.slowLeft -= dt;
            this.speed *= 0.55 + 0.45 * (1 - this.slowLeft / BALANCE.stumbleSlow);
        }
        if (this.fx.turbo > 0) this.speed *= 1.3; // «Напор» / «Попутный ветер»
        if (this.fx.honey > 0) this.speed *= 1.15; // «Рывок»
        if (this.bossFight) this.speed = this.bossFight.cfg.speed; // в бою — ровная скорость босса
        // перед стеной-возражением — почти остановка, пока игрок не выберет ответ (нажал карточку или свайп вверх);
        // 8 с не выбирает — бежим дальше
        const near = this.walls.find((w) => !w.answered && !w.chosen && !w.arch);
        const nz = near ? near.plates[0].position.z : -1e9;
        const slow = nz > -22 && nz < -1.5;
        if (slow) {
            near.waited = (near.waited || 0) + dt;
            if (near.waited > 8) this.chooseAnswer(near, this.lane);
        }
        // Ислам вдыхает — почти стоим (камера на нём), дует — вполовину скорости
        const windSlow = this.wind?.state === "inhale" ? 0.25 : this.wind?.state === "gust" ? 0.45 : 1;
        const ventSlow = this.vent?.state === "blow" ? VENT.slow : 1; // в ветре вентилятора — тяжелее бежать
        const slowTo = slow ? 0.08 : Math.min(windSlow, ventSlow);
        this.slowK = (this.slowK ?? 1) + (slowTo - (this.slowK ?? 1)) * Math.min(1, dt * (slowTo < 1 ? 5 : 3));
        this.speed *= this.slowK;
        if (this.slowmo !== slow) { this.slowmo = slow; document.body.classList.toggle("slowmo", slow); $("wq-hint").textContent = slow ? "Нажми на ответ — или встань на полосу и свайпни вверх" : "Беги в правильный ответ"; }
        const move = this.speed * dt;
        this.distance += move;
        const prevStep = Math.floor(this.phase / Math.PI);
        this.phase += dt * this.speed * 0.95;
        // брызги из-под лап на каждом шаге
        if (!this.jumping && this.slideLeft <= 0 && Math.floor(this.phase / Math.PI) !== prevStep) {
            this.world.splash(this.x + (prevStep % 2 ? 0.13 : -0.13), 0, 3, 0.5);
        }

        // спавн рядов: чем дальше — тем плотнее и злее
        const difficulty = Math.min(1, this.runTime / 90);
        this.nextRowZ += move;
        const quiet = this.bossCalm || this.bossFight; // перед боссом и в бою: ни рядов, ни стен, ни Ислама (и его вентилятора)
        if (quiet) {
            this.nextRowZ = Math.min(this.nextRowZ, SPAWN_Z - 1);
            this.nextWallAt = Math.max(this.nextWallAt, this.distance + 140);
            this.nextWindAt = Math.max(this.nextWindAt, this.distance + 220);
            this.nextVentAt = Math.max(this.nextVentAt, this.distance + 260);
        }
        while (this.nextRowZ > SPAWN_Z) {
            this.world.spawnRow(this.nextRowZ, difficulty, this.speed);
            const gap = BALANCE.rowGapStart - (BALANCE.rowGapStart - BALANCE.rowGapMin) * difficulty;
            this.nextRowZ -= gap * (0.85 + Math.random() * 0.4);
        }
        // в полёте стены не ставим (их бы пролетели, не ответив) — поставим сразу после приземления
        if (this.flight) this.nextWallAt = Math.max(this.nextWallAt, this.distance - SPAWN_Z); // срок не «протухает» — после посадки стена встанет вдали, а не за спиной
        else if (!quiet && this.distance - SPAWN_Z >= this.nextWallAt) this.questions ? this.spawnWall() : this.spawnArch();
        // стена-вопрос впереди, а герой летит — садимся заранее, чтобы успеть ответить
        if (this.flight && this.flight.e < this.flight.dur && this.walls.some((w) => !w.answered && !w.arch && w.plates[0].position.z > -55)) {
            this.flight.dur = this.flight.e;
            this.fx.fly = Math.min(this.fx.fly, 0.6);
            this.hub.toast("Вопрос впереди — приземляемся");
        }
        if (!quiet && this.distance - SPAWN_Z >= this.nextWindAt) this.spawnWind();
        if (!quiet && this.distance - SPAWN_Z >= this.nextVentAt) this.spawnVent();
        this.watchBoss(dt, move);
        this.world.update(dt, move, this.t);
        this.watchWall();
        this.watchWind(dt);
        this.watchVent(dt);
        // инспектор свистит, когда пробегаешь мимо поста ДПС
        for (const o of this.world.obstacles) {
            if (!o.userData.police || o.userData.whistled || o.position.z < -5) continue;
            o.userData.whistled = true;
            this.audio.play("whistle");
        }

        // движение крыса
        if (this.windSlide) { // сносит ветром Ислама: скольжение поперёк полос, полоса — ближайшая
            const L = this.world.lanes;
            this.x = Math.max(L[0], Math.min(L[2], this.x + this.windSlide * dt));
            this.lane = L.reduce((best, lx, i) => (Math.abs(lx - this.x) < Math.abs(L[best] - this.x) ? i : best), 0);
            this.sprayIn = (this.sprayIn || 0) - dt;
            if (this.y === 0 && this.sprayIn <= 0) { this.world.spray(this.x, 0); this.sprayIn = 0.05; }
        }
        // «Ислам вентилирует»: ровно сносит от Ислама — набежало полполосы, и герой уже на соседней;
        // у бордюра прижимает и держит. Свайп (move) обнуляет снос — снова точно на полосе
        if (this.ventPush) {
            const L = this.world.lanes, half = (L[1] - L[0]) / 2;
            this.ventOff += this.ventPush * dt;
            const dir = Math.sign(this.ventOff);
            if (Math.abs(this.ventOff) >= half) {
                const next = this.lane + dir;
                if (next >= 0 && next <= 2) { this.prevLane = this.lane; this.lane = next; this.ventOff -= dir * half * 2; tg.haptic("light"); }
                else this.ventOff = dir * half * 0.65;
            }
        } else if (this.ventOff) this.ventOff *= Math.max(0, 1 - dt * 6); // ветер стих — встаёт на полосу
        const targetX = this.world.lanes[this.lane] + (this.ventOff || 0);
        if (!this.windSlide) this.x += (targetX - this.x) * Math.min(1, dt * 18 * (this.perk.lane || 1));
        if (this.flight) this.flyStep(dt);
        if (this.jumping) {
            this.vy -= BALANCE.gravity * dt;
            this.y += this.vy * dt;
            if (this.y <= 0) {
                this.y = 0;
                this.jumping = false;
                this.world.splash(this.x, 0, 16);
                this.world.ring(this.x, 0, 1.1, 0.35);
            }
        }
        if (this.slideLeft > 0) {
            this.slideLeft -= dt;
            this.sprayIn = (this.sprayIn || 0) - dt;
            if (!this.jumping && this.sprayIn <= 0) { this.world.spray(this.x, 0); this.sprayIn = 0.04; }
        }
        this.world.playerX = this.x;
        this.rat.position.set(this.x, this.y, 0);
        this.rat.rotation.z = (this.x - targetX) * 0.25 - ((this.windSlide || 0) * 0.09 + (this.ventPush || 0) * 0.14); // наклон при перестроении и против ветра
        const blob = this.rat.userData.blob;
        blob.position.x = this.x;
        blob.scale.setScalar(1 - Math.min(0.5, this.y * 0.2));

        if (this.stumble > 0) this.chase(dt);
        else if (this.storyChasing()) this.storyChaseStep(dt);
        if (this.boostLeft > 0) this.boostLeft -= dt;
        for (const k of ["magnet", "honey", "safe", "turbo"]) if (this.fx[k] > 0) this.fx[k] -= dt;
        if (this.windCalm > 0) this.windCalm -= dt;
        this.collide(dt, move);
        this.updateHud();
    }

    // Первый удар: врезался сбоку при перестроении — отлетаешь на свою полосу, спереди — препятствие сбито.
    // Дальше BALANCE.stumbleTime секунд за спиной ДПС, и второй удар заканчивает забег.
    hitOnce(o) {
        const target = this.world.lanes[this.lane];
        const side = Math.abs(target - this.x) > 0.35 && Math.abs(o.position.x - target) < 0.3;
        if (side) this.lane = this.prevLane;
        else { o.visible = false; o.userData.type = "decor"; }
        this.stumble = BALANCE.stumbleTime * (this.grudge ? CHASE_GRUDGE.speed : 1); // «из принципа» — дольше на хвосте
        this.starsT = 2.2; // звёздочки над головой — «оглушило»
        this.slowLeft = BALANCE.stumbleSlow;
        this.fx.safe = Math.max(this.fx.safe, 1);
        this.audio.play("hit");
        this.audio.play("whistle");
        tg.haptic("warning");
        this.kick(0.35, 7);
        this.world.splash(this.x, 0, 22, 1.3);
        this.ensureChaser();
        this.chaser.visible = true;
        if (this.grudge) {
            this.speech("Мизулина", CHASE_GRUDGE.lines.stumble, 2200);
            const run = this.runId;
            setTimeout(() => { if (this.runId === run && this.state === "playing" && this.stumble > 0) this.speech("Мизулина", pick(CHASE_GRUDGE.lines.run), 2200); }, 2300);
            if (!this.grudgeTold) { this.grudgeTold = true; setTimeout(() => this.runId === run && this.state === "playing" && this.gorilla(CHASE_GRUDGE.lines.gorilla, false, 3000), 4600); }
        } else if (!this.chaserSaid) { // первая погоня за забег — Мизулина представляется (после подсказки стены)
            this.chaserSaid = true;
            const run = this.runId;
            setTimeout(() => { if (this.runId === run && this.state === "playing" && this.stumble > 0) this.hub.toast(`Мизулина: «${CHASER_LINES.start}»`); }, 1400);
        }
        this.chaser.position.set(this.x, 0, 7); // выбегает из-за камеры
        this.chaser.userData.side = this.lane === 2 ? -1 : 1; // сбоку-сзади, чтобы не закрывать героя
    }

    // бежит Мизулина (CHASER); пока не загрузилась — живой инспектор, а без него спрайт. Появилась модель лучше — меняем
    ensureChaser() {
        const better = this.world.chaserModel ? !this.chaser?.userData.chaser : this.world.officer && !this.chaser?.userData.mixer;
        if (!this.chaser || better) {
            if (this.chaser) this.world.dropObstacle(this.chaser); // убрать со сцены и освободить скелет
            this.chaser = this.world.makeChaser() || this.world.makeOfficer(POLICE_OFFICER.run);
            if (!this.chaser) {
                this.chaser = this.world.makeSprite("cop");
                this.chaser.scale.setScalar(0.9);
            }
            this.scene.add(this.chaser);
            this.chaser.userData.side ??= 1;
        }
        return this.chaser;
    }

    // Глава 1 (v2.6): Мизулина бежит следом всю главу, держится в паре метров за спиной (удар — подбегает ближе, как обычно)
    storyChaseStep(dt) {
        const c = this.ensureChaser();
        if (!c.visible) { c.visible = true; c.position.set(this.x, 0, 8); c.userData.side = 1; }
        const z = this.storyCatch ? 0.9 : 4.2;
        c.position.z += (z - c.position.z) * Math.min(1, dt * (this.storyCatch ? 3 : 1.5));
        c.position.x += (this.x + c.userData.side * (this.storyCatch ? 0.5 : 1.0) - c.position.x) * Math.min(1, dt * 4);
        if (c.userData.mixer) { c.rotation.y = Math.PI; c.userData.mixer.update(dt * Math.max(0.8, this.speed / 14)); }
    }

    // Звёздочки над головой после удара: пять жёлтых звёзд кружат вокруг головы и гаснут
    updateStars(dt) {
        const on = (this.starsT || 0) > 0 && (this.state === "playing" || this.state === "over" || this.state === "paused");
        if (!on) { if (this.stars) this.stars.visible = false; return; }
        if (!this.stars) {
            const c = document.createElement("canvas");
            c.width = c.height = 64;
            const g = c.getContext("2d");
            g.translate(32, 32);
            g.beginPath();
            for (let i = 0; i < 10; i++) { const r = i % 2 ? 11 : 28, a = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
            g.closePath();
            g.fillStyle = "#ffd94a"; g.shadowColor = "#fff2a0"; g.shadowBlur = 8; g.fill();
            g.lineWidth = 3; g.strokeStyle = "#a86a00"; g.stroke();
            const tex = new THREE.CanvasTexture(c);
            tex.encoding = THREE.sRGBEncoding;
            const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, toneMapped: false });
            this.stars = new THREE.Group();
            for (let i = 0; i < 5; i++) { const sp = new THREE.Sprite(mat); sp.scale.setScalar(0.24); this.stars.add(sp); }
            this.stars.userData.mat = mat;
            this.scene.add(this.stars);
        }
        this.starsT -= dt;
        const st = this.stars, p = this.rat.position, k = Math.min(1, this.starsT / 0.4);
        st.visible = true;
        st.position.set(p.x, p.y + 1.85, p.z);
        st.userData.mat.opacity = k;
        st.children.forEach((sp, i) => {
            const a = this.t * 5 + (i / 5) * Math.PI * 2;
            sp.position.set(Math.cos(a) * 0.38, Math.sin(this.t * 7 + i) * 0.05, Math.sin(a) * 0.38);
            sp.material.rotation = this.t * 4 + i;
        });
    }

    // удар: тряска камеры на shake секунд и рывок угла обзора на fov градусов
    kick(shake, fov) {
        this.camKick.shake = Math.max(this.camKick.shake, shake);
        this.camKick.fov = Math.max(this.camKick.fov, fov);
    }

    // Монета USDT: вспышка на её месте, а копия-иконка летит в счётчик, и он подпрыгивает.
    // Иконки — из пула: с холином монеты собираются пачкой, лишние просто не летят.
    coinFx(c) {
        this.world.flash(c.position);
        const chip = $("hud-usdt").parentElement;
        const el = !this.calm && this.flyPool.find((e) => !e.busy);
        if (!el) return this.pulseChip(chip);
        const v = (this.coinVec ||= new THREE.Vector3()).copy(c.position).project(this.camera);
        const x0 = (v.x + 1) / 2 * window.innerWidth, y0 = (1 - v.y) / 2 * window.innerHeight;
        if (!this.hudCoin) { // где иконка USDT в счётчике — один раз (сбрасывается в onResize)
            const r = chip.querySelector("svg").getBoundingClientRect();
            this.hudCoin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }
        const { x, y } = this.hudCoin;
        el.busy = true;
        el.style.display = "block";
        const a = el.animate([
            { transform: `translate(${x0}px, ${y0}px) translate(-50%, -50%) scale(1.15)` },
            { transform: `translate(${x}px, ${y}px) translate(-50%, -50%) scale(0.7)` },
        ], { duration: 420, easing: "cubic-bezier(.55, 0, .75, .45)" });
        a.onfinish = a.oncancel = () => { el.busy = false; el.style.display = "none"; this.pulseChip(chip); };
    }

    pulseChip(chip) {
        const now = performance.now();
        if (this.calm || now - (this.lastPulse || 0) < 120) return;
        this.lastPulse = now;
        chip.animate([{ transform: "scale(1)" }, { transform: "scale(1.14)" }, { transform: "scale(1)" }], { duration: 220, easing: "ease-out" });
    }

    // ДПС бежит за спиной, пока не отстанет
    chase(dt) {
        this.stumble -= dt;
        const c = this.chaser;
        const z = this.stumble > 1 ? 1.7 : 1.7 + (1 - this.stumble) * 8; // в конце отстаёт
        c.position.z += (z - c.position.z) * Math.min(1, dt * 4);
        c.position.x += (this.x + c.userData.side * 0.95 - c.position.x) * Math.min(1, dt * 5);
        if (c.userData.mixer) { // бежит туда же, куда герой
            c.rotation.y = Math.PI;
            c.userData.mixer.update(dt * Math.max(0.8, this.speed / 14));
        } else {
            c.position.y = Math.abs(Math.sin(this.t * 11)) * 0.12;
            c.rotation.y = Math.atan2(this.camera.position.x - c.position.x, this.camera.position.z - c.position.z);
        }
        if (this.stumble <= 0) { this.stumble = 0; c.visible = this.storyChasing(); }
    }

    // ---- баночки: тестобустер (полёт) и холин (магнит) ----
    powerUp(kind) {
        const p = POWERUPS[kind];
        this.audio.play("boost");
        tg.haptic("success");
        this.hub.toast(`${p.name}: ${p.text}`);
        if (kind === "choline") this.fx.magnet = Math.max(this.fx.magnet, p.time);
        if (kind === "testo") this.fly(p.time);
    }

    // Тестобустер: присед и толчок (TAKEOFF с), полёт в верхней точке клипа, спуск (LAND_AIR) и приземление
    // в присед (LAND_GROUND) — кадры клипа из flyClip героя. Над дорогой — дорожка USDT, полоса иногда меняется.
    fly(time) {
        const first = !this.flight;
        if (first) this.flight = { e: 0, dur: time };
        else this.flight.dur = Math.max(this.flight.dur, this.flight.e + time); // ещё баночка в полёте — дольше
        this.fx.fly = time;
        this.world.noPickups = true;
        if (!first) return;
        const h = POWERUPS.testo.height + 0.5;
        const len = Math.max(this.speed || 0, BALANCE.speedStart) * time;
        let lane = this.lane;
        for (let z = -12, i = 0; z > -len + 4; z -= 2.2, i++) {
            if (i && i % 8 === 0) lane = Math.max(0, Math.min(2, lane + (Math.random() < 0.5 ? -1 : 1)));
            this.world.addCoin(lane, z, h);
        }
    }

    flyStep(dt) {
        const c = CHARACTERS.find((h) => h.id === this.heroId)?.flyClip || { start: 1.05, launch: 1.33, peak: 1.83, touch: 2.33, end: 2.85 };
        const TAKEOFF = 0.75, LAND_AIR = 0.6, LAND_GROUND = c.ground ?? 0.4;
        const f = this.flight, H = POWERUPS.testo.height;
        const lerp = (a, b, k) => a + (b - a) * Math.min(1, Math.max(0, k));
        const ease = (k) => k * k * (3 - 2 * k);
        f.e += dt;
        this.jumping = false;
        this.slideLeft = 0;
        if (c.loop) { // клип крутится сам (плавание): только высота — взлёт, полёт, спуск
            if (f.e < TAKEOFF) this.y = H * ease(f.e / TAKEOFF);
            else if (f.e < f.dur) this.y = H + Math.sin((f.e - TAKEOFF) * 3) * 0.12;
            else if (f.e < f.dur + LAND_AIR) { const k = (f.e - f.dur) / LAND_AIR; this.y = H * (1 - k * k); }
            else {
                this.y = 0;
                this.world.splash(this.x, 0, 24, 1.3);
                this.fx.safe = Math.max(this.fx.safe, 1.2);
                this.flight = null;
                this.fx.fly = 0;
                this.world.noPickups = false;
                return;
            }
            this.fx.fly = Math.max(0, f.dur + LAND_AIR - f.e);
            this.rat.userData.clipT = null;
            return;
        }
        let clipT;
        if (f.e < TAKEOFF) { // присед, толчок, набор высоты
            clipT = lerp(c.start, c.peak, f.e / TAKEOFF);
            this.y = H * ease(Math.min(1, Math.max(0, (clipT - c.launch) / (c.peak - c.launch))));
        } else if (f.e < f.dur) { // летит, чуть покачиваясь
            clipT = c.peak;
            this.y = H + Math.sin((f.e - TAKEOFF) * 3) * 0.12;
        } else if (f.e < f.dur + LAND_AIR) { // спуск: всё быстрее к земле
            const k = (f.e - f.dur) / LAND_AIR;
            clipT = lerp(c.peak, c.touch, k);
            this.y = H * (1 - k * k);
        } else if (f.e < f.dur + LAND_AIR + LAND_GROUND) { // приземлился в присед и встаёт
            if (this.y > 0) {
                this.world.splash(this.x, 0, 24, 1.3);
                this.world.ring(this.x, 0, 2.8, 0.6);
                this.camKick.dip = -0.35;
                tg.haptic("medium");
                this.fx.safe = Math.max(this.fx.safe, 1.2); // фора, чтобы не сесть на препятствие
            }
            this.y = 0;
            clipT = lerp(c.touch, c.end, (f.e - f.dur - LAND_AIR) / LAND_GROUND);
        } else { // дальше бежит
            this.flight = null;
            this.fx.fly = 0;
            this.rat.userData.clipT = null;
            this.world.noPickups = false;
            return;
        }
        this.fx.fly = Math.max(0, f.dur + LAND_AIR - f.e); // в воздухе — препятствия не страшны
        this.rat.userData.clipT = clipT;
    }

    // ---- стены-возражения -------------------------------------------------------------------
    // Вопрос текущей главы (её общая стена) — с долей WALLS.chapterWall, иначе случайный из банка, не повторяя прошлый
    spawnWall() {
        if (this.story && !this.storyOn) return this.spawnStoryWall();
        const z = -(this.nextWallAt - this.distance);
        const [a, b] = WALLS.every;
        // старый экзамен на ~900 м убран: экзамен Инакова — часть финального боя (spawnExamWall)
        this.nextWallAt += a + Math.random() * (b - a);
        const chWall = CHAPTERS[Math.min(this.profile.chapter().index, CHAPTERS.length - 1)].wall;
        const pool = QUESTIONS.filter((q) => q !== this.lastQ);
        const q = chWall && Math.random() < WALLS.chapterWall ? QUESTIONS.find((x) => x.id === chWall) : pick(pool);
        this.lastQ = q;
        const order = [0, 1, 2].sort(() => Math.random() - 0.5); // таблички перемешиваются: order[полоса] = номер ответа
        const wall = this.world.addWall(q, order.map((i) => q.a[i]), order.indexOf(0), z);
        wall.boss = 0;
        this.walls.push(wall);
        this.world.noCars = true;
        this.nextRowZ = Math.min(this.nextRowZ, z - 36); // следующий ряд — не раньше чем через 36 м после стены
    }

    // ---- босс главы ----------------------------------------------------------------------------
    // Цель главы набрана (с учётом незачисленного в этом забеге) — тишина BOSS_FIGHT.calm метров, потом бой:
    // босс стоит впереди лицом к герою и бросает препятствия на полосы (перед броском — красная полоса),
    // на свободной полосе — козыри. Собрал cfg.need козырей — победа, глава засчитана. Поймали — босс ждёт.
    watchBoss(dt, move) {
        return this.watchStory(); // боссы глав выключены: один босс — Павел Инаков в бою 1 на 1 (старый код ниже не используется)
        const p = this.profile;
        if (!this.bossFight && !this.bossCalm && !this.bossTried) {
            const ch = p.chapter();
            const cfg = CHAPTER_BOSSES[ch.index];
            const pending = ch.index < CHAPTERS.length && !ch.done && cfg;
            const runEarned = this.usdt - this.credited.usdt;
            const ready = pending && (this.bossPendingAtStart ? this.distance >= BOSS_FIGHT.waitAt : p.data.earned + runEarned >= ch.goal);
            if (ready) {
                this.bossCalm = { left: BOSS_FIGHT.calm, i: ch.index };
                this.bossTried = true;
                this.preloadBoss(cfg);
                this.hub.toast(`${cfg.name} впереди. Готовься!`);
            }
        }
        if (this.bossCalm) {
            this.bossCalm.left -= move;
            if (this.bossCalm.left <= 0 && !this.walls.length) this.startBossFight(this.bossCalm.i);
            return;
        }
        const f = this.bossFight;
        if (!f) return;
        f.t += dt;
        // босс держится впереди и переходит между полосами
        if (f.model) {
            f.sway += dt;
            const tx = this.world.lanes[f.lane];
            f.model.position.x += (tx - f.model.position.x) * Math.min(1, dt * 4);
            f.model.position.z = -16;
            f.model.userData.mixer?.update(dt);
        }
        for (const w of f.warns) {
            w.t -= dt;
            w.el.style.opacity = String(0.35 + 0.35 * Math.abs(Math.sin(w.t * 14)));
            if (w.t <= 0) {
                this.world.addObstacle(f.cfg.throw, w.lane, BOSS_FIGHT.throwZ);
                w.el.remove();
            }
        }
        f.warns = f.warns.filter((w) => w.t > 0);
        // экзамен Инакова: по стене на каждую треть боя (если прошлая ещё стояла — догоняем)
        if (f.cfg.final && this.questions && this.boss && this.boss.n < f.phase + 1 && !this.walls.length && f.t > 1.2) this.spawnExamWall();
        if (this.walls.length) return; // пока стоит стена, босс не бросает
        f.next -= dt;
        if (f.next <= 0) this.bossThrow();
    }

    preloadBoss(cfg) {
        this.bossModels ||= {};
        if (!cfg.model || cfg.id === "inspector" || this.bossModels[cfg.id] !== undefined) return;
        this.bossModels[cfg.id] = null;
        loadModel(this.world.lite ? this.world.lite(cfg.model) : cfg.model,
            (gltf) => { this.bossModels[cfg.id] = this.world.fitRig(gltf, cfg.height || 1.8); },
            () => { this.bossModels[cfg.id] = false; });
    }

    makeBossModel(cfg) {
        let m = null;
        if (cfg.id === "inspector") m = this.world.makeChaser();
        else if (this.bossModels?.[cfg.id]) m = this.world.rig(this.bossModels[cfg.id], cfg.clip || "run", { boss: true });
        if (!m) { // модели нет (Юрец) или не загрузилась — плашка с портретом
            const tex = new THREE.TextureLoader().load(cfg.portrait || BOSS.portrait);
            tex.encoding = THREE.sRGBEncoding; // three.js r149: colorSpace появился только в r152 — иначе портрет блёклый
            m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, fog: false }));
            m.scale.set(2.2, 2.2, 1);
            m.position.y = 1.5;
            m.userData.placeholder = true;
            const g = new THREE.Group();
            g.add(m);
            const ring = new THREE.Mesh(new THREE.RingGeometry(1.15, 1.3, 40), new THREE.MeshBasicMaterial({ color: 0xe3343a, fog: false }));
            ring.position.y = 1.5;
            g.add(ring);
            m = g;
            m.userData.placeholder = true;
        } else m.rotation.y = Math.PI; // лицом к герою (модели смотрят по ходу бега)
        m.position.set(this.world.lanes[1], 0, -16);
        this.scene.add(m);
        return m;
    }

    startBossFight(i) {
        const cfg = CHAPTER_BOSSES[i];
        this.bossCalm = null;
        this.bossFight = { i, cfg, got: 0, phase: 0, t: 0, next: 1.6, lane: 1, sway: 0, warns: [], model: this.makeBossModel(cfg) };
        if (cfg.final) this.boss = { ok: 0, fail: 0, n: 0 };
        $("bh-ph").style.backgroundImage = `url(${cfg.portrait || BOSS.portrait})`;
        $("bh-name").textContent = cfg.final ? `Финал · ${cfg.name}` : `Босс главы ${i + 1} · ${cfg.name}`;
        this.bossLine(cfg.intro);
        this.bossProgress();
        $("boss-hud").hidden = false;
        this.audio.play("boost");
        tg.haptic("warning");
    }

    bossLine(text) { $("bh-line").textContent = `«${text}»`; }
    bossProgress() {
        const f = this.bossFight;
        $("bh-bar").style.width = `${Math.min(100, (f.got / f.cfg.need) * 100)}%`;
        $("bh-count").textContent = `Козыри ${f.got}/${f.cfg.need}` + (this.boss && this.questions ? ` · экзамен ${this.boss.ok}/${BOSS.pass}` : "");
    }

    bossThrow() {
        const f = this.bossFight, cfg = f.cfg, v = cfg.vary || [];
        f.next = cfg.every[Math.min(f.phase, cfg.every.length - 1)];
        const lanes = [0, 1, 2].sort(() => Math.random() - 0.5);
        const n = v.includes("double") && f.phase >= 1 && Math.random() < 0.55 ? 2 : 1; // никогда все три
        const hit = lanes.slice(0, n), safe = lanes[n];
        f.lane = hit[0];
        for (const lane of hit) {
            const el = document.createElement("div");
            el.className = "lane-warn";
            el.style.left = `${(lane / 3) * 100}%`;
            $("hud").appendChild(el);
            const warn = v.includes("fake") ? 0.5 + Math.random() * 0.8 : BOSS_FIGHT.warn;
            f.warns.push({ lane, t: warn, el });
        }
        // козырь на безопасной полосе — чуть дальше броска
        this.world.addCoin(safe, BOSS_FIGHT.throwZ - 4, 0.9, true);
        const c = this.world.coins[this.world.coins.length - 1];
        c.userData.trump = true;
        c.scale.multiplyScalar(1.5);
    }

    bossTrump(c) {
        const f = this.bossFight;
        c.visible = false;
        if (!f) return;
        f.got++;
        this.audio.play("coin");
        tg.haptic("light");
        const third = Math.ceil(f.cfg.need / 3);
        const phase = Math.min(2, Math.floor(f.got / third));
        if (phase !== f.phase) {
            f.phase = phase;
            this.bossLine(f.cfg.rounds?.[phase] || f.cfg.mid);
        }
        this.bossProgress();
        const examOk = !f.cfg.final || !this.questions || (this.boss && this.boss.n >= 3 && !this.walls.length);
        if (f.got >= f.cfg.need && examOk) this.winBoss();
    }

    // экзамен Инакова в финальном бою: стена с вопросом по типу клиента — по возможности на тот тип,
    // на котором игрок чаще ошибается (сценарий v2: Инаков проверяет «проседающее»), без повторов за бой
    spawnExamWall() {
        if (!this.bossFight || !this.boss || this.boss.n >= 3 || this.walls.length) return;
        this.boss.n++;
        const asked = (this.boss.asked ||= new Set()), weak = this.profile.weakType();
        let pool = QUESTIONS.filter((x) => x.type !== "common" && x !== this.lastQ && !asked.has(x));
        if (weak && pool.some((x) => x.type === weak)) pool = pool.filter((x) => x.type === weak);
        const q = pick(pool);
        asked.add(q);
        this.lastQ = q;
        const order = [0, 1, 2].sort(() => Math.random() - 0.5);
        const wall = this.world.addWall(q, order.map((i) => q.a[i]), order.indexOf(0), -60);
        wall.boss = this.boss.n;
        this.walls.push(wall);
        this.bossLine(this.bossFight.cfg.rounds[this.boss.n - 1]);
    }

    examWallDone() {
        const f = this.bossFight, b = this.boss;
        if (!f || !b) return;
        this.bossProgress();
        if (b.n < 3) return;
        if (b.ok >= BOSS.pass) { if (f.got >= f.cfg.need) this.winBoss(); else this.hub.toast("Экзамен сдан — добери козыри!"); }
        else { // не сдал: Инаков ждёт в следующем забеге
            this.hub.toast(`${f.cfg.name}: «${f.cfg.lose}»`);
            this.endBossFight();
            this.resumeAfterBoss();
        }
    }

    endBossFight(silent = false) {
        const f = this.bossFight;
        if (f) {
            if (f.model) { this.scene.remove(f.model); }
            for (const w of f.warns) w.el.remove();
        }
        this.bossFight = null;
        this.boss = null;
        const hud = document.getElementById("boss-hud");
        if (hud) hud.hidden = true;
        if (!silent) document.querySelectorAll(".lane-warn").forEach((e) => e.remove());
    }

    resumeAfterBoss() {
        this.nextWallAt = this.distance + 150;
        this.nextWindAt = this.distance + 220;
        this.nextRowZ = Math.min(this.nextRowZ, -30);
    }

    winBoss() {
        const f = this.bossFight;
        const cfg = f.cfg, i = f.i;
        this.endBossFight();
        const reward = BOSS_FIGHT.reward[i] || 0;
        this.usdt += reward;
        const done = this.profile.beatBoss();
        this.runChapter = done;
        this.audio.play("record");
        tg.haptic("success");
        this.resumeAfterBoss();
        // стоп-кадр: победа, кодовая фраза (только с вопросами), вопрос сделки
        this.state = "deal";
        const ch = CHAPTERS[i];
        // награда — в подписи: в заголовке с ней было 4 строки
        $("deal-label").textContent = `${cfg.final ? "Финал пройден" : `Глава ${i + 1} «${ch.name}» пройдена`} · +${fmt(reward)} USDT`;
        $("deal-title").textContent = `${cfg.name} ${cfg.she ? "побеждена" : "побеждён"}`;
        $("deal-text").textContent = `«${cfg.win}»`;
        $("deal-phrase").innerHTML = this.questions ? `<span class="label">Кодовая фраза для менеджера</span><b>${ch.phrase}</b>` : "";
        const ans = $("deal-ans");
        ans.innerHTML = "";
        const btn = $("btn-deal");
        btn.textContent = "Бежать дальше";
        btn.onclick = () => this.closeDeal();
        if (cfg.final && this.questions) {
            const b = document.createElement("button");
            b.className = "btn"; b.textContent = "Забрать разбор →";
            b.onclick = () => tg.open(this.hub.managerLink());
            ans.appendChild(b);
        }
        if (this.questions) { // вопрос сделки: верно — бонус, неверно — без штрафа
            const q = pick(QUESTIONS);
            const lab = document.createElement("p");
            lab.className = "sheet-sub"; lab.textContent = `Вопрос сделки: ${q.q}`;
            ans.appendChild(lab);
            const bonus = Math.round(reward / 2);
            [0, 1, 2].sort(() => Math.random() - 0.5).forEach((k) => {
                const b = document.createElement("button");
                b.className = "btn"; b.textContent = q.a[k];
                b.onclick = () => {
                    if (ans.dataset.done) return;
                    ans.dataset.done = "1";
                    b.classList.add(k === 0 ? "ok" : "bad");
                    if (k === 0) { this.usdt += bonus; this.hub.toast(`Сделка! +${fmt(bonus)} USDT`); }
                    else this.hub.toast("Мимо — без штрафа");
                };
                ans.appendChild(b);
            });
            delete ans.dataset.done;
        }
        $("deal").hidden = false;
    }

    closeDeal() {
        $("deal").hidden = true;
        if (this.state === "deal") this.state = "playing";
    }

    // режим без вопросов: арки профита вместо стен — золотая полоса даёт больше, мимо — без удара
    spawnArch() {
        const z = -(this.nextWallAt - this.distance);
        const [a, b] = ARCHES.every;
        this.nextWallAt += a + Math.random() * (b - a);
        const gold = Math.floor(Math.random() * 3);
        const q = { q: "Арка профита", type: "arch", a: [] };
        const answers = [0, 1, 2].map((l) => (l === gold ? `+${ARCHES.reward[2]} USDT` : `+${ARCHES.reward[0]} USDT`));
        const wall = this.world.addWall(q, answers, gold, z);
        wall.arch = true;
        wall.boss = 0;
        this.walls.push(wall);
        this.world.noCars = true;
        this.nextRowZ = Math.min(this.nextRowZ, z - 16);
    }

    // ---- сюжет v2.5: таблички главы (страх босса) → практика → «БОСС» → бой 1 на 1 -------------------
    // Верный ответ засчитывается один раз (profile.data.quiz): +USDT главы и заряд против босса.
    // Ошибка — реплика Гориллы с пояснением, без удара и без заряда; табличку можно пересдать в следующем забеге.
    // сюжет босса идёт, когда игрок дошёл до его главы; до тех пор — обычные забеги
    get story() {
        const s = STORIES[this.profile.data.story || 0];
        return s && this.profile.chapter().index >= (s.chapter || 1) - 1 ? s : null;
    }

    // Тест: сразу в бой с боссом сюжета i — его глава открывается, после разгона — бой (для Мизулины без погони)
    async testFight(i) {
        const d = this.profile.data, st = STORIES[i];
        d.story = i;
        d.beaten = Math.max(0, (st.chapter || 1) - 1);
        d.anketa ||= { test: "тест" };
        this.settings.questions = true;
        this.profile.save();
        this.renderMenu();
        await this.start();
        const run = this.runId;
        setTimeout(() => { if (this.runId === run && this.state === "playing" && !this.storyOn) this.startStoryFight(); }, 1500);
    }

    // «Пройти всё заново»: сюжет, главы, таблички, анкета, значки и награды боссов — с начала; кошелёк остаётся
    resetStory() {
        const d = this.profile.data;
        Object.assign(d, { story: 0, beaten: 0, earned: 0, quiz: {}, mizBeaten: false, bossPaid: {}, badges: {}, exam: false });
        for (const k of ["anketa", "place", "left"]) delete d[k];
        this.profile.save();
        this.renderMenu();
    }

    // Следующий босс, пока его глава не открыта: кто, в какой главе и сколько ещё заработать (USDT за все забеги, не очки)
    nextBoss() {
        const s = STORIES[this.profile.data.story || 0];
        if (!s || this.story) return null;
        const need = Math.max(0, CHAPTERS[(s.chapter || 1) - 2]?.goal - this.profile.data.earned) || 0;
        const name = FIGHTERS[s.opponent].name;
        return { s, name, need, text: `Следующий босс — ${name}, глава ${s.chapter}. Заработай ещё ${fmt(need)} USDT за забеги — очки не в счёт.` };
    }

    // Мизулина побеждена — дальше бегает «из принципа»
    get grudge() { return !!this.profile.data.mizBeaten; }

    // глава 1 до боя: Мизулина бежит следом
    storyChasing() { const s = this.story; return !!(s?.chase && this.questions && !this.storyOn && this.state === "playing" && !this.profile.data.mizBeaten); }

    storyList(s = this.story) { return [...s.questions, ...(s.practice ? [s.practice] : [])]; }

    charges(s = this.story) { const done = this.profile.data.quiz || {}; return s ? s.questions.filter((q) => done[q.id]).length : 0; }

    spawnStoryWall() {
        const s = this.story, list = this.storyList(s);
        if (this.storyQ >= list.length) { this.nextWallAt += 200; return; } // все таблички главы позади — дальше бой
        const q = list[this.storyQ++], at = this.nextWallAt;
        this.nextWallAt += WALLS.every[0] + Math.random() * (WALLS.every[1] - WALLS.every[0]);
        if (q.input) { this.pendingInput = { q, at }; return; } // число вводим с клавиатуры — без табличек на полосах
        const z = -(at - this.distance);
        const order = q.a.map((_, i) => i).sort(() => Math.random() - 0.5); // варианты перемешиваются
        const wall = this.world.addWall({ ...q, type: q === s.practice ? "practice" : s.type }, order.map((i) => q.a[i]), order.indexOf(0), z);
        wall.story = q;
        wall.storyOf = s;
        wall.boss = 0;
        this.walls.push(wall);
        this.world.noCars = true;
        this.nextRowZ = Math.min(this.nextRowZ, z - 36);
    }

    // ответ на табличку главы: ok — верно; null — проскочил мимо
    storyAnswer(q, ok, s = this.story) {
        const d = this.profile.data;
        if (ok) {
            this.storyOk++;
            const first = q !== s.practice && !(d.quiz ||= {})[q.id]; // 1.4 после боя — тоже с наградой
            if (first) {
                d.quiz[q.id] = 1;
                this.usdt += s.answerUsdt;
                this.profile.save();
            }
            const n = this.charges(s), post = q === s.after;
            this.hub.toast(q === s.practice ? "Верно! Теперь — в бой" : first && post ? `Верно! +${fmt(s.answerUsdt)} USDT` : first ? `Верно! +${fmt(s.answerUsdt)} USDT · заряд ${n}/${s.questions.length} против: ${FIGHTERS[s.opponent].name}`
                : "Верно! Уже засчитано — это тренировка");
            if (q.ok) this.gorilla(q.ok, true);
            this.audio.play("boost");
            tg.haptic("success");
        } else {
            this.gorilla(ok === null ? "Табличку пропустил — заряд не начислен. В следующем забеге она снова будет." : q.err);
            tg.haptic("error");
        }
    }

    // реплика Гориллы поверх забега/боя
    gorilla(text, good = false, ms = 4200) { this.speech("Горилла", text, ms, good); }

    // реплика персонажа (Горилла, Мизулина, Спиди) — плашка сверху
    speech(who, text, ms = 3200, good = false, face = null) {
        const el = $("gorilla");
        ms = ms * 1.35 + 600; // висит подольше: успеть прочитать на бегу (плюс время на появление)
        el.classList.remove("out");
        $("g-text").textContent = text;
        $("g-who").textContent = who;
        const kind = who === "Горилла" ? "gorilla" : who === "Мизулина" ? "miz" : "hero";
        el.dataset.who = kind;
        // лицо: Мизулина — её портрет, герой — портрет выбранного героя
        const url = face || (kind === "miz" ? FIGHTERS.mizulina.portrait : kind === "hero" ? CHARACTERS.find((c) => c.id === this.heroId)?.portrait || FIGHTERS.mouse.portrait : "");
        $("g-face").style.setProperty("--face", url ? `url("${new URL(url, location.href).href}")` : "none"); // путь в переменной CSS считается от файла стилей — даём полный
        // где лицо на портрете (по высоте): у Спиди — ниже середины карточки, у отрендеренных боссов — сверху
        $("g-face").style.setProperty("--fy", /speedy/.test(url) ? "62%" : /pavel/.test(url) ? "8%" : "18%");
        for (const n of [$("g-face"), el.querySelector(".t-bubble")]) { n.style.animation = "none"; void n.offsetWidth; n.style.animation = ""; }
        el.classList.toggle("ok", good);
        // карточка вопроса сверху — облачко под ней, а не поверх
        const q = $("wall-q");
        el.style.top = q && !q.hidden ? `${Math.round(q.getBoundingClientRect().bottom + 6)}px` : "";
        el.hidden = false;
        clearTimeout(this.gorillaT);
        this.gorillaT = setTimeout(() => { el.classList.add("out"); this.gorillaT = setTimeout(() => { el.hidden = true; el.classList.remove("out"); }, 550); }, ms); // уходит плавно
    }

    // табличка с вводом числа: забег замирает, ответ — с клавиатуры (пробелы и «₽» не считаются)
    openInput(q) {
        this.pendingInput = null;
        this.state = "quiz";
        const s = this.story;
        $("qi-label").textContent = `${s.name} · ${CLIENT_TYPES[s.type].name}`;
        $("qi-q").textContent = q.q;
        $("qi-unit").textContent = q.unit || "";
        const inp = $("qi-val");
        inp.value = "";
        $("quiz-input").hidden = false;
        setTimeout(() => inp.focus(), 250);
        const done = () => {
            const v = Number(inp.value.replace(/[\s₽.,]/g, "").replace(/руб.*/i, ""));
            if (!inp.value.trim()) return;
            $("quiz-input").hidden = true;
            inp.blur();
            this.storyAnswer(q, v === q.input);
            if (v !== q.input) this.hub.toast(`Правильно: ${fmt(q.input)} ${q.unit || ""}`.trim());
            this.state = "playing";
            this.clock.getDelta();
        };
        $("btn-qi").onclick = done;
        inp.onkeydown = (e) => { if (e.key === "Enter") done(); };
    }

    storyHit() {} // старый счётчик квоты; засчитывание — в storyAnswer

    watchStory() {
        const s = this.story;
        if (!s || this.storyOn || this.state !== "playing" || this.flight) return;
        if (this.pendingInput && this.distance >= this.pendingInput.at - 12) return this.openInput(this.pendingInput.q);
        const ready = this.questions ? this.storyQ >= this.storyList(s).length && !this.walls.length && !this.pendingInput : this.distance >= (s.noqDistance || 450);
        if (ready) s.chase && this.questions && !this.profile.data.mizBeaten ? this.catchScene() : this.startStoryFight();
    }

    // Глава 1: догнала по сценарию — хватает за шиворот, затемнение, арена
    async catchScene() {
        const s = this.story, run = this.runId;
        this.storyOn = true;
        this.storyCatch = true;
        this.state = "bossintro";
        const c = this.ensureChaser();
        c.visible = true;
        // Спиди останавливается (поза idle), Мизулина подбегает вплотную и хватает — её анимацию крутим сами, пока идёт ролик
        const mixer = c.userData.mixer, anims = this.world.chaserModel?.gltf.animations || [];
        let last = performance.now(), live = true;
        const tick = () => {
            if (!live) return;
            const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            c.position.z += (0.95 - c.position.z) * Math.min(1, dt * 5);
            c.position.x += (this.x + 0.35 - c.position.x) * Math.min(1, dt * 5);
            c.rotation.y = Math.PI;
            mixer?.update(dt);
            requestAnimationFrame(tick);
        };
        tick();
        await wait(800);
        if (this.runId !== run) { live = false; return; }
        const cast = anims.find((x) => x.name === CHASER.arrest);
        if (cast && mixer) { mixer.stopAllAction(); const a = mixer.clipAction(cast); a.reset().setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.play(); }
        this.audio.play("whistle");
        tg.haptic("heavy");
        this.kick(0.3, 6);
        this.speech("Мизулина", s.catchLine, 1900);
        await wait(1500);
        $("fade").classList.add("on");
        await wait(600);
        live = false;
        const runClip = anims.find((x) => x.name === CHASER.run);
        if (mixer && runClip) { mixer.stopAllAction(); mixer.clipAction(runClip).play(); }
        c.visible = false;
        this.storyCatch = false;
        this.startStoryFight(true);
        setTimeout(() => $("fade").classList.remove("on"), 150);
        if (s.heroLine) setTimeout(() => this.state === "bossintro" && this.speech(FIGHTERS.mouse.name, s.heroLine, 2400), 1900);
    }

    async startStoryFight() {
        const s = this.story, opp = FIGHTERS[s.opponent];
        this.storyOn = true;
        this.state = "bossintro";
        tg.haptic("heavy");
        this.audio.play("record");
        $("bs-ph").style.backgroundImage = `url(${opp.portrait})`;
        for (const [k, v] of [["--bh", opp.splash?.h], ["--fx", opp.splash?.fx], ["--fy", opp.splash?.fy]]) $("bs-ph").style[v == null ? "removeProperty" : "setProperty"](k, v); // кадр портрета у каждого босса свой
        $("bs-hero").style.backgroundImage = `url(${FIGHTERS.mouse.portrait})`;
        $("bs-name").textContent = opp.name;
        $("bs-hero-name").textContent = FIGHTERS.mouse.name;
        $("bs-label").textContent = `${s.name} · ${s.fear}`;
        $("bs-quote").textContent = `«${s.before?.boss || opp.lines.intro}»`;
        const splash = $("boss-splash");
        splash.classList.remove("out");
        $("toast").hidden = true; // уведомления забега («Серия 5!») — не поверх заставки
        splash.hidden = false;
        $("hud").hidden = true;
        setTimeout(() => this.audio.play("crash"), 560); // удар «VS»
        if (s.before?.gorilla) setTimeout(() => this.state === "bossintro" && this.gorilla(s.before.gorilla, true, 3200), 1300);
        await wait(2400);
        splash.classList.add("out");
        await wait(450);
        splash.hidden = true;
        // улица пустая: без препятствий, монет, погони и карточек — только бойцы
        this.world.clear();
        this.walls = [];
        this.wind = null;
        this.world.blowWind?.(null);
        if (this.chaser) this.chaser.visible = false;
        this.stumble = 0;
        this.rat.visible = false;
        for (const id of ["wall-q", "wind-q"]) $(id).hidden = true;
        const n = this.questions ? this.charges(s) : 0;
        this.state = "fight";
        this.clock.getDelta();
        // экзамен Инакова: вопросы перемешаны (пересдача — в другом порядке), заряды убирают неверные варианты
        const exam = s.exam ? { ...EXAM, list: [...EXAM.list].sort(() => Math.random() - 0.5), charges: n, i: 0, ok: 0, bad: 0, streak: 0, wait: 0, q: null } : null;
        // заряды главы: +5% HP за каждый, с трёх — супер на 30% со старта
        this.fight = new Fight(this, { hero: "mouse", opponent: s.opponent, exam,
            bonus: exam ? {} : { hp: Math.round(FIGHTERS.mouse.hp * CHARGES.hp * n), super: n >= CHARGES.fullAt ? FIGHT.superMax * CHARGES.super : 0 },
            onEnd: (win) => this.endStoryFight(win) });
    }

    endStoryFight(win) {
        const s = this.story;
        this.fight = null;
        this.rat.visible = true;
        const du = this.usdt - this.credited.usdt; // заработанное в забеге — в кошелёк в любом случае
        this.credited = { usdt: this.usdt, trx: 0 };
        if (du) this.profile.earn(du);
        tg.guardClose(false);
        if (!win) { // проиграл — сюжет с начала: снова забег и возражения
            this.state = "menu";
            this.audio.music("menu");
            this.resetRun();
            this.renderMenu();
            this.show("menu");
            const opp = FIGHTERS[s.opponent];
            $("sl-title").textContent = `${opp.name} победил`;
            $("sl-text").textContent = s.exam ? `«${opp.lines.lose}» Вопросы перемешаются, пересдача бесплатная.`
                : `«${opp.lines.lose}» ${s.name} начнётся заново: таблички и бой. Засчитанные заряды (${this.charges(s)}) остаются.`;
            $("sl-ph").style.backgroundImage = `url(${opp.portrait})`;
            $("btn-sl-again").onclick = () => { $("story-lose").hidden = true; this.start(); };
            $("btn-sl-menu").onclick = () => ($("story-lose").hidden = true);
            $("story-lose").hidden = false;
            return;
        }
        const d = this.profile.data;
        d.story = (d.story || 0) + 1;
        if (s.final) d.exam = true;
        if (CHAPTERS[this.profile.chapter().index]?.boss === s.opponent) this.profile.beatBoss(); // глава босса засчитана
        const paid = (d.bossPaid ||= {})[s.id]; // награда за босса — только за первую победу
        if (!paid) { d.bossPaid[s.id] = 1; this.profile.gift(s.reward.usdt); }
        if (s.badge) (d.badges ||= {})[s.badge] = 1;
        if (s.chase) d.mizBeaten = true;
        this.profile.save();
        if (s.after) return this.resumeAfterFight(s, paid);
        tg.haptic("success");
        this.audio.play("boost");
        this.state = "menu";
        this.audio.music("menu");
        this.resetRun();
        this.renderMenu();
        this.show("menu");
        if (s.final) return this.showPrefinal();
        $("sw-ph").style.backgroundImage = `url(${FIGHTERS[s.opponent].portrait})`;
        $("sw-label").textContent = `${s.name} пройдена`;
        $("sw-title").textContent = `${FIGHTERS[s.opponent].name} повержен!`;
        $("sw-text").textContent = `Страх ${s.fear} побеждён.${paid ? "" : ` Награда: +${fmt(s.reward.usdt)} USDT.`} Забери бесплатный разбор у менеджера.`;
        const next = STORIES[this.profile.data.story];
        $("sw-next").textContent = next ? `${next.name}: ${next.title}` : "";
        $("sw-next-text").textContent = next ? `Страх ${next.fear}. Таблички главы — заряды против босса.` : "";
        $("btn-razbor").onclick = () => tg.open(this.hub.managerLink());
        $("btn-sw-menu").onclick = () => ($("story-win").hidden = true);
        $("story-win").hidden = false;
    }

    // Глава 1: после K.O. Мизулины забег продолжается — табличка 1.4, дальше таблички следующей главы, Мизулина «из принципа»
    async resumeAfterFight(s, paid) {
        this.rat.visible = true;
        this.storyOn = false;
        this.storyQ = 0;
        this.walls = [];
        this.show("hud");
        this.hub.toast(`${s.badge ? `Значок «${s.badge}»` : "Победа"}${paid ? "" : ` · +${fmt(s.reward.usdt)} USDT`}`);
        this.gorilla(s.afterKo, true, 3600);
        // табличка 1.4 — первой, следом таблички новой главы
        const q = s.after, z = -70;
        const order = q.a.map((_, i) => i).sort(() => Math.random() - 0.5);
        const wall = this.world.addWall({ ...q, type: s.type }, order.map((i) => q.a[i]), order.indexOf(0), z);
        wall.story = q; wall.storyOf = s; wall.boss = 0;
        this.walls.push(wall);
        this.world.noCars = true;
        this.nextWallAt = this.distance + 70 + WALLS.every[0];
        this.nextRowZ = Math.min(this.nextRowZ, z - 36);
        this.state = "countdown";
        const run = this.runId, cd = $("countdown");
        cd.hidden = false;
        for (const n of ["3", "2", "1"]) {
            cd.textContent = n; cd.classList.remove("pop"); void cd.offsetWidth; cd.classList.add("pop");
            this.audio.play("count");
            await wait(600);
            if (this.runId !== run) { cd.hidden = true; return; }
        }
        cd.hidden = true;
        this.audio.music("run");
        this.state = "playing";
        this.clock.getDelta();
    }

    // Горилла перед финалом: любой ответ ведёт к финальному экрану
    showPrefinal() {
        const pf = GORILLA.prefinal;
        this.showAnketa([{ id: "reward", ...pf }], () => this.showFinal(), "Финал");
    }

    // Финал: первая сотня получает по 10 USDT за созвон. Место выдаёт сервер (LINKS.top100), без него — без номера
    async showFinal() {
        const d = this.profile.data;
        if (!d.place && LINKS.top100) {
            try {
                const r = await fetch(LINKS.top100, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user: tg.user?.id || null }) });
                const j = await r.json();
                d.place = j.place; d.left = j.left; this.profile.save();
            } catch (e) { /* нет связи — покажем без номера */ }
        }
        const full = d.place && d.place > GORILLA.top;
        $("fn-ph").style.backgroundImage = `url(${FIGHTERS.pavel.portrait})`;
        $("fn-title").textContent = "Ты прошёл Воронку до конца";
        $("fn-text").textContent = full ? "Сотня призов разобрана, но созвон с менеджером остаётся за тобой: бесплатный разбор твоей ситуации."
            : GORILLA.final.replace(", место №{place}", d.place ? `, место №${d.place}` : "").replace(" Осталось мест: {left}/100", d.left != null ? ` Осталось мест: ${d.left}/${GORILLA.top}` : "");
        $("btn-fn").textContent = "Записаться на созвон";
        $("btn-fn").onclick = () => tg.open(this.hub.managerLink(`Прошёл Воронку до конца${d.place ? `, место №${d.place}` : ""}.`));
        $("btn-fn-menu").onclick = () => ($("final").hidden = true);
        $("final").hidden = false;
    }

    // Анкета Гориллы: вопросы по одному, ответы — в profile.data.anketa (уходят менеджеру в сообщении)
    showAnketa(list, then, title = "Анкета") {
        const d = this.profile.data, box = $("ak-a");
        let i = 0;
        const step = () => {
            if (i >= list.length) { $("anketa").hidden = true; this.profile.save(); return then?.(); }
            const q = list[i];
            $("ak-step").textContent = list.length > 1 ? `${title} ${i + 1}/${list.length}` : title;
            $("ak-q").textContent = q.q;
            box.innerHTML = "";
            for (const a of q.a) {
                const b = document.createElement("button");
                b.className = "btn";
                b.textContent = a;
                b.onclick = () => { (d.anketa ||= {})[q.id] = a; i++; step(); };
                box.append(b);
            }
        };
        $("anketa").hidden = false;
        step();
    }

    // ---- задержание (поймала погоня) ----------------------------------------------------------
    startArrest() {
        const c = this.chaser;
        this.arrest = { t: 0, c, side: c.userData.side || 1, from: c.position.clone(), arrived: false };
        $("arrest").hidden = false;
        document.body.classList.add("arresting");
        tg.haptic("heavy");
    }

    arrestStep(dt) {
        const a = this.arrest, c = a.c, mixer = c.userData.mixer;
        a.t += dt;
        // подбегает и встаёт сбоку у пояса героя, лицом к нему
        const k = Math.min(1, a.t / 0.7), e = k * (2 - k);
        c.position.x = a.from.x + (this.x + a.side * 0.75 - a.from.x) * e;
        c.position.z = a.from.z + (-0.35 - a.from.z) * e;
        c.position.y = 0;
        c.rotation.y = Math.atan2(this.x - c.position.x, -0.5 - c.position.z);
        if (k >= 1 && !a.arrived) {
            // встала — «выписывает протокол» (клип CHASER.arrest, без него — замирает в шаге)
            a.arrived = true;
            this.audio.play("whistle");
            const clip = this.world.chaserModel?.gltf.animations.find((x) => x.name === CHASER.arrest);
            if (clip) {
                const act = mixer.clipAction(clip);
                act.reset().setLoop(THREE.LoopOnce, 1);
                act.clampWhenFinished = true;
                for (const other of mixer._actions) if (other !== act) other.fadeOut(0.2);
                act.fadeIn(0.2).play();
                a.act = act;
            } else mixer.timeScale = 0;
        }
        mixer.update(dt * (a.arrived ? 1 : 1.3));
    }

    endArrest() {
        if (!this.arrest) return;
        const { c, act } = this.arrest, m = c.userData.mixer;
        if (m) {
            m.timeScale = 1;
            if (act) { act.stop(); for (const other of m._actions) if (other !== act) other.reset().setEffectiveWeight(1).play(); }
        }
        c.visible = false;
        this.arrest = null;
        $("arrest").hidden = true;
        document.body.classList.remove("arresting");
    }

    // ---- умение героя ---------------------------------------------------------------------
    renderSkill() {
        const s = HERO_SKILLS[this.heroId], b = $("btn-skill");
        b.hidden = !s;
        if (!s) return;
        // умение героя — такая же кнопка, как бусты: портрет героя, название, «1» — раз за забег
        $("sk-img").src = CHARACTERS.find((c) => c.id === this.heroId)?.portrait || "";
        $("sk-name").textContent = s.name;
        $("sk-left").textContent = this.skillUsed ? "0" : "1";
        b.title = s.text;
        b.disabled = this.skillUsed;
    }

    useSkill() {
        const s = HERO_SKILLS[this.heroId];
        if (!s || this.skillUsed || this.state !== "playing") return;
        this.skillUsed = true;
        if (s.kind === "turbo") { this.fx.turbo = s.time; this.fx.safe = Math.max(this.fx.safe, s.time); }
        if (s.kind === "magnet") this.fx.magnet = Math.max(this.fx.magnet, s.time);
        if (s.kind === "x2") this.boostLeft = Math.max(this.boostLeft, s.time);
        if (s.kind === "ram") this.ram = s.charges;
        this.hub.toast(`${s.name}: ${s.text}`);
        this.audio.play("boost");
        tg.haptic("heavy");
        this.kick(0.2, 6);
        $("btn-skill").classList.add("fire");
        setTimeout(() => $("btn-skill").classList.remove("fire"), 600);
        this.renderSkill();
    }

    // запасная жизнь (Саша Белый): второй удар не заканчивает забег, погоня сбрасывается
    spareLife(o) {
        if (this.lives <= 0) return false;
        this.lives--;
        this.stumble = 0;
        if (this.chaser) this.chaser.visible = false;
        this.fx.safe = Math.max(this.fx.safe, 2);
        if (o) { o.visible = false; o.userData.type = "decor"; }
        this.hub.toast("Запасная жизнь!");
        tg.haptic("success");
        return true;
    }

    // ---- «Ислам дует» -----------------------------------------------------------------------
    spawnWind() {
        const z = -(this.nextWindAt - this.distance);
        const [a, b] = WIND.every;
        const nearWall = this.bossCalm || this.bossFight || this.walls.some((w) => Math.abs(w.plates[0].position.z - z) < 45);
        const npc = this.world.makeIslam();
        // рядом стена-возражение, вентилятор Ислама или модель ещё не загрузилась — позже
        const nearVent = !!this.vent; // вентилятор сам отодвигает следующий порыв, пока его ветер не кончится
        if (!npc || nearWall || nearVent) { this.nextWindAt += 60; npc && this.world.dropObstacle(npc); return; }
        this.nextWindAt += a + Math.random() * (b - a);
        const side = Math.random() < 0.5 ? -1 : 1;
        npc.position.set(side * 3.7, 0.18, z);
        npc.rotation.y = (side < 0 ? Math.PI / 2 : -Math.PI / 2) - side * (WIND.npc.yaw || 0); // лицом к дороге — дует поперёк
        npc.userData.type = "decor";
        this.world.scene.add(npc);
        this.world.obstacles.push(npc);
        this.world.clearZone(z - 50, z + 30); // пока Ислам дует, на дороге пусто — только тапать
        this.nextRowZ = Math.min(this.nextRowZ, z - 50);
        this.wind = { npc, side, state: "near", t: 0, taps: 0, owned: this.profile.owns("islam") };
    }

    // Ислам: вдох (откинулся назад, камера на нём) → порыв (наклон вперёд, поток изо рта через дорогу) → героя
    // скользя сносит через полосы. Тапы гасят снос, подкат или прыжок — увернулся.
    watchWind(dt) {
        const w = this.wind, box = $("wind-q");
        this.windSlide = 0;
        if (!w) { this.camFocus = Math.max(0, (this.camFocus || 0) - dt * 2); return; }
        const z = w.npc.position.z;
        if (!w.bones) this.windRig(w);
        if (w.state === "near" && z > -15) { // вдох дольше и раньше — видно, что это Ислам набирает воздух
            if (w.owned) { w.state = "done"; this.hub.toast("Ислам: «Своих не сдуваю»"); }
            else if (this.fx.windproof) { w.state = "done"; this.hub.toast("Ислам: «Даже я не сдую»"); }
            else {
                w.state = "inhale"; w.t = WIND.inhale; w.lane0 = this.lane;
                this.audio.play("swipe");
                $("wind-title").textContent = "Ислам вдыхает…";
                $("wind-sub").textContent = "Готовься тапать!";
                $("wind-taps").innerHTML = "<i></i>".repeat(WIND.taps);
                $("wind-q").classList.add("inhale");
                $("wind-q").hidden = false;
            }
        }
        if (w.state === "inhale") {
            w.t -= dt;
            const inh = 1 - w.t / WIND.inhale;
            if (w.blow && w.idle) w.idle.time = WIND.npc.crouch * Math.min(1, inh * 1.4); // приседает, набирая воздух
            else this.windPose(w, -inh); // набирает воздух
            if (w.t <= 0) {
                w.state = "gust";
                w.t = WIND.gust;
                $("wind-title").textContent = "Ислам дует!";
                $("wind-sub").textContent = "Тапай, чтобы удержаться";
                box.classList.remove("inhale");
                box.style.setProperty("--wd", w.side > 0 ? "-1" : "1");
                box.hidden = false;
                tg.haptic("warning");
                this.kick(0.15, 4);
            }
        }
        if (w.state === "gust") {
            w.t -= dt;
            const k = Math.min(1, (WIND.gust - w.t) / 0.25); // резкий выдох
            if (w.blow) { // клип: присел и выбросил руки вперёд, дальше держит и чуть толкает
                w.idle?.setEffectiveWeight(0);
                w.blow.setEffectiveWeight(1);
                w.blow.time = WIND.npc.hold * k - (k >= 1 ? 0.025 * (1 + Math.sin((WIND.gust - w.t) * 14)) : 0);
            } else this.windPose(w, k);
            const mouth = w.head.getWorldPosition(this.windMouth ||= new THREE.Vector3());
            this.world.blowWind(mouth, -w.side, dt, k);
            [...$("wind-taps").children].forEach((el, i) => el.classList.toggle("on", i < w.taps));
            const flying = !!this.flight;
            const grip = Math.min(1, w.taps / WIND.taps);
            if (!flying) this.windSlide = -w.side * WIND.push * (1 - grip) * k; // скольжением поперёк полос
            if (this.fx.windproof) w.taps = WIND.taps; // «Устойчивость»: ветер не сносит
            if (grip >= 1 || w.t <= 0 || flying) {
                w.state = "done";
                this.windCalm = 1.5; // пара секунд встать на полосу
                box.hidden = true;
                this.world.blowWind(null);
                if (grip >= 1 || flying) {
                    this.usdt += WIND.reward;
                    this.hub.toast(`Удержался! +${WIND.reward} USDT`);
                    tg.haptic("success");
                } else if (!this.spareLife(null)) { // не натапал — сдуло
                    this.windSlide = 0;
                    this.gameOver("wind");
                    return;
                }
            }
        }
        if (w.state === "done") {
            if (w.blow && w.blow.getEffectiveWeight() > 0) { w.blow.setEffectiveWeight(0); w.idle?.setEffectiveWeight(1); }
            this.windPose(w, 0);
        }
        // камера: на вдохе и порыве — к Исламу, потом обратно
        const focus = w.state === "inhale" || w.state === "gust" ? 1 : 0;
        this.camFocus = (this.camFocus || 0) + (focus - (this.camFocus || 0)) * Math.min(1, dt * (focus ? 3 : 2));
        if (z > 8 && w.state !== "gust" && w.state !== "inhale") { this.wind = null; this.world.blowWind(null); }
    }

    // ---- «Ислам вентилирует» -------------------------------------------------------------------
    // Ислам у обочины за большим вентилятором. Стены-возражения, порыв «Ислам дует» и экзамен — не рядом:
    // в ветре героя сносит, и рядом с табличками стены это было бы нечестно
    spawnVent() {
        const z = -(this.nextVentAt - this.distance);
        const [a, b] = VENT.every;
        // стена впереди ещё не пройдена, когда начнётся подсказка, экзамен Инакова или порыв «Ислам дует» — чуть позже
        const wallAhead = this.walls.some((w) => { const d = w.plates[0].position.z - z; return d > -5 && d < VENT.zone + VENT.warn; });
        const npc = !this.boss && !this.wind && !wallAhead && this.world.makeIslam();
        if (!npc) { this.nextVentAt += 30; return; }
        // следующие стена и порыв — не раньше, чем ветер стихнет и герой отбежит (раньше стены шли каждые ~160 м,
        // и правило «стены не ближе 110 м» откладывало вентилятор бесконечно)
        this.nextWallAt = Math.max(this.nextWallAt, this.nextVentAt + VENT.after + VENT.gap / 2);
        this.nextWindAt = Math.max(this.nextWindAt, this.nextVentAt + VENT.gap);
        this.nextVentAt += a + Math.random() * (b - a);
        const side = Math.random() < 0.5 ? -1 : 1;
        // место на тротуаре, где не стоит фонарь, урна или банкомат
        const dz = [0, -4, 4, -8, 8].find((d) => this.world.sidewalkFree(side * 3.9, z + d, 0.9, 1.0)) ?? 0;
        const fan = this.world.makeFan();
        fan.position.set(side * 3.45, 0.18, z + dz);
        fan.scale.setScalar(1.3);
        // дует поперёк дороги, от Ислама; вполоборота к камере — иначе сзади видно только ребро решётки
        fan.rotation.y = -side * (Math.PI / 2 - 0.62);
        npc.position.set(side * 4.35, 0.18, z + dz + 0.7); // за вентилятором, лицом к дороге
        npc.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
        npc.userData.type = "decor";
        for (const o of [fan, npc]) { this.world.scene.add(o); this.world.obstacles.push(o); }
        this.vent = { fan, npc, side, state: "near", spin: 2, owned: this.profile.owns("islam") };
    }

    // near → warn (вентилятор раскручивается, подсказка, куда понесёт) → blow (в зоне ветра: замедление, снос) → done
    watchVent(dt) {
        const v = this.vent, box = $("vent-q");
        this.ventPush = 0;
        if (!v) return;
        const z = v.fan.position.z, dir = -v.side; // куда дует по X
        const spinTo = v.state === "blow" ? 28 : v.state === "warn" ? 14 : v.calm ? 6 : 2;
        v.spin += (spinTo - v.spin) * Math.min(1, dt * 1.5);
        v.fan.userData.rotor.rotation.z += v.spin * dt;
        if (v.state === "near" && z > -(VENT.zone + VENT.warn)) {
            if (v.owned || this.fx.windproof) { // выкупленный Ислам своих не продувает, «Устойчивость» не сносит
                v.state = "done"; v.calm = true;
                this.hub.toast(v.owned ? "Ислам: «Своих не продуваю»" : "Ислам: «С „Устойчивостью“ не продуть»");
            } else {
                v.state = "warn";
                $("vent-title").textContent = "Ислам включает вентилятор";
                $("vent-sub").textContent = `Понесёт ${dir > 0 ? "вправо" : "влево"} — держи полосу свайпами`;
                $("vent-bar").style.transform = "scaleX(1)";
                box.classList.add("warn");
                box.hidden = false;
                this.audio.play("swipe");
            }
        }
        if (v.state === "warn" && z > -VENT.zone) {
            v.state = "blow";
            $("vent-title").textContent = "Ислам вентилирует!";
            $("vent-sub").textContent = `Свайпай против ветра ${dir > 0 ? "←" : "→"}`;
            box.classList.remove("warn");
            tg.haptic("warning");
            this.kick(0.12, 3);
        }
        if (v.state === "blow") {
            // поток — от вентилятора поперёк дороги, у героя: так видно, что дует именно на него
            const o = (this.ventOrigin ||= new THREE.Vector3());
            o.set(v.fan.position.x, 1.2, Math.max(z - 8, Math.min(z + 8, 0)));
            this.world.blowWind(o, dir, dt, 0.85);
            if (!this.flight) this.ventPush = dir * VENT.drift;
            const k = Math.min(1, (z + VENT.zone) / (VENT.zone + VENT.after));
            $("vent-bar").style.transform = `scaleX(${(1 - k).toFixed(3)})`;
            if (z > VENT.after) { // прошёл зону — устоял
                v.state = "done";
                box.hidden = true;
                this.world.blowWind(null);
                this.usdt += VENT.reward;
                this.hub.toast(`Устоял на ветру! +${VENT.reward} USDT`);
                tg.haptic("success");
            }
        }
        if (z > 11) this.vent = null; // уехал за камеру — мир его уберёт сам
    }

    // кости Ислама для позы «дует»: клип стоит на первом кадре (стойка), поверх — наклоны позвоночника, головы, рук
    windRig(w) {
        const mixer = w.npc.userData.mixer;
        if (mixer) {
            mixer.timeScale = 0;
            for (const a of mixer._actions) a.time = 0;
            w.idle = mixer._actions[0];
            const clip = this.world.islam?.gltf.animations.find((c) => c.name === WIND.npc.blow);
            if (clip) { w.blow = mixer.clipAction(clip); w.blow.play(); w.blow.setEffectiveWeight(0); }
        }
        const bone = (name) => { let b = null; w.npc.traverse((o) => { if (!b && o.isBone && o.name.endsWith(name)) b = o; }); return b; };
        w.bones = { spine: ["Spine", "Spine1", "Spine2"].map(bone).filter(Boolean), head: bone("Head"), neck: bone("Neck"), l: bone("LeftArm"), r: bone("RightArm") };
        w.head = w.bones.head || w.npc;
        w.pose = 0;
    }

    // p: −1 — вдох (откинулся назад, грудь вперёд), 0 — стоит, 1 — дует (наклон вперёд, руки назад)
    windPose(w, p) {
        if (!w.bones) return;
        w.pose += (p - w.pose) * 0.35;
        const q = w.pose, b = w.bones;
        for (const s of b.spine) s.rotation.x += q * (q > 0 ? 0.16 : 0.1);
        if (b.neck) b.neck.rotation.x += q * 0.15;
        if (b.head) { b.head.rotation.x += q * (q > 0 ? 0.25 : 0.35); b.head.scale.setScalar(1 + Math.max(0, -q) * 0.06); }
        if (b.l) b.l.rotation.z += Math.max(0, q) * 0.6;
        if (b.r) b.r.rotation.z -= Math.max(0, q) * 0.6;
    }

    // выбор ответа в замедлении: герой встаёт на полосу ответа, скорость возвращается
    chooseAnswer(w, lane) {
        if (!w || w.chosen || w.answered) return;
        w.chosen = true;
        this.chooseLock = this.runTime + 0.35;
        if (lane !== this.lane) { this.prevLane = this.lane; this.lane = lane; }
        [...$("wq-ans").children].forEach((el) => el.classList.toggle("pick", +el.dataset.lane === lane));
        this.audio.play("swipe");
        tg.haptic("medium");
    }

    // вопрос — в HUD, пока стена впереди; прошёл мимо — стена убирается из памяти игры
    watchWall() {
        const box = $("wall-q");
        const w = this.walls.find((x) => !x.answered); // в HUD — ближайшая неотвеченная
        const z = w ? w.plates[0].position.z : -1e9;
        const show = !!w && z > -75 && z < 1;
        if (show && (box.hidden || this.wqShown !== w)) {
            this.wqShown = w;
            $("wq-type").textContent = w.boss ? `Экзамен Инакова · ${w.boss}/3` : w.arch ? "Арка профита · беги в золотую" : CLIENT_TYPES[w.type].name;
            $("wall-q").classList.toggle("boss", !!w.boss);
            $("wq-text").textContent = w.q.q;
            // ответы по полосам: слева, по центру, справа (два варианта — слева и справа)
            const lanes = w.answers.length === 2 ? [0, 2] : [0, 1, 2];
            $("wq-ans").innerHTML = lanes.map(() => "<button></button>").join("");
            $("wq-ans").classList.toggle("two", lanes.length === 2);
            if (this.fx.focus > 0 && !w.hint) { this.fx.focus--; w.hint = true; } // «Фокус»: верный ответ подсвечен
            [...$("wq-ans").children].forEach((el, i) => {
                el.dataset.lane = lanes[i];
                el.textContent = w.answers[i];
                el.classList.toggle("hint", !!w.hint && i === w.correct);
                el.onpointerdown = (e) => { e.stopPropagation(); this.chooseAnswer(w, lanes[i]); };
            });
            box.style.setProperty("--tc", CLIENT_TYPES[w.type].color);
            box.hidden = false;
            // в финальном бою — под плашкой босса (она в потоке HUD и бывает ниже обычного места карточки)
            const bh = $("boss-hud");
            box.style.top = this.bossFight && !bh.hidden ? `${Math.round(bh.getBoundingClientRect().bottom + 8)}px` : "";
        } else if (!show && !box.hidden) box.hidden = true;
        const first = this.walls[0];
        if (first && first.plates[0].position.z > 3) {
            if (!first.answered) this.answer(null, first); // проскочил (полёт) — ответ не засчитан, но и не ошибка
            this.walls.shift();
            this.world.noCars = this.walls.length > 0;
            if (first.boss) this.examWallDone();
        }
    }

    // ответ: true — забег закончился (второй удар)
    answer(o, wall = null) {
        const w = o ? o.userData.wall : wall;
        if (!w || w.answered) return false;
        w.answered = true;
        for (const p of w.plates) if (p !== o) p.userData.type = "decor";
        if (w.story) { // табличка главы: без удара, засчитывается один раз
            const ok = o ? !!o.userData.correct : null;
            if (o) { o.userData.type = "decor"; if (ok) { o.visible = false; this.world.flash(o.position.clone().setY(1.2), true); this.world.splash(this.x, 0, 18, 1.1); } }
            this.storyAnswer(w.story, ok, w.storyOf);
            return false;
        }
        if (!o) return false;
        if (w.arch) { // арка профита: золотая — больше и в серию, остальные — немного, без удара
            const gold = o.userData.correct, r = gold ? ARCHES.reward[2] : ARCHES.reward[0];
            o.visible = false;
            o.userData.type = "decor";
            this.usdt += r * (this.boostLeft > 0 ? 2 : 1);
            this.world.flash(o.position.clone().setY(1.2), gold);
            if (!gold) { this.wallStreak = 0; this.audio.play("coin"); return false; }
            this.wallStreak++;
            this.audio.play("boost");
            tg.haptic("success");
            if (this.wallStreak % WALLS.streak === 0) {
                this.boostLeft = Math.max(this.boostLeft, WALLS.streakTime);
                this.hub.toast(`Серия ${this.wallStreak}! ×2 USDT на ${WALLS.streakTime} с`);
            } else this.hub.toast(`Золотая арка! +${r} USDT`);
            return false;
        }
        const st = (this.wallStats[w.type] ||= { ok: 0, fail: 0 });
        if (w.boss && this.boss) this.boss[o.userData.correct || this.ram > 0 || this.wallForgive > 0 ? "ok" : "fail"]++;
        if (o.userData.correct) {
            st.ok++;
            this.storyHit();
            this.wallStreak++;
            o.visible = false;
            o.userData.type = "decor";
            this.world.flash(o.position.clone().setY(1.2), true);
            this.world.splash(this.x, 0, 18, 1.1);
            this.usdt += WALLS.reward * (this.boostLeft > 0 ? 2 : 1);
            this.audio.play("boost");
            tg.haptic("success");
            if (this.wallStreak % WALLS.streak === 0) {
                this.boostLeft = Math.max(this.boostLeft, WALLS.streakTime);
                this.hub.toast(`Серия ${this.wallStreak}! ×2 USDT на ${WALLS.streakTime} с`);
            } else this.hub.toast(`Верно! +${WALLS.reward} USDT`);
            return false;
        }
        if (this.ram > 0 || this.wallForgive > 0) { // «Таран» Саши или прощённая ошибка Ислама — как верный ответ
            const how = this.ram > 0 ? "Таран" : "Ислам простил ошибку";
            if (this.ram > 0) this.ram--; else this.wallForgive--;
            o.userData.correct = true;
            w.answered = false;
            const r = this.answer(o);
            this.hub.toast(`${how}! +${WALLS.reward} USDT`);
            return r;
        }
        st.fail++;
        this.wallStreak = 0;
        this.hub.toast(`Почти! Верно: «${w.q.a[0]}»`); // без «неправильно» — подсказываем верный ответ
        o.userData.type = "decor";
        if (this.fx.safe > 0) return false;
        if (this.stumble > 0) { if (this.spareLife(o)) return false; this.gameOver("wall"); return true; }
        this.hitOnce(o);
        return false;
    }

    // Столкновения считаются по всему пути предмета за кадр (move — на сколько сдвинулась улица): при 20 кадрах
    // на скорости 30 м/с за кадр это 1,5 м — больше, чем монета или инспектор, и они проскакивали сквозь героя
    collide(dt, move = 0) {
        const sliding = this.slideLeft > 0;
        // у стены-возражения (за 35 м до неё и 8 м после) и пока Ислам дует — препятствия не бьют, только ответы
        const ws = this.wind?.state;
        const calm = ws === "inhale" || ws === "gust" || this.windCalm > 0 ||
            this.walls.some((w) => { const z = w.plates[0].position.z; return z > -35 && z < 8; });
        for (const o of this.world.obstacles) {
            if (this.fx.fly > 0) break; // в полёте препятствия внизу
            const d = o.userData;
            if (d.type === "decor") continue;
            if (Math.abs(o.position.x - this.x) > 0.8) continue;
            const win = d.halfZ + 0.25, z = o.position.z;
            if (z < -win || z - move - (d.oncoming || 0) * dt > win) continue;
            if (d.type === "answer") { // стена-возражение: ответ — та табличка, в которую вбежал
                if (this.answer(o)) return;
                continue;
            }
            if (d.top && this.y > d.top - 0.05) continue; // бак, ограждение — перепрыгнул
            if (d.type === "barrier" && sliding) continue;
            if (calm) continue;
            if (this.fx.safe > 0) continue; // после щита и апелляции — пара секунд неуязвимости
            if (this.fx.shield) { // «Щит» прощает одно столкновение
                this.fx.shield = false;
                if (this.grudge && this.stumble > 0) this.speech("Мизулина", CHASE_GRUDGE.lines.shield);
                this.fx.safe = 1;
                o.visible = false;
                d.type = "decor";
                this.audio.play("boost");
                tg.haptic("warning");
                continue;
            }
            // как в сабвее: второй удар, пока ДПС на хвосте, — поймали; первый — споткнулся
            if (this.stumble > 0) { if (this.spareLife(o)) continue; return this.gameOver("caught"); }
            this.hitOnce(o);
            break;
        }

        const coins = this.world.coins;
        if (this.fx.magnet > 0) { // «Скупщик»: монеты впереди летят к игроку
            const k = Math.min(1, dt * 7);
            const y = this.y + 0.8;
            for (const c of coins) {
                if (c.position.z < -14 || c.position.z > 1) continue;
                c.position.x += (this.x - c.position.x) * k;
                // высоту монеты мир каждый кадр ставит от baseY (покачивание) — тянем её, иначе монеты над баком висят
                c.userData.baseY += (y - c.userData.baseY) * k;
                c.position.y += (y - c.position.y) * k;
            }
        }
        const ratTop = sliding ? 0.9 : 1.6;
        for (let i = coins.length - 1; i >= 0; i--) {
            const c = coins[i];
            if (Math.abs(c.position.x - this.x) > 0.7 || c.position.z < -0.7 || c.position.z - move > 0.7) continue;
            if (c.position.y < this.y - 0.2 || c.position.y > this.y + ratTop) continue;
            if (c.userData.trump) { // козырь в бою с боссом
                this.bossTrump(c);
            } else if (c.userData.pickup) {
                this.powerUp(c.userData.pickup);
            } else if (c.userData.boost) { // золотая монета: ×2 на время по уровню прокачки (+5 USDT; TRX больше нет)
                // не меньше, чем уже осталось: купленный «Лимит ×2» на 30 с монета не обрезает
                this.boostLeft = Math.max(this.boostLeft, UPGRADES.x2.times[this.profile.level("x2") - 1] || 0);
                this.usdt += 5;
                this.world.flash(c.position, true);
                this.audio.play("boost");
                tg.haptic("success");
            } else {
                this.coinCount++;
                const bonus = this.perk.coinBonus && this.coinCount % this.perk.coinBonus === 0 ? 1 : 0; // Паша: +10%
                this.usdt += (this.boostLeft > 0 ? 2 : 1) + bonus;
                this.audio.play("coin");
                this.coinFx(c);
            }
            this.world.removeCoin(i);
        }
    }
}

new Game();
