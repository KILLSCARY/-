// «Покоритель P2P 3.0» — раннер: крыс бежит по ночному району, собирает USDT,
// прыгает через баки, подкатывается под «блокировки» и объезжает тачки.

import { BALANCE, LINKS, DEATH_TEXT, TIPS, BOOT_TIPS, CHARACTERS, VIETNAM,QUALITY, QUALITY_TIERS, HERO_PERKS, UPGRADES, APPEAL_PRICE, APPEAL_ENABLED, CHAPTERS, POWERUPS, WALLS, QUESTIONS, CLIENT_TYPES, LANE_LABELS, WIND, VENT, HERO_SKILLS, BOSS, CHAPTER_BOSSES, BOSS_FIGHT, ARCHES, POLICE_OFFICER, CHASER, SKY, HERO_LINES, CHASER_LINES, BOOSTS, BOOST_LIMIT, STORIES, FIGHT, FIGHTERS, CHARGES, GORILLA, EXAM, CHASE_GRUDGE, MASK_SCENE, LOOK2, HEAT_AFTER, CINE, SOUNDS, CHASERS, heroFighter, GORILLA_HINT_CH2, CARDS, CARD_SHOP, CARD_DASH } from "./config.js";
import { Fight } from "./fight.js";
import { PerfHud } from "./perf.js";
import { FramePacer, FrameMeter } from "./frame-timing.js";
import { CardGirls } from "./cards.js";
import { Hecklers } from "./hecklers.js";
import { prize } from "./prize.js";
import { Profile } from "./profile.js";
import { Hub } from "./hub.js";
import { createRat, animateRat, attachModel } from "./rat.js";
import { World, SPAWN_Z, buildEnvironment } from "./world.js";
import { WINTER } from "./winter.js";
import * as THREE from "./vendor/three.module.js";
import { EffectComposer } from "./vendor/jsm/EffectComposer.js";
import { RenderPass } from "./vendor/jsm/RenderPass.js";
import { UnrealBloomPass } from "./vendor/jsm/UnrealBloomPass.js";
import { ShaderPass } from "./vendor/jsm/ShaderPass.js";
import { HeroGlowPass, markGlow } from "./heroglow.js";
import { loadModel, releaseQueue, preloadModel, setModelAnisotropy, upgradeTextures, setKtx2Renderer } from "./models.js";
import { Audio } from "./audio.js";
import { tg } from "./tg.js";

// hex-цвета материалов — в sRGB, как в дизайне
THREE.ColorManagement.legacyMode = false;

// Финальный проход после bloom: ACES-тонмаппинг, sRGB, виньетка и «киношная» обработка (CINE в config.js):
// ca — хроматика к краям кадра, speed — размытие по краям на скорости (0…1 ставит игра), shadow/light — цвет теней
// и света (тени в холод, свет в тепло вместо сплошного фиолетового), grain — зерно (если FXAA выключен; иначе — в нём),
// soft — меню: фон мягко размыт, вокруг героя (focus — где он на экране, 0…1; aspect — ширина/высота) резко
const OutputShader = {
    uniforms: { tDiffuse: { value: null }, exposure: { value: 1.1 }, sat: { value: 1 }, contrast: { value: 1 }, vig: { value: SKY.vignette ?? 0.55 },
        ca: { value: 0 }, speed: { value: 0 }, grain: { value: 0 }, time: { value: 0 }, grade: { value: 0 },
        soft: { value: 0 }, focus: { value: new THREE.Vector2(0.5, 0.6) }, aspect: { value: 0.5 },
        shadowTint: { value: new THREE.Vector3(1, 1, 1) }, lightTint: { value: new THREE.Vector3(1, 1, 1) } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
        uniform sampler2D tDiffuse; uniform float exposure, sat, contrast, vig, ca, speed, grain, time, grade, soft, aspect; uniform vec3 shadowTint, lightTint;
        uniform vec2 focus;
        varying vec2 vUv;
        vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main() {
            vec2 d = vUv - 0.5; float r2 = dot(d, d);
            vec3 h = texture2D(tDiffuse, vUv).rgb;
            if (ca > 0.0) { // хроматика: красный и синий чуть расходятся к краям, как у объектива
                vec2 o = d * r2 * ca;
                h.r = texture2D(tDiffuse, vUv + o).r; h.b = texture2D(tDiffuse, vUv - o).b;
            }
            if (speed > 0.0) { // скорость: по краям кадр «смазан» к центру, середина (герой) — резкая
                // сдвиг выборок — случайный на пиксель: без него видны «ступеньки» (отдельные копии окон)
                vec2 s = d * speed * 0.03 * smoothstep(0.04, 0.3, r2); float j = hash(vUv * 731.0 + time);
                h = (h + texture2D(tDiffuse, vUv - s * (0.5 + j)).rgb + texture2D(tDiffuse, vUv - s * (1.5 + j)).rgb + texture2D(tDiffuse, vUv - s * (2.5 + j)).rgb) * 0.25;
            }
            if (soft > 0.0) { // меню: мягкое размытие фона (как малая глубина резкости), герой в фокусе
                float m = soft * smoothstep(0.12, 0.34, length((vUv - focus) * vec2(aspect, 1.0)));
                if (m > 0.002) {
                    vec2 px = vec2(1.0 / aspect, 1.0) * 0.0055 * m; // радиус — доля высоты кадра
                    float a = hash(vUv * 517.0) * 6.2832; // поворот узора выборок на пиксель — без «двоения»
                    vec3 sum = h;
                    for (int i = 0; i < 8; i++) {
                        float t = a + float(i) * 0.7854, rr = i < 4 ? 1.0 : 0.55;
                        sum += texture2D(tDiffuse, vUv + vec2(cos(t), sin(t)) * px * rr).rgb;
                    }
                    h = sum / 9.0;
                }
            }
            vec3 c = aces(h * exposure);
            c = mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
            float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
            c *= mix(vec3(1.0), mix(shadowTint, lightTint, smoothstep(0.08, 0.7, l)), grade); // тени в холод, свет в тепло
            c = mix(vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), c, sat); // насыщенность
            c = clamp((c - 0.5) * contrast + 0.5, 0.0, 1.0);              // контраст
            float v = smoothstep(0.95, 0.35, length(d));
            c *= mix(vig, 1.0, v);
            if (grain > 0.0) c += (hash(vUv * 1024.0 + time) - 0.5) * grain * (1.0 - l * 0.6);
            gl_FragColor = vec4(c, 1.0);
        }`,
};

// Сглаживание краёв (FXAA) — последним проходом, по готовой картинке. Холст без своего сглаживания (antialias: false —
// после bloom оно всё равно терялось), и столбы, провода, полосы и край героя шли «лесенкой». res — 1/размер в пикселях
const FxaaShader = {
    uniforms: { tDiffuse: { value: null }, res: { value: new THREE.Vector2(1 / 1024, 1 / 1024) }, grain: { value: 0 }, time: { value: 0 } },
    vertexShader: OutputShader.vertexShader,
    fragmentShader: `
        uniform sampler2D tDiffuse; uniform vec2 res; uniform float grain, time; varying vec2 vUv;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main() {
            const vec3 L = vec3(0.299, 0.587, 0.114);
            vec3 nw = texture2D(tDiffuse, vUv + vec2(-1.0, -1.0) * res).rgb, ne = texture2D(tDiffuse, vUv + vec2(1.0, -1.0) * res).rgb;
            vec3 sw = texture2D(tDiffuse, vUv + vec2(-1.0, 1.0) * res).rgb, se = texture2D(tDiffuse, vUv + vec2(1.0, 1.0) * res).rgb;
            vec3 m = texture2D(tDiffuse, vUv).rgb;
            float lnw = dot(nw, L), lne = dot(ne, L), lsw = dot(sw, L), lse = dot(se, L), lm = dot(m, L);
            float lmin = min(lm, min(min(lnw, lne), min(lsw, lse))), lmax = max(lm, max(max(lnw, lne), max(lsw, lse)));
            vec2 dir = vec2(-((lnw + lne) - (lsw + lse)), (lnw + lsw) - (lne + lse));
            float red = max((lnw + lne + lsw + lse) * 0.03125, 1.0 / 128.0);
            dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + red), -8.0, 8.0) * res;
            vec3 a = 0.5 * (texture2D(tDiffuse, vUv - dir / 6.0).rgb + texture2D(tDiffuse, vUv + dir / 6.0).rgb);
            vec3 b = a * 0.5 + 0.25 * (texture2D(tDiffuse, vUv - dir * 0.5).rgb + texture2D(tDiffuse, vUv + dir * 0.5).rgb);
            float lb = dot(b, L);
            vec3 c = lb < lmin || lb > lmax ? a : b;
            // зерно — после сглаживания (иначе FXAA принимает его за края и размазывает)
            if (grain > 0.0) c += (hash(vUv * 1024.0 + time) - 0.5) * grain * (1.0 - dot(c, L) * 0.6);
            gl_FragColor = vec4(c, 1.0);
        }`,
};

// Клип из JSON (clipsUrl). В файлах Гориллы у клипов uuid = null, а Three.js кэширует действия микшера по uuid:
// все клипы становились одним действием — включали «бег» и тут же гасили «стойку» (тот же объект), и Горилла ехала
// застывшей фигурой. Без uuid — выдаём свой
const parseClip = (json) => { const c = THREE.AnimationClip.parse(json); if (!c.uuid) c.uuid = THREE.MathUtils.generateUUID(); return c; };
const $ = (id) => document.getElementById(id);
// сколько длится «споткнулся» (с) — кусок Sliding Stumble из Meshy: запнулся, махнул руками, выровнялся
const TRIP = 0.85;
const RES_MIN = 0.6; // ниже этой доли разрешения автоподстройка не опускает (шаги по 0,1: 1 → 0,9 → … → 0,6)
const TALK_CALM = 4.5; // сколько секунд после начала реплики дорога впереди пустая — её успевают прочитать
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
// Telegram на Android сам пишет класс телефона в User-Agent: «Telegram-Android/11.2.0 (Модель; Android 14; SDK 34; LOW)»
// (LOW / AVERAGE / HIGH, Bot API 8.0). Ему верим больше, чем догадкам по памяти и видеочипу.
function tgPerfClass() {
    const m = navigator.userAgent.match(/Telegram-Android\/[^(]*\([^)]*;\s*(LOW|AVERAGE|HIGH)\s*\)/i);
    return m ? m[1].toUpperCase() : null;
}

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

// v2.8 §14.2: «2 000», «2,000», «2000 руб», «2к», «2k», «2 тыс. руб», «1,5к» → число
function parseAnswer(raw) {
    let t = String(raw).toLowerCase().replace(/\u00a0/g, " ").replace(/₽|руб[а-я.]*|р\.?$/g, "").trim();
    let mul = 1;
    const m = t.match(/(к|k|тыс[а-я.]*)\s*$/);
    if (m) { mul = 1000; t = t.slice(0, m.index); }
    t = t.replace(/\s+/g, "").replace(/\.$/, "");
    if (mul > 1) t = t.replace(",", "."); // «1,5к» — дробь
    else if (/^\d{1,3}([.,]\d{3})+$/.test(t)) t = t.replace(/[.,]/g, ""); // разделители тысяч
    else t = t.replace(",", ".");
    const v = Number(t) * mul;
    return Number.isFinite(v) ? Math.round(v) : NaN;
}

class Game {
    constructor() {
        window.game = this; // удобно для отладки из консоли
        setTimeout(() => this.syncRewards?.(), 1500);
        this.camMix = 0;
        this.state = "menu"; // menu → countdown → playing ⇄ paused → over
        this.audio = new Audio();
        this.best = tg.localBest();
        this.t = 0;
        // рывки камеры: dip — присед по высоте (прыжок, приземление), shake — секунды тряски, fov — «удар» угла обзора
        this.camKick = { dip: 0, shake: 0, fov: 0 };
        this.calm = matchMedia("(prefers-reduced-motion: reduce)").matches; // «уменьшить движение» — эффекты слабее

        // Авто начинает с одного прохода рендера. Высокая графика с отражениями — вручную:
        // мощный CPU/класс HIGH от Telegram не гарантирует запас GPU и охлаждения.
        const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) < 820);
        this.mobile = mobile; // телефон: 60 FPS по умолчанию, облегчённая хорошая графика (QUALITY_TIERS.high.phone)
        // телефон — средняя (была слабая: на плотном экране выходило мыло); слабая — только слабым устройствам
        this.quality = QUALITY === "auto" ? (tgPerfClass() === "LOW" || weakDevice() ? "low" : "medium") : QUALITY;
        this.resScale = 1;
        this.autoQuality = this.quality;
        // настройки игрока (музыка, звуки, вибрация, графика) — из памяти телефона
        try { this.settings = JSON.parse(localStorage.getItem("p2p_settings") || "{}"); } catch { this.settings = {}; }
        const requestedLocation = new URLSearchParams(location.search).get("location");
        if (["winter", "street", "auto"].includes(requestedLocation)) {
            this.settings.location = requestedLocation;
            try { localStorage.setItem("p2p_settings", JSON.stringify(this.settings)); } catch {}
        }
        // режим: ?startapp=q / noq задаёт его и снимает выбор при первом входе
        const sp = (tg.startParam || "").toLowerCase();
        if (sp === "q" || sp === "noq") { this.settings.questions = sp === "q"; this.settings.modeChosen = true; try { localStorage.setItem("p2p_settings", JSON.stringify(this.settings)); } catch {} }
        if (this.settings.quality && this.settings.quality !== "auto" && QUALITY_TIERS[this.settings.quality]) this.quality = this.settings.quality; // динамическое разрешение: при нехватке кадров сначала 0.85, 0.7 — и только потом графика ниже
        this.tier = { ...QUALITY_TIERS[this.quality], ...(this.mobile && QUALITY_TIERS[this.quality].phone) }; // с первого кадра — облегчения/резкость телефона

        this.bootWatch(); // стартовый экран загрузки — до готовности героя, улицы и моделей
        this.setupScene();
        // диагностика FPS (perf.js): настройка «Для теста», ?perf=1 или startapp=perf
        this.perf = new PerfHud(this);
        if (this.settings.perf || /[?&]perf=1/.test(location.search) || (tg.startParam || "").toLowerCase() === "perf") this.perf.toggle(true);
        this.world = new World(this.scene, BALANCE.laneWidth, this.tier);
        if (this.location) this.setLocation(this.location, true); // герой выбран раньше, чем построилась улица
        this.cards = new CardGirls(this); // девушки с банковской картой у края дороги
        this.hecklers = new Hecklers(this); // активистки на обочине Нячанга — кидаются в Диму и Сашу
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
            // После облака и загрузки: комикс Гориллы, затем выбор режима (после сюжета) и ежедневная награда
            setTimeout(() => this.hub.showWelcome(), 1200);
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
        this.pacer = new FramePacer();
        this.frameMeter = new FrameMeter();
        this.tick = this.loop.bind(this);
        this.loop();
    }

    setupScene() {
        const canvas = $("game");
        // лёгкая графика рисует прямо на экран (см. render()): сглаживание — аппаратное MSAA холста, на телефонных
        // видеокартах оно почти бесплатное. Остальные уровни сглаживают в постобработке (FXAA/MSAA буферов)
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !!this.tier.direct, powerPreference: "high-performance" });
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        setModelAnisotropy(Math.min(this.tier.aniso || 1, this.renderer.capabilities.getMaxAnisotropy())); // до загрузки моделей
        setKtx2Renderer(this.renderer); // какие сжатые форматы умеет видеокарта — для HD-текстур в KTX2

        this.scene = new THREE.Scene();
        // небо — картинка во весь экран (градиент, звёзды, луна; перерисовывается под размер экрана в onResize),
        // туман вдали — цвета горизонта (SKY)
        this.scene.background = new THREE.Color(SKY.color);
        // «Довести ночь» (LOOK2) — проба по флагу
        this.look2 = /[?&]look=2/.test(location.search) || (tg.startParam || "").toLowerCase() === "look" || !!this.settings?.look2;
        this.scene.fog = this.look2 ? new THREE.Fog(SKY.color, LOOK2.fog[0], LOOK2.fog[1]) : new THREE.Fog(SKY.color, 12, 85);
        this.paintSky();
        this.scene.environment = buildEnvironment(this.renderer);

        this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 100); // дальше 100 м всё равно туман

        this.hemi = new THREE.HemisphereLight(SKY.hemi[0], SKY.hemi[1], this.look2 ? LOOK2.hemi : SKY.light);
        this.scene.add(this.hemi);
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
        this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), this.look2 ? LOOK2.bloom : 0.8, 0.5, 0.92);
        this.composer.addPass(this.bloom);
        // «Ночь+»: мягкий ореол вокруг героя (js/heroglow.js) — после свечения окон, до тонмаппинга
        if (this.look2 && LOOK2.glow) {
            this.heroGlow = new HeroGlowPass(this.scene, this.camera, LOOK2.glow);
            this.composer.addPass(this.heroGlow); // герой (this.rat) помечается слоем при выборе модели — selectHero
        }
        const output = new ShaderPass(OutputShader);
        output.uniforms.exposure.value = this.look2 ? LOOK2.exposure : SKY.exposure;
        if (this.look2) { output.uniforms.sat.value = LOOK2.sat; output.uniforms.contrast.value = LOOK2.contrast; output.uniforms.vig.value = LOOK2.vignette; }
        else { output.uniforms.sat.value = CINE.sat; output.uniforms.contrast.value = CINE.contrast; } // «кино»: чуть контрастнее и сочнее
        this.composer.addPass(output);
        this.output = output;
        output.uniforms.shadowTint.value.fromArray(CINE.shadow); output.uniforms.lightTint.value.fromArray(CINE.light);
        this.fxaa = new ShaderPass(FxaaShader); // включает setQuality (QUALITY_TIERS[…].aa)
        this.composer.addPass(this.fxaa);

        window.addEventListener("resize", () => this.onResize());
    }

    onResize() {
        const w = window.innerWidth, h = window.innerHeight;
        if (!w || !h) return; // окно ещё не развернулось (Telegram, фоновая вкладка): буферы нулевого размера — ошибки WebGL
        const ratio = Math.min(window.devicePixelRatio, this.tier.ratio) * (this.resScale || 1) * (this.heatScale || 1);
        this.renderer.setPixelRatio(ratio);
        this.renderer.setSize(w, h, false);
        this.composer.setPixelRatio(this.direct ? 1 : ratio);
        this.composer.setSize(this.direct ? 1 : w, this.direct ? 1 : h);
        // свечение считается в уменьшенном буфере: в 2 раза на компьютере, в 4 на телефоне
        const div = this.tier.bloom || 4;
        this.bloom.setSize(this.direct ? 1 : w * ratio / div, this.direct ? 1 : h * ratio / div);
        this.bloom.enabled = this.tier.bloom > 0;
        this.fxaa.uniforms.res.value.set(1 / (w * ratio), 1 / (h * ratio));
        this.camera.aspect = w / h;
        this.paintSky(w, h);
        this.baseFov = w / h < 0.8 ? 72 : 58;
        this.camera.fov = this.baseFov + this.camKick.fov;
        this.camera.updateProjectionMatrix();
        this.hudCoin = null; // куда летят монеты — пересчитать под новый размер
        if (this.sceneCovered()) this.render(); // смена размера стирает холст — последний кадр рисуем заново
        this.stillDrawn = false; // и замершую картинку паузы/итога — тоже
    }

    // Небо под пропорции экрана (иначе луна вытянется в овал): градиент, звёзды, луна с ореолом. Звёзды — одни и те же
    // при каждой перерисовке (свой генератор с зерном), чтобы при повороте экрана небо не «перемешивалось»
    paintSky(w = window.innerWidth, h = window.innerHeight) {
        if (!this.scene || !w || !h) return;
        const key = `${Math.round(w / h * 100)}_${this.location}`;
        if (this.skyKey === key) return;
        this.skyKey = key;
        // 1024 по ширине (было 512): небо растягивалось на экран телефона, и звёзды выходили крупными кругами
        const W = 1024, H = Math.round(1024 * h / w), c = document.createElement("canvas");
        c.width = W; c.height = H;
        const g = c.getContext("2d");
        const vn = this.location === "vietnam" && VIETNAM.sky;
        const winter = this.location === "winter";
        const sky = winter ? WINTER.sky : vn || SKY;
        const grad = g.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, sky.zenith); grad.addColorStop(winter ? .3 : .5, sky.mid); grad.addColorStop(winter ? .65 : 1, sky.horizon);
        g.fillStyle = grad; g.fillRect(0, 0, W, H);
        if (winter) {
            if (!this.winterSky) {
                this.winterSky = new Image();
                this.winterSky.onload = () => { if (this.location === 'winter') { this.skyKey = null; this.paintSky(); this.stillDrawn = false; } };
                this.winterSky.src = 'textures/winter/sky-v1.webp';
            }
            if (this.winterSky.complete && this.winterSky.naturalWidth) {
                // Crop to the visible upper half of the viewport so the rosy horizon remains above the road.
                const img = this.winterSky, visibleH = H * .6, sourceW = Math.min(img.width, img.height * W / visibleH);
                g.drawImage(img, (img.width - sourceW) / 2, 0, sourceW, img.height, 0, 0, W, visibleH);
                g.fillStyle = WINTER.sky.horizon; g.fillRect(0, visibleH, W, H - visibleH);
                this.setSkyCanvas(c); return;
            }
            // Soft cloud ribbons baked once into the background, no transparent cloud meshes.
            for (let i = 0; i < 14; i++) {
                const x = ((i * 317) % W), y = H * (.12 + (i % 5) * .065);
                const cloud = g.createRadialGradient(x, y, 0, x, y, W * .2);
                cloud.addColorStop(0, "rgba(245,207,226,.13)"); cloud.addColorStop(1, "rgba(245,207,226,0)");
                g.save(); g.translate(x, y); g.scale(1, .18); g.translate(-x, -y);
                g.fillStyle = cloud; g.fillRect(x - W * .2, y - W * .2, W * .4, W * .4); g.restore();
            }
            this.setSkyCanvas(c); return;
        }
        if (vn) return this.paintSunset(g, W, H, vn, c);
        let seed = 11;
        const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        // звёзды: были одного размера — белые круглые точки, «снег» старой игры. Теперь почти все — пылинки
        // разного размера и яркости, чуть цветные; редкие яркие — с мягким ореолом; к горизонту (засветка города) гаснут
        for (let i = 0; i < SKY.stars; i++) {
            const x = rnd() * W, y = Math.pow(rnd(), 1.6) * H * 0.55, big = rnd() < 0.07;
            const fade = Math.pow(1 - y / (H * 0.55), 0.8);
            const a = (big ? 0.75 + rnd() * 0.25 : 0.15 + Math.pow(rnd(), 2) * 0.6) * fade;
            const tint = rnd() < 0.3 ? "200,210,255" : rnd() < 0.15 ? "255,226,200" : "255,255,255";
            if (big) {
                const halo = g.createRadialGradient(x, y, 0, x, y, 4.5);
                halo.addColorStop(0, `rgba(${tint},${a * 0.5})`); halo.addColorStop(1, `rgba(${tint},0)`);
                g.fillStyle = halo; g.fillRect(x - 5, y - 5, 10, 10);
            }
            g.fillStyle = `rgba(${tint},${a})`;
            g.beginPath(); g.arc(x, y, big ? 1.1 + rnd() * 0.5 : 0.35 + rnd() * 0.5, 0, 7); g.fill();
        }
        const m = SKY.moonDisc, mx = m.x * W, my = m.y * H, r = m.r * W;
        const halo = g.createRadialGradient(mx, my, r * 0.6, mx, my, r * 4);
        halo.addColorStop(0, "rgba(220,200,255,.45)"); halo.addColorStop(1, "rgba(220,200,255,0)");
        g.fillStyle = halo; g.fillRect(0, 0, W, H);
        g.fillStyle = "#f2eaff"; g.beginPath(); g.arc(mx, my, r, 0, 7); g.fill();
        g.fillStyle = "rgba(180,160,220,.35)";
        for (const [a, b, rr] of [[-0.3, -0.2, 0.22], [0.25, 0.15, 0.15], [0.05, 0.35, 0.12]]) { g.beginPath(); g.arc(mx + a * r, my + b * r, rr * r, 0, 7); g.fill(); }
        this.setSkyCanvas(c);
    }

    setSkyCanvas(c) {
        const tex = new THREE.CanvasTexture(c);
        tex.encoding = THREE.sRGBEncoding;
        this.scene.background?.dispose?.();
        this.scene.background = tex;
    }

    // Закат над морем (Нячанг): солнце низко слева над водой, ореол, редкие первые звёзды, силуэты островов у горизонта
    paintSunset(g, W, H, sky, c) {
        const s = sky.sun, sx = s.x * W, sy = s.y * H, r = s.r * W;
        const halo = g.createRadialGradient(sx, sy, r * 0.5, sx, sy, r * 7);
        halo.addColorStop(0, "rgba(255,206,150,.32)"); halo.addColorStop(1, "rgba(255,150,100,0)"); // ореол солнца — мягкий, не белое пятно на полнеба
        g.fillStyle = halo; g.fillRect(0, 0, W, H);
        g.fillStyle = s.color; g.beginPath(); g.arc(sx, sy, r, 0, 7); g.fill();
        let seed = 5;
        const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(255,240,255,${0.15 + rnd() * 0.5})`; g.beginPath(); g.arc(rnd() * W, rnd() * H * 0.25, 0.4 + rnd() * 0.7, 0, 7); g.fill(); }
        // острова: пологие холмы у горизонта над морем (левая половина), солнце садится за них наполовину
        g.fillStyle = sky.islands;
        const base = sy + r * 0.4;
        g.beginPath(); g.moveTo(0, H);
        g.lineTo(0, base);
        for (let x = 0; x <= W * 0.62; x += 8) g.lineTo(x, base - Math.max(0, Math.sin(x / W * 9) * 18 + Math.sin(x / W * 23) * 7 + 10) * (1 - x / (W * 0.62)) * (W / 1024));
        g.lineTo(W * 0.62, base); g.lineTo(W * 0.62, H);
        g.closePath(); g.fill();
        this.setSkyCanvas(c);
    }

    // ---- забег ---------------------------------------------------------------------------

    resetRun() {
        this.speechQ = []; this.speechNow = null; // реплики, ждущие, пока уберут карточку вопроса
        this.storyOk = 0; // верных ответов в этом забеге
        this.storyQ = 0; // сколько табличек главы уже выставлено в этом забеге
        this.pendingInput = null; // табличка с вводом числа: откроется, когда герой до неё добежит
        this.starsT = 0;
        this.fitLevel = 0; document.querySelector(".ticker")?.classList.remove("fit1", "fit2", "fit3"); // кегль капсулы — заново (fitTicker)
        this.storyCatch = false; // глава 1: Мизулина догоняет по сценарию (ролик перед боем)
        this.hintSaid = false; this.storyWaitT = 0; this.afterSpawned = false;
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
        this.coinCount = 0;
        this.cards?.reset();
        this.hecklers?.reset();
        this.chaseLate = 0; // «Фора» за Карты: Мизулина стартует позже
        this.credited = { usdt: 0 }; // сколько из этого забега уже зачислено в кошелёк
        this.appealUsed = false;
        this.boostLeft = 0;
        this.fx = { magnet: 0, honey: 0, shield: false, safe: 0, fly: 0 }; // добавки: секунды магнита, мёда и полёта, щит, неуязвимость
        this.stumble = 0;  // после первого удара: сколько ещё секунд ДПС на хвосте
        this.trip = 0;     // клип «споткнулся» (TRIP)
        this.talkCalm = 0; // сколько ещё секунд дорога пустая — на экране реплика (speech)
        this.sickCatch = null; this.sickDone = false; // больной герой: Мизулина ещё не догоняла
        this.slowLeft = 0;
        this.prevLane = 1;
        if (this.chaser) this.chaser.visible = false;
        this.flight = null;
        if (this.rat.userData) this.rat.userData.clipT = null;
        this.phase = 0;
        this.nextRowZ = this.location === 'winter' ? -28 : -40;
        // стены-возражения: где следующая, серия правильных, ошибки по типам клиентов за забег
        this.nextWallAt = this.wallGap(this.questions ? WALLS.firstAt : ARCHES.firstAt);
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
        if (this.hub.guide.active) return;
        if ((this.state !== "menu" && this.state !== "over") || this.heroLoading) return;
        // перед первым забегом — анкета Гориллы (доход, опыт, капитал, цель)
        if (this.questions && !this.profile.data.anketa && $("anketa").hidden) return this.showAnketa(GORILLA.anketa, () => this.start());
        this.endArrest();
        const run = this.runId = (this.runId || 0) + 1;
        this.audio.unlock();
        this.resetRun();
        if (this.questions && this.story) prize.event(`run:${this.story.id}`); // сервер сам засекает начало забега главы
        // бойцы босса главы — скачиваем в фоне, пока бежим (через 6 с: сначала препятствия и витрины)
        // сюжет — запомнить сейчас: через 6 с его уже может не быть (вышли в меню, глава сменилась) — раньше тут падало «null.opponent»
        const st0 = this.story;
        if (st0) setTimeout(() => { for (const id of [heroFighter(this.heroId), st0.opponent]) preloadModel(FIGHTERS[id]?.model); if (st0.exam && MASK_SCENE.on) preloadModel(MASK_SCENE.model); }, 6000);
        this.cardRunId = null; // «Карта»: сервер засекает старт забега и сам считает лимит карт
        prize.cardRun().then((r) => {
            if (this.runId !== run || !r?.runId) return;
            this.cardRunId = r.runId;
            if (typeof r.cards === "number") this.profile.setCards(r.cards); // баланс ведёт сервер
            for (const id of r.heroes || []) this.profile.unlockHero(id); // эксклюзивные герои, купленные за Карты (хранит сервер)
            this.cardPerks(r.perks || []); // сервер уже списал по одному каждого купленного
            const left = this.profile.data.cardPerksSrv;
            if (left) for (const id of r.perks || []) if (left[id] > 0) left[id]--;
        });
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
        const ch2 = !st && this.questions && this.profile.chapter().index === 1; // глава 2: намёк «Горилла = Павел» (v2.7 §13.2)
        if (ch2) setTimeout(() => this.runId === run && this.state === "playing" && this.gorilla(GORILLA_HINT_CH2, false, 3400), 900);
        if (!st && nb) setTimeout(() => this.runId === run && this.state === "playing" && this.gorilla(nb.text, false, 5200), ch2 ? 5600 : 900);
        if (st && this.questions) setTimeout(() => this.runId === run && this.state === "playing" && this.gorilla((st.chase && !this.grudge && st.chaseHint) || st.hub || `${st.name}: ${st.title}. Страх ${st.fear}. Каждая верная табличка — заряд против босса.`, true, 4500), 900);
        this.chaserSaid = false;
        const sick = this.heroCfg?.sick;
        if (sick) setTimeout(() => this.runId === run && this.state === "playing" && this.hub.toast(sick.start), 1200);
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
        // купленное за Карты — на этот забег (economy_v7)
        this.dashTo = 0;
        if (!prize.online) { // в Telegram купленное хранит сервер — придёт в ответе cardrun (cardPerks ниже)
            const perks = d.cardPerks || {}, took = [];
            for (const id of Object.keys(perks)) if (perks[id] > 0) { perks[id]--; took.push(id); }
            this.cardPerks(took);
            this.profile.save();
        }
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
        if (id === "ryvok") { this.fx.honey = b.time; if (this.grudge && this.stumble > 0) this.grudgeSay("dash"); }
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
        if (!APPEAL_ENABLED || this.state !== "over" || this.appealUsed || !this.profile.pay({ usdt: APPEAL_PRICE })) return;
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
            this.submitRun(); // вышел с паузы — набранное тоже результат забега
            const du = this.usdt - this.credited.usdt;
            this.credited = { usdt: this.usdt };
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
        this.submitRun();
        const isBest = score > this.best;
        if (isBest) {
            this.best = score;
            tg.saveBest(score);
            setTimeout(() => this.audio.play("record"), 700);
        }
        $("over-cause").textContent = cause === "caught" && this.grudge ? `${CHASERS[this.chaserKey()]?.name || "Мизулина"}: «${this.grudgeLine("caught")}»`
            : cause === "caught" && this.sickDone && this.heroCfg?.sick ? this.heroCfg.sick.over
            : cause === "caught" && this.chaserKey() ? pick(this.chaserCfg().caught) : pick(DEATH_TEXT[cause]);
        $("over-new").hidden = !isBest;
        $("over-best").innerHTML = isBest ? "" : `Рекорд <b>${fmt(this.best)}</b>`;
        document.querySelector(".over-card").classList.toggle("is-best", isBest);

        // поймала Мизулина «из принципа» — минус 20% USDT этого забега
        if (cause === "caught" && this.grudge) {
            const cut = Math.round((this.usdt - this.credited.usdt) * CHASE_GRUDGE.penalty);
            this.usdt -= cut;
            setTimeout(() => this.grudgeSay("caught", 3600), 300);
        }
        // в кошелёк — то, что ещё не зачислено (после апелляции забег продолжается)
        const du = this.usdt - this.credited.usdt;
        this.credited = { usdt: this.usdt };
        this.profile.earn(du);
        // проиграл боссу — он ждёт в следующем забеге
        const lostBoss = this.bossFight?.cfg;
        this.endBossFight();
        this.bossCalm = null;
        if (lostBoss) $("over-cause").textContent = `${lostBoss.name}: «${lostBoss.lose}»`;
        $("over-wallet").innerHTML = `В кошелёк <b>+${fmt(du)} USDT</b> · всего ${fmt(this.profile.usdt)} USDT`
            + (this.cards.got ? `<br>Карты <b>+${this.cards.got}</b> · всего ${this.profile.cards}` : "");
        $("over-cards").textContent = this.cards.got;
        const appeal = $("btn-appeal"), canAppeal = this.profile.usdt >= APPEAL_PRICE;
        appeal.hidden = !APPEAL_ENABLED || this.appealUsed;
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
            if (bp) bp.onclick = () => this.hub.razbor();
        }
        setTimeout(() => {
            if (this.state !== "over") return;
            this.show("over");
            $("arrest").hidden = true;
            for (const [id, to, delay] of counters) countUp($(id), to, delay);
        }, arrest ? 2700 : 700);
    }

    // Результат забега — в рейтинг: сервер проверит по своему времени старта (cardRunId) и оставит лучший результат.
    // Один забег можно прислать несколько раз (после апелляции очков больше) — в таблице всё равно максимум
    submitRun() {
        if (this.cardRunId && this.distance > 0) prize.runScore(this.cardRunId, this.distance, this.usdt);
    }

    // очки = профит в USDT ×10 + пройденные метры (так же считает сервер рейтинга — api/_lib/rating.mjs)
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
        if (this.look2) this.squash = { t: 0, up: 1 };
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
            // на вдохе тапы не считаются: раньше 5 тапов набирались ещё до порыва, и он кончался в первый же кадр — Ислам не дул
            if (this.state !== "playing" || !w || w.state !== "gust") return false;
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
        // и дальше — на каждое касание: музыка встала (вернулись в игру из Telegram) — запустить снова
        for (const ev of ["pointerdown", "touchend"]) document.addEventListener(ev, () => this.audio.kick(), { capture: true, passive: true });
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

    // Длинные числа в капсуле HUD не обрезаются: ячейка не вмещает число — кегль на ступень меньше (CSS .ticker.fit1–3).
    // Было: ячейки сжимались вместе с капсулой, и «1 085» очков или «× 531» карт обрезались на узком телефоне.
    // Числа за забег только растут — ступень только увеличиваем (сброс — resetRun); проверка — когда число поменялось
    fitTicker() {
        const t = (this.tickerEl ||= document.querySelector(".ticker"));
        // меряем саму строку с числом: ячейка с полями не переполняется, а число уже вылезает за строку — и «металл»
        // очков (заливка по тексту — только в пределах строки) срезал последнюю цифру: «1 08»
        const over = () => [...t.querySelectorAll(".tk b")].some((el) => el.scrollWidth > el.clientWidth + 1);
        while ((this.fitLevel || 0) < 3 && over()) {
            t.classList.remove(`fit${this.fitLevel}`);
            this.fitLevel = (this.fitLevel || 0) + 1;
            t.classList.add(`fit${this.fitLevel}`);
        }
    }

    // HUD обновляется каждый кадр, а в DOM пишем, только когда значение поменялось: на телефоне каждая запись
    // в textContent — пересчёт вёрстки
    updateHud() {
        const c = (this.hudCache ||= {});
        let changed = false;
        const text = (id, value) => { if (c[id] !== value) { $(id).textContent = c[id] = value; changed = true; } };
        text("hud-usdt", fmt(this.usdt));
        text("hud-cards", fmt(this.profile.cards));
        this.hudScore = Math.max(this.hudScore || 0, this.score()); // счёт на экране только растёт
        text("hud-score", fmt(this.hudScore));
        if (changed) this.fitTicker();
        const hurt = this.stumble > 0 && this.state === "playing";
        if (this.hudHurt !== hurt) document.body.classList.toggle("hurt", (this.hudHurt = hurt));
        // действующие добавки: плашка цвета добавки и полоска, сколько осталось (полное время — с момента, когда
        // таймер последний раз вырос: новая баночка или монета продлевает)
        const hex = (n) => `#${n.toString(16).padStart(6, "0")}`;
        this.renderFx([
            { id: "chase", name: this.chaserCfg().hud, left: this.stumble, color: "#e3343a", danger: true },
            { id: "fly", name: POWERUPS.testo.hud, left: this.flight ? this.fx.fly : 0, color: hex(POWERUPS.testo.color) },
            { id: "x2", name: "×2", left: this.boostLeft, color: "#e9c25a" },
            { id: "magnet", name: POWERUPS.choline.hud, left: this.fx.magnet, color: hex(POWERUPS.choline.color) },
            { id: "honey", name: "Рывок", left: this.fx.honey, color: "#f0a33a" },
            { id: "shield", name: "Щит", left: this.fx.shield ? Infinity : 0, color: "#ffffff" },
            { id: "turbo", name: HERO_SKILLS[this.heroId]?.name || "Турбо", left: this.fx.turbo, color: "#35e39b" },
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
            if (el.dataset.n !== f.name) { el.dataset.n = f.name; el.querySelector(".fx-name").textContent = f.name; } // погоня: Мизулина или Малахов
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

    loop(now = performance.now()) {
        requestAnimationFrame(this.tick);
        // В фоне не прогреваем модели и не обновляем сцену. После возврата нет накопленного dt.
        if (document.hidden || this.sceneCovered()) {
            this.clock.getDelta();
            this.pacer.reset();
            this.frameMeter.reset();
            return;
        }
        if (this.world.warmQueue.length && now - (this.lastWarm || 0) > 400) this.warmUp();
        if (!this.pacer.ready(now, this.frameBudget())) return;
        // шаг времени сглажен: таймер телефона «гуляет» на ±2–4 мс, и без сглаживания дорога едет рывками.
        // Настоящий провал кадра (шаг заметно длиннее обычного) не сглаживаем — иначе мир «отстанет»
        const raw = Math.min(this.clock.getDelta(), 0.05);
        this.dtS = this.dtS && Math.abs(raw - this.dtS) < this.dtS * 0.35 ? this.dtS * 0.8 + raw * 0.2 : raw;
        const dt = this.dtS;
        this.t += dt;
        // «кино»: зерно живёт (время), края смазываются на скорости забега (CINE.speedFrom…speedTo)
        const ou = this.output.uniforms, cine = this.tier.cine || 0;
        ou.time.value = this.fxaa.uniforms.time.value = this.t % 60;
        ou.speed.value = this.state === "playing" && cine && this.tier.fx !== false ? Math.min(1, Math.max(0, (this.speed - CINE.speedFrom) / (CINE.speedTo - CINE.speedFrom))) * CINE.speed * cine : 0;
        // меню: фон мягко размыт (CINE.menu), в фокусе — герой (грудь и голова на экране); к забегу плавно становится резким
        const softTo = this.state === "menu" && cine ? CINE.menu : 0;
        ou.soft.value += (softTo - ou.soft.value) * Math.min(1, dt * 4);
        if (ou.soft.value > 0.002) {
            const p = (this.focusV ||= new THREE.Vector3()).copy(this.rat.position);
            p.y += 1.1;
            p.project(this.camera);
            ou.focus.value.set((p.x + 1) / 2, (p.y + 1) / 2);
            ou.aspect.value = window.innerWidth / Math.max(1, window.innerHeight);
        } else ou.soft.value = softTo ? ou.soft.value : 0;
        this.frameStart = now; // для диагностики: время JS-кадра до отрисовки
        // пауза и итог забега (после падения) — картинка стоит: рисуем один кадр и дальше не перерисовываем
        // (раньше рисовали те же кадры 12 раз в секунду — расход батареи и нагрев впустую)
        const still = this.state === "paused" || (this.state === "over" && !this.arrest && this.t - (this.overAt || 0) > 3);
        if (still && this.stillDrawn) return;
        this.stillDrawn = still;

        // тепловой ограничитель: телефон долго держит 60 кадров — греется и сам начинает тормозить. После HEAT_AFTER с
        // игры подряд рисуем в меньшем разрешении (почти незаметно на маленьком экране), сброс — после 2 мин в меню
        if (this.tier.heat) {
            if (this.state === "playing" || this.state === "fight") this.hot = (this.hot || 0) + dt;
            else if (this.state === "menu") this.hot = Math.max(0, (this.hot || 0) - dt * (HEAT_AFTER / 120));
            const want = this.hot > HEAT_AFTER ? (this.mobile ? 0.9 : 0.85) : 1; // телефон: ниже — заметно мыльнее
            if ((this.heatScale || 1) !== want && (want < 1 || this.state === "menu")) { this.heatScale = want; this.onResize(); }
        }

        if (this.state === "fight") { // бой на той же улице: дождь и NPC живут, улица стоит; камерой правит бой
            this.world.update(dt, 0, this.t);
            this.fight?.update(dt);
            this.render();
            if (this.fight?.phase === "fight") this.measureFps(); // тормозит бой — меньше пикселей (загрузку и заставки не меряем)
            return;
        }
        if (this.state === "playing") this.step(dt);
        else if (this.state === "over" && this.arrest) this.arrestStep(dt);
        else if (this.state === "menu") this.world.update(dt, 3 * dt, this.t); // в меню улица медленно едет
        if (this.state === "playing" || (this.state === "menu" && this.frameBudget() < 50)) this.measureFps();

        const pose = this.state === "over" ? (this.cause === "caught" || this.cause === "cop" ? "fall" : "dead")
            : this.flight ? "fly"
            : this.state === "menu" ? "run"
            : this.slideLeft > 0 ? "slide"
            : this.jumping ? "jump"
            : this.trip > 0 && this.state === "playing" ? "stumble"
            : this.state === "deal" ? "cheer" // победил босса — стоп-кадр с вопросом сделки
            : this.state === "countdown" || this.state === "paused" || this.state === "bossintro" ? "idle" : "run";
        if (this.state === "menu") this.phase += dt * 6;
        if (this.trip > 0) this.trip -= dt;
        animateRat(this.rat, pose, this.t, this.phase, dt, this.speed);
        this.updateStars(dt);
        this.moon.position.set(this.x - 4, 12, -14);
        this.moon.target.position.set(this.x, 0, -3);

        // В меню камера спереди — герой лицом к игроку во всех локациях (и в зимней: со спины его закрывало меню)
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

        this.render();
    }

    // Кадр. Лёгкая графика (direct) — сразу на экран, без буфера постобработки и двух полноэкранных проходов
    // (тонмаппинг и FXAA): на телефонах это главный расход — видеокарта упирается в число закрашиваемых пикселей.
    // Тонмаппинг тогда делает сам Three.js (ACES), виньетка — слой #vig поверх холста
    render() {
        this.world?.coinBatch?.sync(this.tier.far);
        if (this.direct) this.renderer.render(this.scene, this.camera);
        else this.composer.render();
    }

    // Яркость кадра под локацию. С постобработкой экспозиция идёт прямо в ACES (×1,45), без неё — через тонмаппинг
    // Three.js (≈×0,92): ночью разница не видна, а солнечный Нячанг на хорошей графике пересвечивало и заливало жёлтым
    // свечением. Днём (VIETNAM.post) свечение слабее и экспозиция постобработки ниже; прямая отрисовка не меняется
    applyLook() {
        const vn = this.location === "vietnam" && VIETNAM.post;
        if (this.bloom) this.bloom.strength = this.tier?.bloom ? (vn ? vn.bloom : 0.8) : 0;
        if (!this.output) return;
        this.output.uniforms.exposure.value = (this.look2 ? LOOK2.exposure : SKY.exposure) * (vn ? vn.exposure : 1);
        this.output.uniforms.grade.value = (this.tier?.cine ? CINE.grade : 0) * (vn ? vn.grade : 1); // днём тёплый тон слабее
    }

    setDirect(on) {
        this.direct = on;
        const R = this.renderer;
        R.toneMapping = on ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
        R.toneMappingExposure = (this.look2 ? LOOK2.exposure : SKY.exposure) * 0.55; // ACES в Three.js делит на 0,6; чуть ниже — нет прохода контраста/сочности
        document.body.classList.toggle("direct", on);
        this.scene.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; });
    }

    // Графика: отражения на асфальте, тени и свечение — самое дорогое (QUALITY_TIERS в config.js)
    setQuality(level) {
        const prevShadows = this.tier.shadows;
        this.quality = level;
        // на телефоне у уровня свои облегчения (phone), а при нехватке кадров — снятые эффекты (perfStep, measureFps):
        // 1 — без зеркала луж, 2 — без теней, 3 — без свечения и «кино»
        const base = QUALITY_TIERS[level], s = this.perfStep || 0;
        this.tier = { ...base, ...(this.mobile && base.phone), ...(s >= 1 && { reflections: false }), ...(s >= 2 && { shadows: false }), ...(s >= 3 && { bloom: 0, cine: 0 }) };
        const shadowSize = this.tier.shadowSize || 1024;
        if (this.moon.shadow.mapSize.x !== shadowSize) { this.moon.shadow.mapSize.set(shadowSize, shadowSize); this.moon.shadow.map?.dispose(); this.moon.shadow.map = null; }
        if (this.tier.reflections && this.location !== "winter") { // зимой асфальт под снегом — зеркала луж нет
            // отражение в лужах размыто шейдером — полное разрешение не нужно: 0,45 экрана, не больше 512 (мягче и быстрее)
            const w = Math.min(512, Math.round(window.innerWidth * this.renderer.getPixelRatio() * 0.45));
            this.world.enableReflections(w, Math.round(w * window.innerHeight / window.innerWidth));
        } else {
            this.world.disableReflections();
        }
        this.renderer.shadowMap.enabled = this.tier.shadows;
        this.moon.castShadow = this.tier.shadows;
        if (prevShadows !== this.tier.shadows) { // шейдеры с тенями и без — разные, пересобрать
            this.scene.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; });
        }
        this.applyLook(); // сила свечения и экспозиция — под уровень графики и локацию
        // сглаживание: msaa — 4 выборки в буферах постобработки (WebGL2, сильные устройства), fxaa — дешёвый проход в конце
        const samples = this.tier.aa === "msaa" && this.renderer.capabilities.isWebGL2 ? 4 : 0;
        for (const rt of [this.composer.renderTarget1, this.composer.renderTarget2]) if (rt.samples !== samples) { rt.samples = samples; rt.dispose(); }
        this.fxaa.enabled = this.tier.aa === "fxaa" || (this.tier.aa === "msaa" && !samples);
        // «кино»: на слабой графике выключено (лишние выборки текстуры), зерно — в последнем проходе (FXAA, если он есть)
        const k = this.tier.cine || 0, u = this.output.uniforms;
        const fx = this.tier.fx === false ? 0 : k; // телефон: без зерна и хроматики — на маленьком экране это шум и мыло
        u.grade.value = k ? CINE.grade * (this.location === "vietnam" ? VIETNAM.post.grade : 1) : 0; u.ca.value = CINE.ca * fx;
        u.grain.value = this.fxaa.enabled ? 0 : CINE.grain * fx; this.fxaa.uniforms.grain.value = this.fxaa.enabled ? CINE.grain * fx : 0;
        this.world.setTier(this.tier); // дождь и лишние живые NPC — по новому уровню
        const direct = !!this.tier.direct && !this.look2;
        if (direct !== !!this.direct) this.setDirect(direct);
        // дальше — туман: не рисуем то, чего всё равно не видно
        this.camera.far = this.tier.far;
        this.scene.fog.far = this.tier.far - 12;
        this.camera.updateProjectionMatrix();
        this.applyLocationLook();
        this.onResize();
    }

    // настройка: music | sfx | vibro (вкл/выкл) или quality (auto | high | medium | low)
    setSetting(key, value) {
        this.settings[key] = value;
        try { localStorage.setItem("p2p_settings", JSON.stringify(this.settings)); } catch {}
        this.applySettings();
        if (key === "perf") this.perf.toggle(!!value);
        if (key === "frameRate" || key === "quality") {
            this.performanceFpsCap = 0;
            this.frameMeter.reset();
        }
        if (key === "location") {
            const url = new URL(location.href);
            url.searchParams.delete("location");
            history.replaceState(null, "", url);
            this.setLocation(this.heroLocation(this.heroId));
            this.hub?.updatePlay();
        }
        if (key === "quality") {
            this.resScale = 1;
            this.perfStep = 0;
            const level = value === "auto" ? this.autoQuality : value;
            if (level !== this.quality) this.setQuality(level); else this.onResize();
        }
    }

    // режим «с вопросами» (по умолчанию) или «просто бежать». Новый игрок идёт только по сюжету:
    // свободные забеги открываются, когда весь сюжет пройден (экзамен Инакова сдан) — до этого настройка не действует
    get questions() { return !this.heroCfg?.free && (!this.storyDone || this.settings.questions !== false); } // free-герои — только свободный бег
    get storyDone() { return !!this.profile?.data.exam; }

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

    // Меряем кадры (в забеге, бою и меню): стабильно не успеваем — сначала меньше пикселей, потом графика на ступень ниже.
    // Графика выбрана вручную (настройка или QUALITY в конфиге) — уровень не трогаем, но разрешение снижаем всё равно:
    // иначе на «Высокой» телефон так и остаётся на 15 кадрах
    measureFps() {
        if (this.measuredState !== this.state) {
            this.measuredState = this.state;
            this.frameMeter.reset();
        }
        if (this.state === "playing" && this.runTime < 1.5) { this.frameMeter.reset(); return; }
        const fps = this.frameMeter.sample(performance.now());
        if (fps === null) return;
        const target = Math.min(60, 1000 / this.frameBudget());
        // Повышенная частота требует запаса. При нехватке сначала возвращаем 60,
        // сохраняя разрешение; настройка «До 120» может быть выбрана повторно.
        // 30.10: раньше при fps < 55 тут же снижались разрешение и эффекты — «120» на телефоне превращало картинку в мыло.
        // Теперь только возврат к 60 и новый замер: качество трогаем, лишь если не тянет и 60
        if (this.frameBudget() < 1000 / 60 && fps < 85) {
            this.performanceFpsCap = 60;
            this.frameMeter.reset();
            return;
        }
        if (fps >= target * 0.85) return;
        const tierLocked = QUALITY !== "auto" || (this.settings.quality && this.settings.quality !== "auto");
        // телефон: разрешение — не ниже 0,75 (ниже — мыло на маленьком экране), графику ниже средней сам не снижаем:
        // в Telegram кадры то и дело проседают на долю секунды, и игра уезжала в слабую графику — размытую и рывками
        const resMin = this.mobile ? 0.85 : RES_MIN;
        const floor = this.resScale <= resMin + 0.01;
        // Не хватает кадров: разрешение — только до 0,85, дальше сначала снимаем дорогие эффекты (зеркало луж, тени,
        // свечение), и лишь потом снова разрешение. Было: сразу до 0,6 — на хорошей графике картинка мыльная и пиксельная
        const effects = this.quality !== "low" && (this.perfStep || 0) < 3;
        if (this.resScale <= 0.86 && effects && this.state !== "fight") {
            this.perfStep = (this.perfStep || 0) + 1;
            this.setQuality(this.quality);
        } else if (!floor) {
            this.resScale = Math.max(this.resScale > 0.86 && effects ? 0.85 : resMin, Math.round((this.resScale - (fps < 30 ? 0.2 : 0.1)) * 100) / 100);
            this.onResize();
        } else if (!tierLocked && this.quality !== "low" && !(this.mobile && this.quality === "medium" && fps >= 24)) {
            if (this.state === "fight") return; // не пересобираем шейдеры посреди раунда
            this.resScale = 0.85;
            this.perfStep = 0;
            this.setQuality(this.quality === "high" ? "medium" : "low");
        } else if (tierLocked && !this.qualityHinted) {
            this.qualityHinted = true;
            this.hub.toast("Телефон не тянет эту графику — в настройках поставь «Авто»");
        }
    }

    // частота забега: выбранная в настройках, по умолчанию на телефоне 60 (120 — вдвое больше работы видеокарте:
    // телефон грелся и через пару минут сбрасывал частоту сам), на компьютере — до 120
    frameRate() { return this.settings.frameRate === 120 ? 120 : this.settings.frameRate === 60 || this.mobile ? 60 : 120; }

    // До 120 FPS в активной игре; меню и неподвижные экраны берегут батарею.
    frameBudget() {
        const requested = this.frameRate();
        const active = Math.min(requested, this.performanceFpsCap || requested);
        if (this.state === "fight" || this.state === "playing" || this.state === "countdown" || this.state === "bossintro") return 1000 / active;
        if (this.state === "over" && this.t - this.overAt < 0.7) return 1000 / active;
        if (this.state === "over" && this.arrest && this.arrest.t < 2.8) return 1000 / 60;
        if (this.state === "menu" && this.hub?.current === "run") return 1000 / this.tier.fps[1];
        return 1000 / 12;
    }

    // сцену целиком закрывает фон разделов («Герои», «Кейсы», «NS Store», «Главы») или экран открытия кейса
    sceneCovered() {
        if (this.hub?.guide?.active) return true;
        return this.state === "menu" && ((this.hub?.current && this.hub.current !== "run") || !$("case-open").hidden);
    }

    // Выбор персонажа: модель грузится один раз, клипы прыжка и подката подгоняются под их длительность
    // Стартовая загрузка: экран #boot (виден сразу из HTML) держим, пока не загружен герой и не затихли
    // загрузки моделей/текстур (DefaultLoadingManager), потом собираем шейдеры под ним — меню открывается без подлагиваний.
    // Страховка — не дольше 15 с (плохая сеть): дальше догрузится в фоне.
    bootWatch() {
        const M = THREE.DefaultLoadingManager, t0 = performance.now();
        let done = 0, total = 0, quietSince = performance.now(), shown = 0.04;
        const prev = M.onProgress;
        M.onProgress = (url, l, t) => { done = l; total = t; if (l < t) quietSince = 0; else quietSince = performance.now(); prev?.(url, l, t); };
        M.onStart = () => { quietSince = 0; };
        const pctEl = $("boot-pct"), segs = [...$("boot-seg").children], sub = $("boot-sub"), tipEl = $("boot-tip");
        let seen = 0, tipI = Math.floor(Math.random() * BOOT_TIPS.length), tipAt = 0;
        // проценты бегут к цели плавно (а не скачками по файлам); подсказка меняется раз в 3,5 с
        const draw = (v) => {
            seen = v >= 1 ? 100 : Math.max(seen, Math.min(seen + 6, seen + (v * 100 - seen) * 0.45));
            const n = Math.floor(seen);
            pctEl.firstChild.nodeValue = n;
            segs.forEach((g, i) => g.classList.toggle("on", n >= (i + 1) * 10));
        };
        const tip = (now) => {
            if (now - tipAt < 3500) return;
            const first = !tipAt;
            tipAt = now;
            tipEl.style.opacity = 0;
            setTimeout(() => { tipEl.innerHTML = BOOT_TIPS[tipI++ % BOOT_TIPS.length]; tipEl.style.opacity = 1; }, first ? 0 : 300);
        };
        const tick = () => {
            const now = performance.now(), boot = $("boot");
            if (!boot || boot.classList.contains("out")) return;
            const hero = !this.heroLoading && !!this.heroes?.[this.heroId];
            const quiet = quietSince && now - quietSince > 600;
            const pct = Math.min(0.96, 0.08 + (hero ? 0.42 : 0) + 0.5 * (total ? done / total : 0));
            shown = Math.max(shown, pct);
            draw(shown);
            tip(now);
            sub.textContent = !hero ? "Загружаем героя…" : !quiet ? "Загружаем улицу…" : "Готовим графику…";
            if ((hero && quiet && now - t0 > 900) || now - t0 > 15000) {
                draw(1);
                // шейдеры всей сцены — сейчас, под экраном загрузки, а не первым кадром меню
                setTimeout(() => {
                    try { this.renderer.compile(this.scene, this.camera); } catch {}
                    boot.classList.add("out");
                    setTimeout(() => boot.remove(), 500);
                }, 50);
                return;
            }
            setTimeout(tick, 150);
        };
        setTimeout(tick, 150);
    }

    get heroCfg() { return CHARACTERS.find((c) => c.id === this.heroId); }

    // расстояние до следующей стены или арки (м): больному герою (Денчик, sick.walls) — ближе, он идёт в разы медленнее,
    // и стены по времени встречаются так же часто, как у остальных
    wallGap(m) { return m * (this.heroCfg?.sick?.walls ?? 1); }

    // Локация забега по герою: у Димы и Саши — Нячанг (VIETNAM), у остальных — ночной район. Небо и дымка — тоже свои
    setLocation(name, force = false) {
        if (this.location === name && !force) return;
        this.location = name;
        if (!this.world) return;
        this.world.setLocation(name);
        this.scene.fog.color.set(name === "vietnam" ? VIETNAM.fog : SKY.color);
        // свет и отражения локации: Нячанг — солнечный вечер (VIETNAM.light/env), район — фиолетовая ночь
        const vn = name === "vietnam" && VIETNAM.light;
        if (this.hemi) {
            this.hemi.color.set(vn ? vn.hemi[0] : SKY.hemi[0]); this.hemi.groundColor.set(vn ? vn.hemi[1] : SKY.hemi[1]);
            this.hemi.intensity = vn ? vn.hemiI : this.look2 ? LOOK2.hemi : SKY.light;
            this.moon.color.set(vn ? vn.sun : SKY.moon); this.moon.intensity = vn ? vn.sunI : 0.9;
        }
        this.envs ||= { street: this.scene.environment };
        if (vn && !this.envs.vietnam) this.envs.vietnam = buildEnvironment(this.renderer, VIETNAM.env);
        this.scene.environment = this.envs[vn ? "vietnam" : "street"] || this.scene.environment;
        this.world.dayGlow(vn ? VIETNAM.glow : 1); // днём фонари и окна не горят по-ночному
        this.scene.fog.near = vn ? VIETNAM.fogNear : this.look2 ? LOOK2.fog[0] : 12; // днём воздух прозрачнее — дымка дальше
        this.applyLook();
        this.skyKey = null;
        this.paintSky();
        this.setQuality(this.quality);
    }

    heroLocation(id) {
        // зимний район — начальный; ночной район — в настройках (location "street"); у Димы и Саши — свой Нячанг
        if (VIETNAM.heroes.includes(id)) return "vietnam";
        return this.settings.location === "street" ? "street" : "winter";
    }

    // Вид зимнего района (WINTER): свет, дымка, дальность и цвет кадра. Район и Нячанг свет ставят в setLocation и
    // applyLook — здесь им возвращаем только то, что зима меняет сверх них (сочность, контраст, виньетка, тонмаппинг)
    applyLocationLook() {
        const winter = this.location === "winter", u = this.output.uniforms;
        u.sat.value = winter ? 1.06 : this.look2 ? LOOK2.sat : CINE.sat;
        u.contrast.value = winter ? 1.12 : this.look2 ? LOOK2.contrast : CINE.contrast;
        u.vig.value = winter ? .64 : this.look2 ? LOOK2.vignette : SKY.vignette;
        this.renderer.toneMappingExposure = (winter ? 1.35 : this.look2 ? LOOK2.exposure : SKY.exposure) * .55;
        document.body.classList.toggle("winter", winter);
        this.world.winter?.sync();
        if (this.world.vietnam?.on) this.world.vietnam.sync();
        if (!winter) return;
        this.hemi.color.set(WINTER.hemi[0]); this.hemi.groundColor.set(WINTER.hemi[1]);
        this.hemi.intensity = WINTER.light;
        this.moon.color.set(WINTER.moon); this.moon.intensity = .8;
        this.scene.fog.color.set(WINTER.fog);
        this.scene.fog.near = WINTER.near;
        this.scene.fog.far = WINTER.far;
        this.camera.far = WINTER.viewFar;
        this.camera.updateProjectionMatrix();
        u.exposure.value = 1.35;
    }

    selectHero(id) {
        this.heroId = id;
        this.setLocation(this.heroLocation(id));
        this.world?.loadHeroChaser(CHARACTERS.find((c) => c.id === id)?.chaser); // Малахов за эксклюзивными героями
        this.audio.setRunTracks(SOUNDS.heroMusic[id] || SOUNDS.music.run, SOUNDS.heroMusicGain[id] || 1); // у Саши и Ислама — своя музыка забега
        try { localStorage.setItem("p2p_hero", id); } catch {}
        for (const b of document.querySelectorAll(".hero")) b.classList.toggle("active", b.dataset.id === id);
        const cfg = CHARACTERS.find((c) => c.id === id);
        const air = (2 * BALANCE.jumpPower) / BALANCE.gravity;
        // длины прыжка и подката — из баланса; свои тайминги героя (durations.run у Денчика) сохраняем
        const opts = { ...cfg, durations: { ...cfg.durations, jump: air + 0.35, slide: BALANCE.slideTime * (HERO_PERKS[id]?.slide || 1) + 0.2 } };
        // кнопку «Забег» (плитка 01) ведёт главная: пока модель грузится, в забег не пускаем
        const apply = (gltf) => {
            if (this.heroId !== id) return;
            attachModel(this.rat, gltf, opts);
            if (this.heroGlow) markGlow(this.rat); // ореол «Ночь+» — по слою героя
            this.showRat(true);
            this.heroLoading = false;
            this.hub?.updatePlay();
            releaseQueue(); // герой на месте — теперь можно грузить препятствия и витрины
        };
        if (this.heroes[id]) return apply(this.heroes[id]);
        this.heroLoading = true;
        this.hub?.updatePlay();
        // clipsUrl — клипы, перенесённые с другого героя (у Гориллы — бег, прыжок, подкат Павла): докладываем к модели
        const withClips = (gltf) => !cfg.clipsUrl ? Promise.resolve(gltf) : fetch(cfg.clipsUrl).then((r) => r.json())
            .then((list) => { for (const c of list) gltf.animations.push(parseClip(c)); return gltf; }).catch(() => gltf);
        loadModel(
            cfg.url,
            (gltf) => withClips(gltf).then((g) => { this.heroes[id] = g; upgradeTextures(g.scene, cfg.hd, this.tier.hd); apply(g); }),
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
        const sick = this.heroCfg?.sick; // больной герой (Денчик) — ковыляет весь забег с одной скоростью, без разгона
        this.speed = sick ? sick.speed : Math.min(BALANCE.speedMax, BALANCE.speedStart + this.runTime * BALANCE.speedRamp);
        // раз за забег; после апелляции забег идёт дальше без повторного ареста — так главу за Денчика можно пройти
        if (sick && !this.sickDone && this.runTime >= sick.catchAt && this.state === "playing" && !this.bossFight && !this.storyOn && !this.flight) this.sickCatchStart(sick);
        if (this.slowLeft > 0) { // споткнулся — пару шагов медленнее
            this.slowLeft -= dt;
            this.speed *= 0.55 + 0.45 * (1 - this.slowLeft / BALANCE.stumbleSlow);
        }
        if (this.fx.turbo > 0) this.speed *= 1.3; // «Напор» / «Попутный ветер»
        if (this.fx.honey > 0) this.speed *= 1.15; // «Рывок»
        if (this.dashTo && this.distance < this.dashTo) { this.speed *= CARD_DASH.speed; this.fx.safe = Math.max(this.fx.safe, 0.5); } // «Рывок» за карты
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
        // у стены больной герой не замедляется: он и так идёт со скоростью «у таблички» (×0,08 — почти стоял бы на месте)
        const slowTo = slow && !sick ? 0.08 : Math.min(windSlow, ventSlow);
        this.slowK = (this.slowK ?? 1) + (slowTo - (this.slowK ?? 1)) * Math.min(1, dt * (slowTo < 1 ? 5 : 3));
        this.speed *= this.slowK;
        if (this.slowmo !== slow) { this.slowmo = slow; document.body.classList.toggle("slowmo", slow); $("wq-hint").textContent = slow ? "Нажми ответ или свайпни вверх на его полосе" : "Беги в правильный ответ"; }
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
        this.world.wallClear = this.wallClear();
        if (this.talkCalm > 0) this.talkCalm -= dt;
        while (this.nextRowZ > SPAWN_Z) {
            // в зоне стены (до неё и после) ряд не ставим — даже если стену отодвинул полёт или скорость выросла;
            // и ряд, который доедет до героя, пока на экране реплика (talkCalm)
            const talking = this.talkCalm > 0 && -this.nextRowZ < this.talkCalm * this.speed;
            if (!this.nearWall(this.nextRowZ) && !talking) this.world.spawnRow(this.nextRowZ, difficulty, this.speed);
            // в Нячанге (свободный бег Димы и Саши, без стен) ряды чаще — VIETNAM.rowGap; зимой свои интервалы — WINTER.rowGap
            const [gapStart, gapMin] = this.location === "winter" ? WINTER.rowGap : [BALANCE.rowGapStart, BALANCE.rowGapMin];
            const gap = (gapStart - (gapStart - gapMin) * difficulty) * (this.location === "vietnam" ? VIETNAM.rowGap : 1);
            this.nextRowZ -= gap * (0.85 + Math.random() * 0.4);
        }
        // в полёте стены не ставим (их бы пролетели, не ответив) — поставим сразу после приземления
        if (this.flight) this.nextWallAt = Math.max(this.nextWallAt, this.distance - SPAWN_Z); // срок не «протухает» — после посадки стена встанет вдали, а не за спиной
        else if (!quiet && this.distance - SPAWN_Z >= this.nextWallAt) this.questions ? this.spawnWall() : this.spawnArch();
        if (!quiet && this.distance - SPAWN_Z >= this.nextWindAt) this.spawnWind();
        if (!quiet && this.distance - SPAWN_Z >= this.nextVentAt) this.spawnVent();
        this.watchBoss(dt, move);
        this.world.update(dt, move, this.t);
        this.cards.update(dt, move);
        this.hecklers.update(dt, move);
        this.watchWall();
        this.speechTick();
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
                if (this.look2) this.squash = { t: 0, up: 0 };
            }
        }
        if (this.slideLeft > 0) {
            this.slideLeft -= dt;
            this.sprayIn = (this.sprayIn || 0) - dt;
            if (!this.jumping && this.sprayIn <= 0) { this.world.spray(this.x, 0); this.sprayIn = 0.04; }
        }
        this.world.playerX = this.x;
        this.rat.position.set(this.x, this.y, 0);
        this.rat.rotation.z = (this.x - targetX) * (this.look2 ? LOOK2.lean : 0.25) - ((this.windSlide || 0) * 0.09 + (this.ventPush || 0) * 0.14); // наклон при перестроении и против ветра
        if (this.look2) { // доворот корпуса в сторону перестроения и сжатие/вытягивание (взлёт — 0,22 с, приземление — 0,2 с)
            this.rat.rotation.y = (this.x - targetX) * -LOOK2.yaw;
            const q = this.squash; let sy = 1, sx = 1;
            if (q) { q.t += dt; const dur = q.up ? 0.22 : 0.2, k = Math.min(1, q.t / dur), a = Math.sin(Math.PI * k);
                if (q.up) { sy = 1 + a * LOOK2.stretch; sx = 1 - a * LOOK2.stretch * 0.5; } else { sy = 1 - a * LOOK2.squash; sx = 1 + a * LOOK2.squash * 0.6; }
                if (k >= 1) this.squash = null; }
            this.rat.scale.set(sx, sy, sx);
        }
        const blob = this.rat.userData.blob;
        blob.position.x = this.x;
        blob.scale.setScalar(1 - Math.min(0.5, this.y * 0.2));
        blob.material.opacity = 0.55 * (1 - Math.min(0.7, this.y * 0.35)); // в прыжке и полёте пятно бледнеет — видно высоту
        blob.visible = this.rat.visible; // бой прячет героя — пятно не должно остаться на ринге

        if (this.sickCatch) this.sickCatchStep(dt);
        else if (this.stumble > 0) this.chase(dt);
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
        this.stumble = BALANCE.stumbleTime; // время погони одно; «из принципа» — Мизулина бежит быстрее (chase)
        this.starsT = 2.2; // звёздочки над головой — «оглушило»
        this.trip = TRIP; // клип «споткнулся» (у кого есть), потом снова бег
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
            this.grudgeSay("stumble", 2200);
            const run = this.runId;
            setTimeout(() => { if (this.runId === run && this.state === "playing" && this.stumble > 0) this.grudgeSay("run", 2200); }, 2300);
            if (!this.grudgeTold) { this.grudgeTold = true; setTimeout(() => this.runId === run && this.state === "playing" && this.gorilla(this.grudgeLine("gorilla"), false, 3000), 4600); }
        } else if (!this.chaserSaid) { // первая погоня за забег — Мизулина представляется (после подсказки стены)
            this.chaserSaid = true;
            const run = this.runId;
            setTimeout(() => { if (this.runId === run && this.state === "playing" && this.stumble > 0) { const cc = this.chaserCfg(); this.hub.toast(`${cc.name}: «${cc.start}»`); } }, 1400);
        }
        this.chaser.position.set(this.x, 0, 7); // выбегает из-за камеры
        this.chaser.userData.side = this.lane === 2 ? -1 : 1; // сбоку-сзади, чтобы не закрывать героя
    }

    // бежит Мизулина (CHASER); пока не загрузилась — живой инспектор, а без него спрайт. Появилась модель лучше — меняем
    // кто гонится: свой преследователь героя (CHASERS — Малахов за Димой и Сашей Товарусом); сюжетная погоня — Мизулина
    chaserKey() {
        if (this.storyCatch) return null; // захват перед боем главы 1 — Мизулина (дальше бой с ней)
        return CHARACTERS.find((c) => c.id === this.heroId)?.chaser || null;
    }
    // реплика погони «из принципа»: у своего преследователя (Малахов) — его, иначе Мизулины
    grudgeSay(kind, ms) {
        const own = CHASERS[this.chaserKey()]?.grudge, line = (own || CHASE_GRUDGE.lines)[kind];
        this.speech(own ? this.chaserCfg(this.chaserKey()).name : "Мизулина", Array.isArray(line) ? pick(line) : line, ms);
    }
    grudgeLine(kind) { return (CHASERS[this.chaserKey()]?.grudge || CHASE_GRUDGE.lines)[kind]; }
    chaserCfg(key = this.chaserKey() ?? this.chaser?.userData.chaserKey ?? null) { // имя и реплики — по герою, даже пока модель грузится
        return key && CHASERS[key] ? CHASERS[key] : { ...CHASER, name: "Мизулина", start: CHASER_LINES.start };
    }

    ensureChaser() {
        const key = this.chaserKey(), own = key && this.world.chaserModels?.[key];
        if (key && !own) this.world.loadHeroChaser(key); // ещё не грузился — пока бежит Мизулина, потом сменится
        // не тот преследователь (сменили героя / сюжет) или загрузилась модель лучше — пересоздаём
        const wrong = this.chaser && (this.chaser.userData.chaserKey ?? null) !== (own ? key : null);
        const better = key ? false : this.world.chaserModel ? !this.chaser?.userData.chaser : this.world.officer && !this.chaser?.userData.mixer;
        if (!this.chaser || better || wrong) {
            if (this.chaser) this.world.dropObstacle(this.chaser); // убрать со сцены и освободить скелет
            // свой преследователь (Малахов) ещё грузится — пока бежит инспектор ДПС, но не Мизулина
            this.chaser = (own && this.world.makeChaser(key)) || (!key && this.world.makeChaser()) || this.world.makeOfficer(POLICE_OFFICER.run) || (key && this.world.makeChaser());
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

    // Карта собрана: девушка говорит, счётчик подпрыгивает; первая в жизни — подсказка Гориллы
    // купленное за Карты — на этот забег (economy_v7); ids — локальные (x2, magnet, late, dash) или серверные (CARD_SHOP.srv)
    cardPerks(ids) {
        const has = (c) => ids.includes(c.id) || ids.includes(c.srv), got = [];
        for (const c of CARD_SHOP) {
            if (!has(c)) continue;
            if (c.id === "x2") this.boostLeft = 1e6;
            if (c.id === "magnet") this.fx.magnet = 1e6;
            if (c.id === "late") this.chaseLate = 10;
            if (c.id === "dash") this.dashTo = this.distance + CARD_DASH.meters;
            got.push(c.name);
        }
        if (got.length) this.hub.toast(`За Карты: ${got.join(", ")}`);
    }

    cardFx(line, n = 1) {
        // сервер проверяет карту (забег этого игрока, не больше 2, не быстрее лимитов) и отвечает балансом —
        // его и показываем, чтобы баланс в игре не расходился с сервером (отказ — карта не засчитана)
        if (this.cardRunId) prize.card(this.cardRunId).then((r) => {
            if (typeof r?.cards === "number") this.profile.setCards(r.cards);
            else if (r?.status === 403) this.profile.addCards(-1);
        });
        const chip = $("hud-cards").closest(".tk");
        chip.classList.remove("got"); void chip.offsetWidth; chip.classList.add("got");
        this.hub.toast(`«${line}» · +1 Карта (${n} из ${CARDS.perRun} за забег)`);
        tg.haptic("success");
        const d = this.profile.data;
        if (!d.cardTold) { d.cardTold = true; this.profile.save(); setTimeout(() => this.state === "playing" && this.gorilla(CARDS.first, true, 3600), 1800); }
    }

    cardMissed() { if (this.state === "playing") this.hub.toast(CARDS.missed); }

    pulseChip(chip) {
        const now = performance.now();
        if (this.calm || now - (this.lastPulse || 0) < 120) return;
        this.lastPulse = now;
        chip.animate([{ transform: "scale(1)" }, { transform: "scale(1.14)" }, { transform: "scale(1)" }], { duration: 220, easing: "ease-out" });
    }

    // больной герой: на середине пути Мизулина догоняет (за 2,6 с из-за спины к плечу) и задерживает — сцена ареста
    sickCatchStart(sick) {
        this.sickDone = true;
        this.sickCatch = { t: 0 };
        this.stumble = 0;
        this.ensureChaser();
        this.chaser.visible = true;
        this.chaser.position.set(this.x, 0, 7);
        this.chaser.userData.side = this.lane === 2 ? -1 : 1;
        this.audio.play("whistle");
        this.speech("Мизулина", sick.catchLine, 2600);
    }

    sickCatchStep(dt) {
        const c = this.chaser, q = this.sickCatch;
        q.t += dt;
        const k = Math.min(1, q.t / 2.6);
        c.position.z += ((7 - 6.2 * k * k) - c.position.z) * Math.min(1, dt * 6);
        c.position.x += (this.x + c.userData.side * 0.7 - c.position.x) * Math.min(1, dt * 5);
        if (c.userData.mixer) { c.rotation.y = Math.PI; c.userData.mixer.update(dt * 1.2); }
        if (k >= 1 && this.state === "playing") { this.sickCatch = null; this.gameOver("caught"); }
    }

    // ДПС бежит за спиной, пока не отстанет
    chase(dt) {
        this.stumble -= dt;
        const c = this.chaser;
        // «из принципа» Мизулина бежит на CHASE_GRUDGE.speed быстрее: держится ближе и отстаёт медленнее
        // (время погони stumbleTime то же — меняется только скорость её бега)
        const k = this.grudge ? CHASE_GRUDGE.speed : 1;
        const z = this.stumble > 1 ? 1.7 : 1.7 + (1 - this.stumble) * 8 / k; // в конце отстаёт (медленнее, если «из принципа»)
        c.position.z += (z - c.position.z) * Math.min(1, dt * 4 * k);
        c.position.x += (this.x + c.userData.side * 0.95 - c.position.x) * Math.min(1, dt * 5);
        if (c.userData.mixer) { // бежит туда же, куда герой
            c.rotation.y = Math.PI;
            c.userData.mixer.update(dt * Math.max(0.8, this.speed / 14) * (this.grudge ? CHASE_GRUDGE.speed : 1));
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
        this.pushWalls(); // стены-вопросы впереди — за точку приземления: не пролететь их и не садиться раньше времени
        if (!first) return;
        const h = POWERUPS.testo.height + 0.5;
        const len = Math.max(this.speed || 0, BALANCE.speedStart) * time;
        let lane = this.lane;
        for (let z = -12, i = 0; z > -len + 4; z -= 2.2, i++) {
            if (i && i % 8 === 0) lane = Math.max(0, Math.min(2, lane + (Math.random() < 0.5 ? -1 : 1)));
            this.world.addCoin(lane, z, h);
        }
    }

    // отодвинуть неотвеченные стены, до которых долетим в воздухе, — за место посадки (+30 м на разбег к вопросу)
    pushWalls() {
        const f = this.flight; if (!f) return;
        const air = Math.max(this.speed || 0, BALANCE.speedStart) * (f.dur - f.e + 1.4) + 30;
        for (const w of this.walls) {
            if (w.answered) continue;
            const z = w.plates[0].position.z;
            if (z < -air || z > 2) continue;
            const dz = -air - 4 - z;
            for (const o of [...w.plates, ...(w.parts || [])]) o.position.z += dz;
            this.world.clearAround(z + dz);
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
                this.clearChosen();
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
                this.clearChosen();
            }
            this.y = 0;
            clipT = lerp(c.touch, c.end, (f.e - f.dur - LAND_AIR) / LAND_GROUND);
        } else { // дальше бежит
            this.flight = null;
            this.clearChosen();
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
        // «Ислам дует» ещё на дороге — стена позже: в порыве героя сносит с выбранной полосы. Раньше проверял только
        // порыв (и видел лишь уже стоящие стены), и стена, назначенная через 10–20 м после него, вставала прямо за Исламом
        if (this.wind) { this.nextWallAt += 40; return; }
        const pend =this.questions && !this.afterSpawned && STORIES.find((x) => x.id === this.profile.data.afterPending && x.after);
        if (pend) { // 1.4 ещё не отвечена — первой стеной этого забега
            this.afterSpawned = true; // ставим один раз за забег
            const z = -(this.nextWallAt - this.distance);
            this.nextWallAt += this.wallGap(WALLS.every[0] + Math.random() * (WALLS.every[1] - WALLS.every[0]));
            this.gorilla(pend.afterLead || pend.afterKo, false, 3600);
            return this.spawnAfterWall(pend, z);
        }
        if (this.story && !this.storyOn) return this.spawnStoryWall();
        const z = -(this.nextWallAt - this.distance);
        const [a, b] = WALLS.every;
        // старый экзамен на ~900 м убран: экзамен Инакова — часть финального боя (spawnExamWall)
        this.nextWallAt += this.wallGap(a + Math.random() * (b - a));
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
            b.onclick = () => this.hub.razbor();
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
        if (this.wind) { this.nextWallAt += 40; return; } // как у стен: арка не встаёт за Исламом, пока он дует
        const z = -(this.nextWallAt - this.distance);
        const [a, b] = ARCHES.every;
        this.nextWallAt += this.wallGap(a + Math.random() * (b - a));
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
    // флаги наград с сервера: что уже выдано на этот Telegram ID; повтор неудавшихся по сети запросов
    async syncRewards() {
        const d = this.profile.data, r = await prize.rewards();
        if (!r?.rewards) return;
        for (const k of Object.keys(r.rewards)) {
            const [kind, id] = k.split(":");
            if (kind === "boss") (d.bossPaid ||= {})[id] = 1; else (d.quiz ||= {})[id] = 1;
        }
        for (const k of d.rewardRetry?.splice(0) || []) { const g = await prize.reward(k); if (g.granted) this.profile.gift(g.amount); }
        this.profile.save();
    }

    // сюжет босса идёт, когда игрок дошёл до его главы; до тех пор — обычные забеги
    get story() {
        if (!this.questions) return null; // свободный забег — без глав, боссов и драк: только результат на рейтинг
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
        if (!s || this.story || this.heroCfg?.free) return null; // free-герои (Дима, Товарус) — без сюжета и боссов
        const need = Math.max(0, CHAPTERS[(s.chapter || 1) - 2]?.goal - this.profile.data.earned) || 0;
        const name = FIGHTERS[s.opponent].name;
        return { s, name, need, text: `Следующий босс — ${name}, глава ${s.chapter}. Заработай ещё ${fmt(need)} USDT за забеги — очки не в счёт.` };
    }

    // Мизулина побеждена — дальше бегает «из принципа»
    get grudge() { return !!this.profile.data.mizBeaten; }

    // глава 1 до боя: Мизулина бежит следом
    storyChasing() { const s = this.story; return !!(s?.chase && this.questions && !this.storyOn && this.state === "playing" && !this.profile.data.mizBeaten && this.runTime >= (this.chaseLate || 0)); }

    storyList(s = this.story) { return [...s.questions, ...(s.practice ? [s.practice] : [])]; }

    charges(s = this.story) { const done = this.profile.data.quiz || {}; return s ? s.questions.filter((q) => done[q.id]).length : 0; }

    spawnStoryWall() {
        const s = this.story, list = this.storyList(s);
        if (this.storyQ >= list.length) { this.nextWallAt += this.wallGap(200); return; } // все таблички главы позади — дальше бой
        const q = list[this.storyQ++], at = this.nextWallAt;
        this.nextWallAt += this.wallGap(WALLS.every[0] + Math.random() * (WALLS.every[1] - WALLS.every[0]));
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
        if (q === s.after && ok && d.afterPending === s.id) { delete d.afterPending; this.profile.save(); } // 1.4 висит до верного ответа
        if (ok) {
            this.storyOk++;
            const first = q !== s.practice && !(d.quiz ||= {})[q.id]; // 1.4 после боя — тоже с наградой
            if (first) {
                d.quiz[q.id] = 1;
                if (prize.online) { // награду выдаёт сервер один раз на Telegram ID
                    // сервер не настроен или недоступен (не 200) — начисляем сами, как раньше: игрок не теряет награду
                    prize.reward(`sign:${q.id}`).then((r) => { if (r.granted) this.profile.earn(r.amount); else if (r.status !== 200) this.profile.earn(s.answerUsdt); });
                } else this.usdt += s.answerUsdt;
                this.profile.save();
            }
            const n = this.charges(s), post = q === s.after;
            this.hub.toast(q === s.practice ? "Верно! Теперь — в бой" : first && post ? `Верно! +${fmt(s.answerUsdt)} USDT` : first ? `Верно! +${fmt(s.answerUsdt)} USDT · заряд ${n}/${s.questions.length} против: ${FIGHTERS[s.opponent].name}`
                : "Верно! Уже засчитано — это тренировка");
            if (q.ok) this.gorilla(q.ok, true);
            if (q.line) setTimeout(() => this.speech(q.line[0], q.line[1], 2800, false, FIGHTERS.pavel.portrait), 1200);
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
    // карточка вопроса / ветра / вентилятора на экране — реплики ждут, чтобы не лезть поверх
    cardUp() { return ["wall-q", "wind-q", "vent-q"].some((id) => $(id) && !$(id).hidden); }

    // реплики в очереди: показываются, когда карточка ушла (устаревшие через 9 с — пропадают)
    speechTick() {
        const el = $("gorilla");
        if (this.cardUp()) {
            if (!el.hidden && !el.classList.contains("out")) { // карточка появилась поверх реплики — реплику убираем и показываем после
                if (this.speechNow) this.speechQ = [...(this.speechQ || []), { ...this.speechNow, at: performance.now() }];
                clearTimeout(this.gorillaT);
                el.classList.add("out");
                this.gorillaT = setTimeout(() => { el.hidden = true; el.classList.remove("out"); }, 400);
            }
            return;
        }
        if (!this.speechQ?.length || (!el.hidden && !el.classList.contains("out"))) return;
        const now = performance.now();
        this.speechQ = this.speechQ.filter((q) => now - q.at < 9000);
        const q = this.speechQ.shift();
        if (q) this.speech(...q.args);
    }

    speech(who, text, ms = 3200, good = false, face = null) {
        const el = $("gorilla");
        if (this.state === "playing" && this.cardUp()) { // поверх карточки не говорим — ждём, пока её уберут
            (this.speechQ ||= []).push({ args: [who, text, ms, good, face], at: performance.now() });
            return;
        }
        this.speechNow = { args: [who, text, ms, good, face] };
        ms = ms * 1.35 + 600; // висит подольше: успеть прочитать на бегу (плюс время на появление)
        // По плейтесту: «когда концентрируешься, не до текста». Пока реплика на экране (первые TALK_CALM с), новые ряды
        // не ставятся — читать можно, не уворачиваясь. Уже стоящие на дороге не убираем: раньше реплика удаляла всё на
        // 60 м вперёд, и после удара (Мизулина/Малахов сразу говорят) преграды впереди пропадали на глазах.
        // В бою с боссом не трогаем: там препятствия бросает босс
        if ((this.state === "playing" || this.state === "countdown") && !this.bossFight) {
            const calm = Math.min(TALK_CALM, ms / 1000);
            this.talkCalm = Math.max(this.talkCalm || 0, calm);
        }
        el.classList.remove("out");
        $("g-text").textContent = text;
        $("g-who").textContent = who;
        const kind = who === "Горилла" ? "gorilla" : who === "Мизулина" || who === CHASERS.malakhov.name ? "miz" : "hero"; // преследователи — в одном стиле
        el.dataset.who = kind;
        // лицо: Мизулина — её портрет, герой — портрет выбранного героя
        const own = Object.values(CHASERS).find((c) => c.name === who); // свой преследователь (Малахов) — его портрет
        const url = face || own?.portrait || (kind === "miz" ? FIGHTERS.mizulina.portrait : kind === "hero" ? CHARACTERS.find((c) => c.id === this.heroId)?.portrait || FIGHTERS.mouse.portrait
            : CHARACTERS.find((c) => c.id === "gorilla")?.portrait || ""); // Горилла — её портрет (раньше эмодзи)
        $("g-face").style.setProperty("--face", url ? `url("${new URL(url, location.href).href}")` : "none"); // путь в переменной CSS считается от файла стилей — даём полный
        // где лицо на портрете (по высоте): у Спиди — ниже середины карточки, у отрендеренных боссов — сверху
        $("g-face").style.setProperty("--fy", own?.faceY && url === own.portrait ? own.faceY : /speedy/.test(url) ? "62%" : /pavel/.test(url) ? "15%" : /gorilla/.test(url) ? "43%" : "18%");
        for (const n of [$("g-face"), el.querySelector(".t-bubble")]) { n.style.animation = "none"; void n.offsetWidth; n.style.animation = ""; }
        el.classList.toggle("ok", good);
        el.hidden = false;
        clearTimeout(this.gorillaT);
        this.gorillaT = setTimeout(() => { this.speechNow = null; el.classList.add("out"); this.gorillaT = setTimeout(() => { el.hidden = true; el.classList.remove("out"); }, 550); }, ms); // уходит плавно
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
            const v = parseAnswer(inp.value);
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
        if (ready && s.hint && !this.hintSaid) { this.hintSaid = true; this.gorilla(s.hint, false, 2600); this.storyWaitT = performance.now() + 2600; return; } // намёк «Горилла = Павел»
        if (ready && this.storyWaitT && performance.now() < this.storyWaitT) return;
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
        if (s.heroLine) setTimeout(() => this.state === "bossintro" && this.speech(FIGHTERS[heroFighter(this.heroId)].name, s.heroLine, 2400), 1900);
    }

    async startStoryFight() {
        const s = this.story, opp = FIGHTERS[s.opponent], run = this.runId;
        // ушли в меню (или начали новый забег), пока шла заставка, — бой не начинаем
        const gone = () => this.runId !== run || this.state !== "bossintro";
        for (const id of [heroFighter(this.heroId), s.opponent]) preloadModel(FIGHTERS[id]?.model); // если ещё не скачаны — пока идёт заставка
        if (s.exam && MASK_SCENE.on) preloadModel(MASK_SCENE.model);
        this.storyOn = true;
        this.state = "bossintro";
        tg.haptic("heavy");
        this.audio.play("record");
        $("bs-ph").style.backgroundImage = `url(${opp.portrait})`;
        for (const [k, v] of [["--bh", opp.splash?.h], ["--fx", opp.splash?.fx], ["--fy", opp.splash?.fy]]) $("bs-ph").style[v == null ? "removeProperty" : "setProperty"](k, v); // кадр портрета у каждого босса свой
        const hero = FIGHTERS[heroFighter(this.heroId)]; // в бой — тот, за кого бежишь
        $("bs-hero").style.backgroundImage = `url(${hero.portrait})`;
        $("bs-name").textContent = opp.name;
        $("bs-hero-name").textContent = hero.name;
        $("bs-label").textContent = `${s.name} · ${s.fear}`;
        $("bs-quote").textContent = `«${s.before?.boss || opp.lines.intro}»`;
        const splash = $("boss-splash");
        splash.classList.remove("out");
        $("toast").hidden = true; // уведомления забега («Серия 5!») — не поверх заставки
        splash.hidden = false;
        $("hud").hidden = true;
        setTimeout(() => this.audio.play("crash"), 560); // удар «VS»
        if (s.before?.gorilla && !(s.exam && MASK_SCENE.on)) setTimeout(() => this.state === "bossintro" && this.gorilla(s.before.gorilla, true, 3200), 1300);
        await wait(2400);
        if (gone()) { splash.hidden = true; return; }
        this.showFightLoad(hero, opp, s);
        splash.classList.add("out");
        await wait(450);
        splash.hidden = true;
        if (gone()) { $("f-load").hidden = true; return; }
        // улица пустая: без препятствий, монет, погони и карточек — только бойцы
        this.world.clear();
        this.walls = [];
        this.wind = null;
        this.world.blowWind?.(null);
        if (this.chaser) this.chaser.visible = false;
        this.stumble = 0;
        this.rat.visible = false;
        for (const id of ["wall-q", "wind-q", "mode"]) if ($(id)) $(id).hidden = true; // и окно «Режим забега» — не поверх боя
        const n = this.questions ? this.charges(s) : 0;
        this.state = "fight";
        this.frameMeter.reset(); // замер кадров боя — с нуля, без хвоста забега
        this.clock.getDelta();
        // экзамен Инакова: вопросы перемешаны (пересдача — в другом порядке), заряды убирают неверные варианты
        const exam = s.exam ? { ...EXAM, list: [...EXAM.list].sort(() => Math.random() - 0.5), charges: n, i: 0, ok: 0, bad: 0, streak: 0, wait: 0, q: null } : null;
        // заряды главы: +5% HP за каждый, с трёх — супер на 30% со старта
        try {
            this.fight = new Fight(this, { hero: heroFighter(this.heroId), opponent: s.opponent, exam,
                bonus: exam ? {} : { hp: Math.min(20, Math.round(FIGHTERS.mouse.hp * CHARGES.hp * n)), super: n >= CHARGES.fullAt ? FIGHT.superMax * CHARGES.super : 0 },
                onEnd: (win) => this.endStoryFight(win) });
        } catch (e) { // бой не собрался (битая модель, нет WebGL-ресурсов) — не оставляем игрока на пустой улице без HUD
            console.error("[fight] не запустился", e);
            this.fight?.dispose?.();
            this.abortFight();
        }
    }

    // экран загрузки боя — сразу под уходящей заставкой «БОСС»: под ним чистится улица, ставится камера и грузятся бойцы.
    // Снимает его сам бой (Fight.ready), когда уже нарисован; подсказка — как драться (у экзамена — про вопросы)
    showFightLoad(hero, opp, s) {
        $("fl-hero").style.backgroundImage = `url(${hero.portrait})`;
        $("fl-opp").style.backgroundImage = `url(${opp.portrait})`;
        $("fl-title").textContent = s.exam ? "Готовим экзамен…" : "Готовим бой…";
        $("f-load-sub").textContent = "Бойцы выходят на ринг";
        $("fl-tip").textContent = s.exam ? "Верный ответ — удар по Инакову, ошибка — его удар. Семь верных — экзамен сдан."
            : pick(["Тап по голове или корпусу — удар рукой, по ногам — удар ногой.", "Загорелась красная надпись «ЗАМАХ» — жми БЛОК или УКЛОН.",
                "Супер копится от ударов — жми, когда кнопка засветится золотом.", "Удар чуть раньше времени не пропадёт — бой его запомнит."]);
        const el = $("f-load");
        el.classList.remove("out");
        el.hidden = false;
    }

    // бой не загрузился или не собрался — в меню без поражения: заработанное в забеге — в кошелёк, сюжет и заряды на месте,
    // следующий забег главы снова приведёт к боссу
    abortFight() {
        this.submitRun();
        this.fight = null;
        $("f-load").hidden = true;
        this.storyOn = false;
        this.rat.visible = true;
        const du = this.usdt - this.credited.usdt;
        this.credited = { usdt: this.usdt };
        if (du) this.profile.earn(du);
        tg.guardClose(false);
        this.state = "menu";
        this.audio.music("menu");
        this.resetRun();
        this.renderMenu();
        this.show("menu");
        this.hub.toast("Бой не загрузился — попробуй ещё раз из забега");
    }

    endStoryFight(win) {
        this.submitRun();
        const s = this.story;
        this.fight = null;
        this.rat.visible = true;
        const du = this.usdt - this.credited.usdt; // заработанное в забеге — в кошелёк в любом случае
        this.credited = { usdt: this.usdt };
        if (du) this.profile.earn(du);
        tg.guardClose(false);
        if (!win) { // проиграл — сюжет с начала: снова забег и возражения
            this.state = "menu";
            this.audio.music("menu");
            this.resetRun();
            this.renderMenu();
            this.show("menu");
            const opp = FIGHTERS[s.opponent];
            $("sl-title").textContent = `${opp.name} ${opp.she ? "победила" : "победил"}`; // «Мизулина победила», «Полиция победила»
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
        prize.event(`boss:${s.opponent}`);
        if (!paid) {
            d.bossPaid[s.id] = 1;
            if (prize.online) { // сумму и «уже выдано» решает сервер: переустановка/чистка профиля не даст второй раз
                prize.reward(`boss:${s.id}`).then((r) => { if (r.granted) this.profile.gift(r.amount); else if (r.status !== 200) this.profile.gift(s.reward.usdt); }); // сервер не ответил — начисляем сами
            } else this.profile.gift(s.reward.usdt);
        }
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
        // род по бойцу: «Полиция повержена», «Мизулина повержена», «Павел Инаков повержен» (FIGHTERS[].she)
        $("sw-title").textContent = `${FIGHTERS[s.opponent].name} ${FIGHTERS[s.opponent].she ? "повержена" : "повержен"}!`;
        $("sw-text").textContent = `Страх ${s.fear} побеждён.${paid ? "" : ` Награда: +${fmt(s.reward.usdt)} USDT.`} Забери бесплатный разбор у менеджера.`;
        const next = STORIES[this.profile.data.story];
        $("sw-next").textContent = next ? `${next.name}: ${next.title}` : "";
        $("sw-next-text").textContent = next ? `Страх ${next.fear}. Таблички главы — заряды против босса.` : "";
        $("btn-razbor").onclick = () => this.hub.razbor();
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
        this.gorilla(s.afterKo, true, 3000);
        if (s.afterLead) setTimeout(() => this.state === "playing" && this.gorilla(s.afterLead, false, 3600), 5200);
        this.profile.data.afterPending = s.id; // 1.4 висит, пока не ответишь (обрыв забега — встанет в следующем)
        this.profile.save();
        // табличка 1.4 — первой, следом таблички новой главы
        this.spawnAfterWall(s, -70);
        this.afterSpawned = true;
        this.nextWallAt = this.distance + 70 + this.wallGap(WALLS.every[0]);
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

    // табличка «после боя» (1.4): ставится сразу после победы, а если забег оборвался до ответа — первой в следующем
    spawnAfterWall(s, z) {
        const q = s.after;
        const order = q.a.map((_, i) => i).sort(() => Math.random() - 0.5);
        const wall = this.world.addWall({ ...q, type: s.type }, order.map((i) => q.a[i]), order.indexOf(0), z);
        wall.story = q; wall.storyOf = s; wall.boss = 0;
        this.walls.push(wall);
        this.world.noCars = true;
        this.nextRowZ = Math.min(this.nextRowZ, z - 36);
    }

    // Горилла перед финалом: любой ответ ведёт к финальному экрану
    showPrefinal() {
        const pf = GORILLA.prefinal;
        this.showAnketa([{ id: "reward", ...pf }], () => this.showFinal(), "Финал");
    }

    // Финал: первая сотня получает по 10 USDT за созвон. Место выдаёт сервер (LINKS.top100), без него — без номера
    async showFinal() {
        const d = this.profile.data;
        let soldOut = false;
        if (!d.place && prize.online) { // место выдаёт /api/prize по подписанному initData и цепочке run→boss
            const r = await Promise.race([prize.claim().catch(() => ({})), wait(5000).then(() => ({}))]) || {}; // сервер завис — финал всё равно открывается
            if (r.place > 0) { d.place = r.place; d.left = r.left; this.profile.save(); }
            soldOut = Boolean(r.soldOut);
        }
        const full = soldOut || (d.place && d.place > GORILLA.top);
        $("fn-ph").style.backgroundImage = `url(${FIGHTERS.pavel.portrait})`;
        $("fn-ph").querySelector("b").hidden = full || !d.place; // плашка «10 USDT» — только с подтверждённым местом
        $("fn-title").textContent = "Ты прошёл Воронку до конца";
        // «ты в первой сотне, тебе положены 10 USDT» — только с местом от сервера. Сервер не ответил (5 с), недоступен
        // или игра не из Telegram — места нет, и обещать приз нельзя: раньше его так получал каждый, кто дошёл до финала
        $("fn-text").textContent = full ? "Сотня призов разобрана, но созвон с менеджером остаётся за тобой: бесплатный разбор твоей ситуации."
            : !d.place ? "Созвонись с менеджером: он проверит, попал ли ты в первую сотню (10 USDT), и разберёт твой старт."
            : GORILLA.final.replace(", место №{place}", d.place ? `, место №${d.place}` : "").replace(" Осталось мест: {left}/100", d.left != null ? ` Осталось мест: ${d.left}/${GORILLA.top}` : "");
        $("btn-fn").textContent = "Записаться на созвон";
        $("btn-fn").onclick = () => this.hub.razbor(`Прошёл Воронку до конца${d.place ? `, место №${d.place}` : ""}.`);
        // сюжет пройден — сразу предложить свободные забеги (окно выбора режима)
        $("btn-fn-menu").onclick = () => { $("final").hidden = true; if (!this.settings.modeChosen) this.hub.showMode(); };
        $("final").hidden = false;
    }

    // Анкета Гориллы: вопросы по одному, ответы — в profile.data.anketa (уходят менеджеру в сообщении)
    showAnketa(list, then, title = "Анкета") {
        const d = this.profile.data, box = $("ak-a");
        let i = 0;
        const step = () => {
            if (i >= list.length) { $("anketa").hidden = true; this.profile.save(); if (list === GORILLA.anketa) this.hub.task("anketa"); return then?.(); }
            const q = list[i];
            $("ak-step").textContent = list.length > 1 ? `${title} · ${i + 1} из ${list.length}` : title;
            // прогресс — сегменты по шагам (у одного вопроса не нужен)
            $("ak-prog").innerHTML = list.length > 1 ? list.map((_, k) => `<i class="${k < i ? "done" : k === i ? "on" : ""}"></i>`).join("") : "";
            $("ak-q").textContent = q.q;
            $("ak-note").textContent = list === GORILLA.anketa ? "Ответы уйдут менеджеру — чтобы разобрать твой старт" : "";
            box.innerHTML = "";
            // короткие ответы — сеткой 2×2, длинные — столбиком; у каждого буква A–D
            box.classList.toggle("grid", q.a.length === 4 && q.a.every((a) => a.length <= 16));
            q.a.forEach((a, k) => {
                const b = document.createElement("button");
                b.className = "ob-a";
                b.append(Object.assign(document.createElement("i"), { textContent: "ABCD"[k] || "" }), Object.assign(document.createElement("span"), { textContent: a }));
                b.onclick = () => {
                    if (box.dataset.busy) return;
                    box.dataset.busy = "1"; // выбор подсвечивается на миг, потом следующий вопрос
                    b.classList.add("pick");
                    (d.anketa ||= {})[q.id] = a;
                    setTimeout(() => { delete box.dataset.busy; i++; step(); }, 180);
                };
                box.append(b);
            });
            const card = $("anketa").querySelector(".ob-card");
            card.classList.remove("ob-next"); void card.offsetWidth; if (i) card.classList.add("ob-next"); // следующий вопрос «въезжает»
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
            const ck = c.userData.chaserKey, model = ck ? this.world.chaserModels?.[ck] : this.world.chaserModel;
            const clip = model?.gltf.animations.find((x) => x.name === this.chaserCfg(ck).arrest);
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
        this.audio.stop("busted"); // новый забег, меню, апелляция — сирена прошлого не доигрывает поверх
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
        this.trip = TRIP;
        if (o) { o.visible = false; o.userData.type = "decor"; }
        this.hub.toast("Запасная жизнь!");
        tg.haptic("success");
        return true;
    }

    // ---- «Ислам дует» -----------------------------------------------------------------------
    spawnWind() {
        const z = -(this.nextWindAt - this.distance);
        const [a, b] = WIND.every;
        // 80 м, не 45: вдох с «Готовься тапать» начинается заранее и не должен совпасть с ещё не отвеченной стеной
        const nearWall = this.bossCalm || this.bossFight || this.walls.some((w) => Math.abs(w.plates[0].position.z - z) < 80);
        const npc = this.world.makeIslam();
        // рядом стена-возражение, вентилятор Ислама или модель ещё не загрузилась — позже
        const nearVent = !!this.vent; // вентилятор сам отодвигает следующий порыв, пока его ветер не кончится
        if (!npc || nearWall || nearVent) { this.nextWindAt += 60; npc && this.world.dropObstacle(npc); return; }
        // сторона — где на тротуаре свободно (урна, банкомат, столик кафе загородили бы Ислама); обе заняты — позже
        const free = [-1, 1].filter((s) => this.world.sidewalkFree(s * 3.7, z, 0.5, 0.8));
        if (!free.length) { this.nextWindAt += 60; this.world.dropObstacle(npc); return; }
        this.nextWindAt += a + Math.random() * (b - a);
        const side = free[Math.floor(Math.random() * free.length)];
        npc.position.set(side * 3.7, 0.18, z);
        npc.rotation.y = (side < 0 ? Math.PI / 2 : -Math.PI / 2) - side * (WIND.npc.yaw || 0); // лицом к дороге — дует поперёк
        npc.userData.type = "decor";
        this.world.scene.add(npc);
        this.world.obstacles.push(npc);
        this.world.clearZone(z - 50, z + 30); // пока Ислам дует, на дороге пусто — только тапать
        this.nextRowZ = Math.min(this.nextRowZ, z - 50);
        this.wind = { npc, side, state: "near", t: 0, taps: 0, owned: this.heroId === "islam" }; // щадит, только если бежишь за него самого
    }

    // Ислам: вдох (откинулся назад, камера на нём) → порыв (наклон вперёд, поток изо рта через дорогу) → героя
    // скользя сносит через полосы. Тапы гасят снос, подкат или прыжок — увернулся.
    watchWind(dt) {
        const w = this.wind, box = $("wind-q");
        this.windSlide = 0;
        if (!w) { this.camFocus = Math.max(0, (this.camFocus || 0) - dt * 2); return; }
        const z = w.npc.position.z;
        if (!w.bones) this.windRig(w);
        if (w.state === "near" && z > WIND.startZ) { // вдох дольше и раньше — видно, что это Ислам набирает воздух
            if (!w.npc.visible || !w.npc.parent) w.state = "done"; // Ислама не видно (спрятан, убран) — порыва без него нет
            else if (w.owned) { w.state = "done"; this.hub.toast("Ислам: «Своих не сдуваю»"); }
            else if (this.fx.windproof) { w.state = "done"; this.hub.toast("Ислам: «Даже я не сдую»"); }
            else {
                w.state = "inhale"; w.t = WIND.inhale; w.lane0 = this.lane;
                this.audio.play("swipe");
                $("wind-title").textContent = "Ислам вдыхает…";
                $("wind-sub").textContent = "Тапай, когда задует!";
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
            // удержался — но порыв всё равно идёт не меньше minGust: выдох Ислама и ветер должно быть видно
            if ((grip >= 1 && WIND.gust - w.t >= WIND.minGust) || w.t <= 0 || flying) {
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
        // на скорости — с запасом: вопрос виден за 75 м, и выбранный ответ ветер не должен сносить с полосы
        this.nextWallAt = Math.max(this.nextWallAt, this.nextVentAt + VENT.after + Math.max(VENT.gap / 2, this.wallClear().before + 30));
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
        this.vent = { fan, npc, side, state: "near", spin: 2, owned: this.heroId === "islam" }; // щадит, только если бежишь за него самого
    }

    // near → warn (вентилятор раскручивается, подсказка, куда понесёт) → blow (в зоне ветра: замедление, снос) → done
    watchVent(dt) {
        const v = this.vent, box = $("vent-q");
        this.ventPush = 0;
        if (!v) return;
        const z = v.fan.position.z, dir = -v.side, fu = v.fan.userData; // dir — куда дует по X
        const spinTo = v.state === "blow" ? 28 : v.state === "warn" ? 20 : v.calm ? 6 : 2;
        v.spin += (spinTo - v.spin) * Math.min(1, dt * 1.5);
        // Видимый винт: лопасти — не быстрее 9 рад/с, дальше бледнеют, и проступает размытый диск. На настоящих 28 рад/с
        // при 20–60 кадрах лопасть за кадр проворачивалась почти на треть оборота — винт казался стоящим (стробоскоп)
        const blur = Math.min(1, Math.max(0, (v.spin - 6) / 14));
        fu.rotor.rotation.z += Math.min(v.spin, 9) * dt;
        fu.blur.rotation.z += v.spin * 0.3 * dt;
        fu.bladeMat.opacity = 1 - blur * 0.75;
        fu.blur.material.opacity = blur * 0.8;
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
        // Поток — из решётки вентилятора поперёк дороги. Пока Ислам его включает (warn) — короткая слабая струя, видно,
        // откуда дует; когда герой подбежал (blow) — через всю дорогу. Раньше поток ставился у героя (до 8 м ближе
        // вентилятора) — воздух появлялся раньше, чем герой добегал до вентилятора
        if (v.state === "warn" || v.state === "blow") {
            const o = fu.head.getWorldPosition(this.ventOrigin ||= new THREE.Vector3());
            this.world.blowWind(o, dir, dt, v.state === "blow" ? 1 : Math.min(0.5, Math.max(0, (v.spin - 2) / 30)));
        }
        if (v.state === "blow") {
            if (!this.flight) this.ventPush = dir * VENT.drift; // сносит, пока герой в струе (zone до вентилятора, after — после)
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
    // Сколько метров перед стеной и после неё дорога пустая. На скорости — по времени: перед стеной ~1.8 с (прочитать вопрос
    // и перестроиться), после — ~1.4 с (отбежать от таблички). На старте (13 м/с) — прежние 28 и 34 м, на 30 м/с — 54 и 42 м
    wallClear() {
        const v = Math.max(this.speed || 0, BALANCE.speedStart);
        return { before: Math.max(28, v * 1.8), after: Math.max(34, v * 1.4) };
    }

    // после полёта: стену отодвинули за точку посадки, а под героем успели встать ряды — дорога к выбранному ответу снова свободна
    clearChosen() {
        for (const w of this.walls) if (w.chosen && !w.answered && w.chosenLane != null) this.world.clearLane(w.chosenLane, w.plates[0].position.z, 2);
    }

    nearWall(z) {
        const c = this.world.wallClear || this.wallClear();
        return this.walls.some((w) => { const wz = w.plates[0].position.z; return z > wz - c.after && z < wz + c.before; });
    }

    chooseAnswer(w, lane) {
        if (!w || w.chosen || w.answered) return;
        w.chosen = true;
        this.chooseLock = this.runTime + 0.35;
        // ответ выбран заранее (кнопкой, пока стена ещё далеко) — дорога к табличке по этой полосе свободна
        w.chosenLane = lane;
        this.world.clearLane(lane, w.plates[0].position.z, 2);
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
            // карточка — сообщение клиента: аватар с номером типа (у экзамена — Павел), имя, возражение, время
            const t = CLIENT_TYPES[w.type];
            $("wq-type").textContent = w.boss ? `Павел Инаков · экзамен ${w.boss}/3` : w.arch ? "Арка профита · беги в золотую"
                : w.type.startsWith("fear") || w.type === "practice" ? t.name : `Клиент · ${t.name}`;
            $("wq-tag").textContent = w.boss ? "" : t.tag;
            $("wall-q").classList.toggle("boss", !!w.boss);
            $("wall-q").classList.toggle("arch", !!w.arch); // арка: плашка и чипы, без пузыря с вопросом
            $("wq-text").textContent = w.q.q;
            $("wq-time").textContent = new Date().toTimeString().slice(0, 5);
            // ответы по полосам: слева, по центру, справа (два варианта — слева и справа)
            const lanes = w.answers.length === 2 ? [0, 2] : [0, 1, 2];
            $("wq-ans").innerHTML = lanes.map(() => "<button></button>").join("");
            $("wq-ans").classList.toggle("two", lanes.length === 2);
            if (this.fx.focus > 0 && !w.hint) { this.fx.focus--; w.hint = true; } // «Фокус»: верный ответ подсвечен
            [...$("wq-ans").children].forEach((el, i) => {
                el.dataset.lane = lanes[i];
                el.replaceChildren(Object.assign(document.createElement("i"), { textContent: LANE_LABELS[lanes[i]] }), w.answers[i]); // кнопка: куда бежать и ответ
                // длинный ответ — мельче, чтобы карточка не вырастала (обрезать нельзя: его надо прочитать целиком)
                const len = String(w.answers[i]).length;
                el.classList.toggle("long", len > 50 && len <= 80);
                el.classList.toggle("xlong", len > 80);
                el.classList.toggle("hint", !!w.hint && i === w.correct);
                el.classList.toggle("gold", !!w.arch && i === w.correct);
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
            if (WALLS.reward) this.usdt += WALLS.reward * (this.boostLeft > 0 ? 2 : 1);
            this.audio.play("boost");
            tg.haptic("success");
            if (this.wallStreak % WALLS.streak === 0) {
                this.boostLeft = Math.max(this.boostLeft, WALLS.streakTime);
                this.hub.toast(`Серия ${this.wallStreak}! ×2 USDT на ${WALLS.streakTime} с`);
            } else this.hub.toast(WALLS.reward ? `Верно! +${WALLS.reward} USDT` : "Верно!");
            return false;
        }
        if (this.ram > 0 || this.wallForgive > 0) { // «Таран» Саши или прощённая ошибка Ислама — как верный ответ
            const how = this.ram > 0 ? "Таран" : "Ислам простил ошибку";
            if (this.ram > 0) this.ram--; else this.wallForgive--;
            o.userData.correct = true;
            w.answered = false;
            const r = this.answer(o);
            this.hub.toast(WALLS.reward ? `${how}! +${WALLS.reward} USDT` : `${how}!`);
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
                if (this.grudge && this.stumble > 0) this.grudgeSay("shield");
                this.fx.safe = 1;
                this.trip = TRIP;
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
