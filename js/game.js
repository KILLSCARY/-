// «Покоритель P2P 3.0» — раннер: крыс бежит по ночному району, собирает USDT,
// прыгает через баки, подкатывается под «блокировки» и объезжает тачки.

import { BALANCE, LINKS, DEATH_TEXT, TIPS, CHARACTERS, QUALITY, QUALITY_TIERS, HERO_PERKS, UPGRADES, APPEAL_PRICE, CHAPTERS, POWERUPS } from "./config.js";
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
const fmt = (n) => Math.floor(n).toLocaleString("ru-RU").replace(/ /g, " ");

class Game {
    constructor() {
        window.game = this; // удобно для отладки из консоли
        this.camMix = 0;
        this.state = "menu"; // menu → countdown → playing ⇄ paused → over
        this.audio = new Audio();
        this.best = tg.localBest();
        this.t = 0;

        // телефон по умолчанию — средняя графика: он и так тянет 60 кадров, но греется
        const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) < 820);
        this.quality = QUALITY === "auto" ? (mobile ? "medium" : "high") : QUALITY;
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
        });

        this.setupInput();
        this.setupUI();
        this.resetRun();
        this.onResize();

        this.setQuality(this.quality);

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
        // красный туман вдали
        this.scene.background = new THREE.Color(0x2a070d);
        this.scene.fog = new THREE.Fog(0x2a070d, 12, 85);
        this.scene.environment = buildEnvironment(this.renderer);

        this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 100); // дальше 100 м всё равно туман

        this.scene.add(new THREE.HemisphereLight(0xa08088, 0x1a0809, 1.15));
        // «луна» спереди-сверху: от неё тени крыса и препятствий падают к камере
        this.renderer.shadowMap.enabled = this.tier.shadows;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        const moon = new THREE.DirectionalLight(0xffa090, 0.9);
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
        this.composer.addPass(new ShaderPass(OutputShader));

        window.addEventListener("resize", () => this.onResize());
    }

    onResize() {
        const w = window.innerWidth, h = window.innerHeight;
        const ratio = Math.min(window.devicePixelRatio, this.tier.ratio);
        this.renderer.setPixelRatio(ratio);
        this.renderer.setSize(w, h, false);
        this.composer.setPixelRatio(ratio);
        this.composer.setSize(w, h);
        // свечение считается в уменьшенном буфере: в 2 раза на компьютере, в 4 на телефоне
        const div = this.tier.bloom || 4;
        this.bloom.setSize(w * ratio / div, h * ratio / div);
        this.bloom.enabled = this.tier.bloom > 0;
        this.camera.aspect = w / h;
        this.camera.fov = w / h < 0.8 ? 72 : 58;
        this.camera.updateProjectionMatrix();
    }

    // ---- забег ---------------------------------------------------------------------------

    resetRun() {
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
        if (this.aura) this.aura.visible = false;
        this.phase = 0;
        this.nextRowZ = -40;
        this.cause = null;
        this.rat.position.set(0, 0, 0);
        this.rat.rotation.set(0, 0, 0);
        this.updateHud();
    }

    async start() {
        if (this.state === "countdown" || this.heroLoading) return;
        this.audio.unlock();
        this.resetRun();
        this.applyBoosts();
        this.show("hud");
        this.state = "countdown";
        const cd = $("countdown");
        cd.hidden = false;
        for (const n of ["3", "2", "1"]) {
            cd.textContent = n;
            cd.classList.remove("pop"); void cd.offsetWidth; cd.classList.add("pop");
            this.audio.play("count");
            await new Promise((r) => setTimeout(r, 600));
        }
        cd.textContent = "ПОГНАЛИ!";
        cd.classList.remove("pop"); void cd.offsetWidth; cd.classList.add("pop");
        this.audio.play("go");
        setTimeout(() => { cd.hidden = true; }, 500);
        this.state = "playing";
        this.audio.music("run");
        tg.guardClose(true);
    }

    // добавки из NS Store, купленные на этот забег: по одной каждой
    applyBoosts() {
        const names = [];
        for (const b of this.profile.takeBoosts()) {
            names.push(b.name);
            if (b.id === "magnet") this.fx.magnet = b.time;
            if (b.id === "testo") this.fly(b.time);
            if (b.id === "honey") this.fx.honey = b.time;
            if (b.id === "shield") this.fx.shield = true;
            if (b.id === "x2") this.boostLeft = b.time;
            if (b.id === "dash") { this.distance = b.meters; this.runTime = 20; } // со старта — как будто уже разогнался
        }
        if (names.length) this.hub.toast(`В забеге: ${names.join(", ")}`);
        this.updateHud();
    }

    // Апелляция: продолжить с того же места за TRX, один раз за забег
    appeal() {
        if (this.state !== "over" || this.appealUsed || !this.profile.pay({ trx: APPEAL_PRICE })) return;
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
        if (this.chaser) this.chaser.visible = false;
        this.stumble = 0;
        tg.haptic("error");
        document.body.classList.add("shake");
        setTimeout(() => document.body.classList.remove("shake"), 400);

        const score = this.score();
        const isBest = score > this.best;
        if (isBest) {
            this.best = score;
            tg.saveBest(score);
            setTimeout(() => this.audio.play("record"), 700);
        }
        $("over-cause").textContent = pick(DEATH_TEXT[cause]);
        $("over-new").hidden = !isBest;
        $("over-best").innerHTML = isBest ? "" : `Рекорд <b>${fmt(this.best)}</b>`;
        document.querySelector(".over-card").classList.toggle("is-best", isBest);

        // в кошелёк — то, что ещё не зачислено (после апелляции забег продолжается)
        const du = this.usdt - this.credited.usdt, dtrx = this.trx - this.credited.trx;
        this.credited = { usdt: this.usdt, trx: this.trx };
        const chapter = this.profile.earn(du, dtrx);
        $("over-wallet").innerHTML = `В кошелёк <b>+${fmt(du)} USDT</b>${dtrx ? ` и <b>+${dtrx} TRX</b>` : ""} · всего ${fmt(this.profile.usdt)} USDT`;
        const appeal = $("btn-appeal"), canAppeal = this.profile.trx >= APPEAL_PRICE;
        appeal.hidden = this.appealUsed;
        appeal.disabled = !canAppeal;
        $("appeal-sub").textContent = canAppeal ? "Продолжить с того же места" : `Нужно ${APPEAL_PRICE} TRX — собирай в забеге или в кейсах`;
        $("appeal-price").textContent = `${APPEAL_PRICE} TRX`;
        const counters = [["over-score", score, 0], ["over-usdt", this.usdt, 250], ["over-dist", this.distance, 320], ["over-trx", this.trx, 390]];
        for (const [id] of counters) $(id).textContent = "0";
        if (chapter !== null) {
            setTimeout(() => {
                this.audio.play("record");
                this.hub.toast(chapter < CHAPTERS.length ? `Глава ${chapter + 1} открыта: ${CHAPTERS[chapter].name}` : "Сезон 1 пройден!");
            }, 1500);
        }
        setTimeout(() => {
            if (this.state !== "over") return;
            this.show("over");
            for (const [id, to, delay] of counters) countUp($(id), to, delay);
        }, 700);
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
        this.audio.play("swipe");
        tg.haptic("light");
    }

    jump() {
        if (this.state !== "playing" || this.jumping || this.fx.fly > 0) return;
        this.jumping = true;
        this.slideLeft = 0;
        this.vy = BALANCE.jumpPower * (this.fx.honey > 0 ? 1.3 : 1); // мёд с пасеки — прыжок выше
        this.audio.play("swipe");
        tg.haptic("medium");
    }

    slide() {
        if (this.state !== "playing" || this.fx.fly > 0) return;
        if (this.jumping) this.vy = -BALANCE.jumpPower * 1.4; // быстрое приземление, как в сабвее
        this.slideLeft = BALANCE.slideTime * (this.perk.slide || 1);
        this.world.splash(this.x, 0, 20, 1.2);
        this.audio.play("swipe");
        tg.haptic("light");
    }

    setupInput() {
        document.addEventListener("keydown", (e) => {
            const k = e.code;
            if (k === "ArrowLeft" || k === "KeyA") this.move(-1);
            else if (k === "ArrowRight" || k === "KeyD") this.move(1);
            else if (k === "ArrowUp" || k === "KeyW" || k === "Space") { e.preventDefault(); this.jump(); }
            else if (k === "ArrowDown" || k === "KeyS") this.slide();
            else if (k === "Escape" || k === "KeyP") this.state === "paused" ? this.resume() : this.pause();
            else if (k === "Enter" && (this.state === "menu" || this.state === "over")) this.start();
        });

        // свайпы: срабатывают ещё до отпускания пальца — так отзывчивее
        let start = null;
        const area = $("game");
        area.addEventListener("touchstart", (e) => {
            const t = e.changedTouches[0];
            start = { x: t.clientX, y: t.clientY, done: false };
        }, { passive: true });
        area.addEventListener("touchmove", (e) => {
            if (!start || start.done) return;
            const t = e.changedTouches[0];
            const dx = t.clientX - start.x, dy = t.clientY - start.y;
            if (Math.hypot(dx, dy) < 30) return;
            start.done = true;
            if (Math.abs(dx) > Math.abs(dy)) this.move(dx > 0 ? 1 : -1);
            else if (dy < 0) this.jump();
            else this.slide();
        }, { passive: true });
        area.addEventListener("touchend", () => { start = null; }, { passive: true });
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
        $("btn-menu").onclick = $("btn-over-menu").onclick = () => {
            this.state = "menu"; this.audio.music("menu"); this.resetRun(); this.renderMenu(); this.show("menu");
        };
        $("btn-appeal").onclick = () => this.appeal();
        $("btn-share").onclick = () => tg.share(
            `Я поднял ${this.usdt} USDT и набрал ${this.score()} очков в «Покорителе P2P 3.0» 🐀💸 Сможешь больше?`,
            LINKS.bot
        );
        $("btn-course").onclick = () => tg.open(LINKS.course);
        $("btn-sound").onclick = () => {
            this.audio.setEnabled(!this.audio.enabled);
            $("btn-sound").textContent = this.audio.enabled ? "🔊" : "🔇";
        };
        this.renderMenu();
    }

    renderMenu() {
        this.hub.render();
        $("menu-best").textContent = this.best;

    }

    show(screen) {
        for (const el of document.querySelectorAll(".screen")) el.hidden = el.id !== screen;
    }

    updateHud() {
        $("hud-usdt").textContent = this.usdt;
        $("hud-score").textContent = this.score();
        $("hud-boost").hidden = this.boostLeft <= 0;
        if (this.boostLeft > 0) $("hud-boost").textContent = `×2 ${Math.ceil(this.boostLeft)}с`;
        const fx = [];
        if (this.fx.shield) fx.push("ЩИТ");
        if (this.stumble > 0) fx.push(`ДПС ${Math.ceil(this.stumble)}с`);
        document.body.classList.toggle("hurt", this.stumble > 0 && this.state === "playing");
        if (this.fx.fly > 0) fx.push(`${POWERUPS.testo.hud} ${Math.ceil(this.fx.fly)}с`);
        if (this.fx.magnet > 0) fx.push(`${POWERUPS.choline.hud} ${Math.ceil(this.fx.magnet)}с`);
        if (this.fx.honey > 0) fx.push(`МЁД ${Math.ceil(this.fx.honey)}с`);
        $("hud-fx").hidden = !fx.length;
        $("hud-fx").textContent = fx.join(" · ");
    }

    // ---- кадр ----------------------------------------------------------------------------

    loop() {
        requestAnimationFrame(() => this.loop());
        const now = performance.now();
        if (now - (this.lastFrame || 0) < this.frameBudget() - 2) return; // пропускаем кадр
        this.lastFrame = now;
        const dt = Math.min(this.clock.getDelta(), 0.05);
        this.t += dt;

        if (this.state === "playing") this.step(dt);
        else if (this.state === "menu") this.world.update(dt, 3 * dt, this.t); // в меню улица медленно едет

        const pose = this.state === "over" ? (this.cause === "caught" || this.cause === "cop" ? "fall" : "dead")
            : this.fx.fly > 0 ? "fly"
            : this.state === "menu" ? "run"
            : this.slideLeft > 0 ? "slide"
            : this.jumping ? "jump"
            : this.state === "countdown" || this.state === "paused" ? "idle" : "run";
        if (this.state === "menu") this.phase += dt * 6;
        animateRat(this.rat, pose, this.t, this.phase, dt, this.speed);
        this.moon.position.set(this.x - 4, 12, -14);
        this.moon.target.position.set(this.x, 0, -3);

        // в меню камера спереди (видно морду и цепь), в игре — сзади-сверху
        const cam = this.camera;
        const portrait = cam.aspect < 0.8;
        const behind = this.state === "menu" ? 0 : 1;
        this.camMix += (behind - this.camMix) * Math.min(1, dt * 2.5);
        const k = this.camMix * this.camMix * (3 - 2 * this.camMix);
        // в прыжке камера чуть поднимается, в полёте — на полвысоты: видно, что герой высоко над дорогой
        const lift = this.y * (this.fx.fly > 0 || this.y > 2.6 ? 0.5 : 0.35);
        this.camY = (this.camY || 0) + (lift - (this.camY || 0)) * Math.min(1, dt * 5);
        const back = new THREE.Vector3(this.x * 0.6, (portrait ? 3.3 : 2.5) + this.camY, portrait ? 5.0 : 4.4);
        const front = new THREE.Vector3(0.7, 1.5, portrait ? -3.6 : -3.0);
        const target = new THREE.Vector3(this.x * 0.4, 0.9 + this.camY * 0.85, -8)
            .lerp(new THREE.Vector3(0, portrait ? 0.5 : 1.0, 0), 1 - k);
        // по дуге сбоку, чтобы камера не проходила сквозь крыса
        cam.position.lerpVectors(front, back, k);
        cam.position.x += Math.sin(k * Math.PI) * 4;
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
        this.onResize();
    }

    // В «auto» меряем время кадра в забеге: если стабильно не успеваем — графику на ступень ниже
    measureFps(dt) {
        if (QUALITY !== "auto" || this.quality === "low" || this.runTime < 1.5) return;
        this.fpsFrames = (this.fpsFrames || 0) + 1;
        this.fpsTime = (this.fpsTime || 0) + dt;
        if (this.fpsTime < 3) return;
        const fps = this.fpsFrames / this.fpsTime;
        this.fpsFrames = this.fpsTime = 0;
        if (fps < this.tier.fps[0] * 0.75) this.setQuality(this.quality === "high" ? "medium" : "low");
    }

    // Потолок кадров: в забеге 60 (на 120-герцовых экранах иначе было бы 120), в меню 30–40,
    // когда сцену закрывает вкладка, пауза или проигрыш — 12. Меньше кадров — меньше нагрев.
    frameBudget() {
        if (this.state === "playing" || this.state === "countdown") return 1000 / this.tier.fps[0];
        if (this.state === "menu" && this.hub?.current === "run" && !document.querySelector("#case-open:not([hidden])")) return 1000 / this.tier.fps[1];
        return 1000 / 12;
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
        this.measureFps(dt);
        this.speed = Math.min(BALANCE.speedMax, BALANCE.speedStart + this.runTime * BALANCE.speedRamp);
        if (this.slowLeft > 0) { // споткнулся — пару шагов медленнее
            this.slowLeft -= dt;
            this.speed *= 0.55 + 0.45 * (1 - this.slowLeft / BALANCE.stumbleSlow);
        }
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
        while (this.nextRowZ > SPAWN_Z) {
            this.world.spawnRow(this.nextRowZ, difficulty);
            const gap = BALANCE.rowGapStart - (BALANCE.rowGapStart - BALANCE.rowGapMin) * difficulty;
            this.nextRowZ -= gap * (0.85 + Math.random() * 0.4);
        }
        this.world.update(dt, move, this.t);
        // инспектор свистит, когда пробегаешь мимо поста ДПС
        for (const o of this.world.obstacles) {
            if (!o.userData.police || o.userData.whistled || o.position.z < -5) continue;
            o.userData.whistled = true;
            this.audio.play("whistle");
        }

        // движение крыса
        const targetX = this.world.lanes[this.lane];
        this.x += (targetX - this.x) * Math.min(1, dt * 18 * (this.perk.lane || 1));
        if (this.fx.fly > 0) this.flyStep(dt);
        if (this.jumping) {
            this.vy -= BALANCE.gravity * dt;
            this.y += this.vy * dt;
            if (this.y <= 0) {
                this.y = 0;
                this.jumping = false;
                this.world.splash(this.x, 0, 16);
            }
        }
        if (this.slideLeft > 0) this.slideLeft -= dt;
        this.rat.position.set(this.x, this.y, 0);
        if (this.aura?.visible) {
            this.aura.position.set(this.x, this.y + 0.1, 0.15); // зелёный «выхлоп» под ногами
            this.aura.scale.setScalar(1.3 + Math.sin(this.t * 16) * 0.18);
        }
        this.rat.rotation.z = (this.x - targetX) * 0.25; // наклон при перестроении
        const blob = this.rat.userData.blob;
        blob.position.x = this.x;
        blob.scale.setScalar(1 - Math.min(0.5, this.y * 0.2));

        if (this.stumble > 0) this.chase(dt);
        if (this.boostLeft > 0) this.boostLeft -= dt;
        for (const k of ["magnet", "honey", "safe"]) if (this.fx[k] > 0) this.fx[k] -= dt;
        this.collide(dt);
        this.updateHud();
    }

    // Первый удар: врезался сбоку при перестроении — отлетаешь на свою полосу, спереди — препятствие сбито.
    // Дальше BALANCE.stumbleTime секунд за спиной ДПС, и второй удар заканчивает забег.
    hitOnce(o) {
        const target = this.world.lanes[this.lane];
        const side = Math.abs(target - this.x) > 0.35 && Math.abs(o.position.x - target) < 0.3;
        if (side) this.lane = this.prevLane;
        else { o.visible = false; o.userData.type = "decor"; }
        this.stumble = BALANCE.stumbleTime;
        this.slowLeft = BALANCE.stumbleSlow;
        this.fx.safe = Math.max(this.fx.safe, 1);
        this.audio.play("hit");
        this.audio.play("whistle");
        tg.haptic("warning");
        document.body.classList.add("shake");
        setTimeout(() => document.body.classList.remove("shake"), 400);
        this.world.splash(this.x, 0, 22, 1.3);
        if (!this.chaser) {
            this.chaser = this.world.makeSprite("cop"); // инспектор из концепта, без поста и машины
            this.chaser.scale.setScalar(0.9);
            this.scene.add(this.chaser);
        }
        this.chaser.visible = true;
        this.chaser.position.set(this.x, 0, 7); // выбегает из-за камеры
        this.chaser.userData.side = this.lane === 2 ? -1 : 1; // сбоку-сзади, чтобы не закрывать героя
    }

    // ДПС бежит за спиной, пока не отстанет
    chase(dt) {
        this.stumble -= dt;
        const c = this.chaser;
        const z = this.stumble > 1 ? 1.7 : 1.7 + (1 - this.stumble) * 8; // в конце отстаёт
        c.position.z += (z - c.position.z) * Math.min(1, dt * 4);
        c.position.x += (this.x + c.userData.side * 0.95 - c.position.x) * Math.min(1, dt * 5);
        c.position.y = Math.abs(Math.sin(this.t * 11)) * 0.12;
        c.rotation.y = Math.atan2(this.camera.position.x - c.position.x, this.camera.position.z - c.position.z);
        if (this.stumble <= 0) { this.stumble = 0; c.visible = false; }
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

    // взлёт: над дорогой — дорожка USDT, полоса иногда меняется, чтобы было что ловить
    fly(time) {
        const first = !(this.fx.fly > 0);
        this.fx.fly = time;
        this.world.noPickups = true;
        if (!this.aura) {
            this.aura = this.world.makeHalo(POWERUPS.testo.color, 1.3);
            this.scene.add(this.aura);
        }
        this.aura.visible = true;
        if (!first) return;
        const h = POWERUPS.testo.height + 0.5;
        const len = Math.max(this.speed || 0, BALANCE.speedStart) * time;
        let lane = this.lane;
        for (let z = -9, i = 0; z > -len + 4; z -= 2.2, i++) {
            if (i && i % 8 === 0) lane = Math.max(0, Math.min(2, lane + (Math.random() < 0.5 ? -1 : 1)));
            this.world.addCoin(lane, z, h);
        }
    }

    flyStep(dt) {
        this.fx.fly -= dt;
        this.jumping = false;
        this.slideLeft = 0;
        this.y += (POWERUPS.testo.height - this.y) * Math.min(1, dt * 3);
        this.world.splash(this.x, 0.3, 1, 0.35, this.y + 0.2); // след из капель под героем
        if (this.fx.fly > 0) return;
        // приземление обычным падением и секунда-полторы форы, чтобы не сесть на препятствие
        this.fx.fly = 0;
        this.jumping = true;
        this.vy = 0;
        this.fx.safe = Math.max(this.fx.safe, 1.6);
        this.world.noPickups = false;
        this.aura.visible = false;
    }

    collide(dt) {
        const sliding = this.slideLeft > 0;
        for (const o of this.world.obstacles) {
            if (this.fx.fly > 0) break; // в полёте препятствия внизу
            const d = o.userData;
            if (Math.abs(o.position.x - this.x) > 0.8) continue;
            if (Math.abs(o.position.z) > d.halfZ + 0.25) continue;
            if (d.type === "decor") continue;
            if (d.top && this.y > d.top - 0.05) continue; // бак, ограждение — перепрыгнул
            if (d.type === "barrier" && sliding) continue;
            if (this.fx.safe > 0) continue; // после щита и апелляции — пара секунд неуязвимости
            if (this.fx.shield) { // «Чистая карта» прощает одно столкновение
                this.fx.shield = false;
                this.fx.safe = 1;
                o.visible = false;
                d.type = "decor";
                this.audio.play("boost");
                tg.haptic("warning");
                continue;
            }
            // как в сабвее: второй удар, пока ДПС на хвосте, — поймали; первый — споткнулся
            if (this.stumble > 0) return this.gameOver("caught");
            this.hitOnce(o);
            break;
        }

        const coins = this.world.coins;
        if (this.fx.magnet > 0) { // «Скупщик»: монеты впереди летят к игроку
            const k = Math.min(1, dt * 7);
            for (const c of coins) {
                if (c.position.z < -14 || c.position.z > 1) continue;
                c.position.x += (this.x - c.position.x) * k;
                c.position.y += (this.y + 0.8 - c.position.y) * k;
            }
        }
        const ratTop = sliding ? 0.9 : 1.6;
        for (let i = coins.length - 1; i >= 0; i--) {
            const c = coins[i];
            if (Math.abs(c.position.x - this.x) > 0.7 || Math.abs(c.position.z) > 0.7) continue;
            if (c.position.y < this.y - 0.2 || c.position.y > this.y + ratTop) continue;
            if (c.userData.pickup) {
                this.powerUp(c.userData.pickup);
            } else if (c.userData.boost) { // монета TRX: ×2 на время по уровню прокачки и +1 TRX в кошелёк
                this.boostLeft = UPGRADES.x2.times[this.profile.level("x2") - 1];
                this.trx += 1;
                this.audio.play("boost");
                tg.haptic("success");
            } else {
                this.coinCount++;
                const bonus = this.perk.coinBonus && this.coinCount % this.perk.coinBonus === 0 ? 1 : 0; // Паша: +10%
                this.usdt += (this.boostLeft > 0 ? 2 : 1) + bonus;
                this.audio.play("coin");
            }
            this.world.removeCoin(i);
        }
    }
}

new Game();
