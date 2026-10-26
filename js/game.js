// «Покоритель P2P 3.0» — раннер: крыс бежит по ночному району, собирает USDT,
// прыгает через баки, подкатывается под «блокировки» и объезжает тачки.

import { BALANCE, LINKS, DEATH_TEXT, TIPS } from "./config.js";
import { createRat, animateRat } from "./rat.js";
import { World, SPAWN_Z } from "./world.js";
import { Audio } from "./audio.js";
import { tg } from "./tg.js";

// hex-цвета материалов — в sRGB, как в дизайне
THREE.ColorManagement.legacyMode = false;

const $ = (id) => document.getElementById(id);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

class Game {
    constructor() {
        this.camMix = 0;
        this.state = "menu"; // menu → countdown → playing ⇄ paused → over
        this.audio = new Audio();
        this.best = 0;
        this.t = 0;

        this.setupScene();
        this.world = new World(this.scene, BALANCE.laneWidth);
        this.rat = createRat();
        this.scene.add(this.rat, this.rat.userData.blob);

        this.setupInput();
        this.setupUI();
        this.resetRun();
        this.onResize();

        tg.init();
        tg.getBest().then((b) => { this.best = b; this.renderMenu(); });

        this.clock = new THREE.Clock();
        this.loop();
    }

    setupScene() {
        const canvas = $("game");
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.15;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x24070b);
        this.scene.fog = new THREE.Fog(0x24070b, 18, 95);

        this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 200);

        this.scene.add(new THREE.HemisphereLight(0x9a7f86, 0x1a0a0c, 1.0));
        const moon = new THREE.DirectionalLight(0xff8f80, 0.7);
        moon.position.set(-3, 8, -10);
        this.scene.add(moon);
        // подсветка крыса, чтобы цепь «70» читалась
        this.rim = new THREE.PointLight(0xffe2d2, 1.6, 5, 2);
        this.scene.add(this.rim);

        window.addEventListener("resize", () => this.onResize());
    }

    onResize() {
        const w = window.innerWidth, h = window.innerHeight;
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(w, h, false);
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
        this.boostLeft = 0;
        this.phase = 0;
        this.nextRowZ = -40;
        this.cause = null;
        this.rat.position.set(0, 0, 0);
        this.rat.rotation.set(0, 0, 0);
        this.updateHud();
    }

    async start() {
        if (this.state === "countdown") return;
        this.audio.unlock();
        this.resetRun();
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
        this.audio.startMusic();
    }

    pause() {
        if (this.state !== "playing") return;
        this.state = "paused";
        this.audio.stopMusic();
        this.show("pause");
    }

    resume() {
        if (this.state !== "paused") return;
        this.audio.unlock();
        this.state = "playing";
        this.audio.startMusic();
        this.show("hud");
    }

    gameOver(cause) {
        this.state = "over";
        this.cause = cause;
        this.audio.stopMusic();
        this.audio.play("hit");
        tg.haptic("error");
        document.body.classList.add("shake");
        setTimeout(() => document.body.classList.remove("shake"), 400);

        const score = this.score();
        const isBest = score > this.best;
        if (isBest) {
            this.best = score;
            tg.saveBest(score);
        }
        $("over-cause").textContent = pick(DEATH_TEXT[cause]);
        $("over-score").textContent = score;
        $("over-usdt").textContent = `${this.usdt} ₮`;
        $("over-dist").textContent = `${Math.floor(this.distance)} м`;
        $("over-best").textContent = isBest ? "🔥 Новый рекорд!" : `Рекорд: ${this.best}`;
        setTimeout(() => { if (this.state === "over") this.show("over"); }, 700);
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
        this.lane = lane;
        this.audio.play("lane");
        tg.haptic("light");
    }

    jump() {
        if (this.state !== "playing" || this.jumping) return;
        this.jumping = true;
        this.slideLeft = 0;
        this.vy = BALANCE.jumpPower;
        this.audio.play("jump");
        tg.haptic("medium");
    }

    slide() {
        if (this.state !== "playing") return;
        if (this.jumping) this.vy = -BALANCE.jumpPower * 1.4; // быстрое приземление, как в сабвее
        this.slideLeft = BALANCE.slideTime;
        this.world.splash(this.x, 0, 20, 1.2);
        this.audio.play("slide");
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
    }

    // ---- интерфейс -----------------------------------------------------------------------

    setupUI() {
        $("btn-play").onclick = () => this.start();
        $("btn-again").onclick = () => this.start();
        $("btn-pause").onclick = () => this.pause();
        $("btn-resume").onclick = () => this.resume();
        $("btn-menu").onclick = () => { this.state = "menu"; this.resetRun(); this.renderMenu(); this.show("menu"); };
        $("btn-share").onclick = () => tg.share(
            `Я поднял ${this.usdt} ₮ и набрал ${this.score()} очков в «Покорителе P2P 3.0» 🐀💸 Сможешь больше?`,
            LINKS.bot
        );
        $("btn-course").onclick = () => tg.open(LINKS.course);
        $("btn-sound").onclick = () => {
            this.audio.enabled = !this.audio.enabled;
            $("btn-sound").textContent = this.audio.enabled ? "🔊" : "🔇";
            if (!this.audio.enabled) this.audio.stopMusic();
        };
        this.renderMenu();
    }

    renderMenu() {
        $("menu-best").textContent = this.best;
        $("menu-tip").textContent = pick(TIPS);
        const name = tg.user?.first_name;
        $("menu-hello").textContent = name ? `${name}, погнали поднимать USDT` : "Погнали поднимать USDT";
    }

    show(screen) {
        for (const el of document.querySelectorAll(".screen")) el.hidden = el.id !== screen;
    }

    updateHud() {
        $("hud-usdt").textContent = this.usdt;
        $("hud-score").textContent = this.score();
        $("hud-boost").hidden = this.boostLeft <= 0;
        if (this.boostLeft > 0) $("hud-boost").textContent = `×2 ${Math.ceil(this.boostLeft)}с`;
    }

    // ---- кадр ----------------------------------------------------------------------------

    loop() {
        requestAnimationFrame(() => this.loop());
        const dt = Math.min(this.clock.getDelta(), 0.05);
        this.t += dt;

        if (this.state === "playing") this.step(dt);
        else if (this.state === "menu") this.world.update(dt, 3 * dt, this.t); // в меню улица медленно едет

        const pose = this.state === "over" ? "dead"
            : this.state === "menu" ? "run"
            : this.slideLeft > 0 ? "slide"
            : this.jumping ? "jump"
            : this.state === "countdown" || this.state === "paused" ? "idle" : "run";
        if (this.state === "menu") this.phase += dt * 6;
        animateRat(this.rat, pose, this.t, this.phase);

        // в меню камера спереди (видно морду и цепь), в игре — сзади-сверху
        const cam = this.camera;
        const portrait = cam.aspect < 0.8;
        const behind = this.state === "menu" ? 0 : 1;
        this.camMix += (behind - this.camMix) * Math.min(1, dt * 2.5);
        const k = this.camMix * this.camMix * (3 - 2 * this.camMix);
        const back = new THREE.Vector3(this.x * 0.6, (portrait ? 3.3 : 2.5) + this.y * 0.35, portrait ? 5.0 : 4.4);
        const front = new THREE.Vector3(0.7, 1.5, portrait ? -3.6 : -3.0);
        const target = new THREE.Vector3(this.x * 0.4, 0.9 + this.y * 0.3, -8)
            .lerp(new THREE.Vector3(0, portrait ? 0.5 : 1.0, 0), 1 - k);
        // по дуге сбоку, чтобы камера не проходила сквозь крыса
        cam.position.lerpVectors(front, back, k);
        cam.position.x += Math.sin(k * Math.PI) * 4;
        cam.lookAt(target);
        this.rim.position.set(this.x, 1.6 + this.y, behind ? 1.6 : -1.6);

        this.renderer.render(this.scene, cam);
    }

    step(dt) {
        this.runTime += dt;
        this.speed = Math.min(BALANCE.speedMax, BALANCE.speedStart + this.runTime * BALANCE.speedRamp);
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

        // движение крыса
        const targetX = this.world.lanes[this.lane];
        this.x += (targetX - this.x) * Math.min(1, dt * 18);
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
        this.rat.rotation.z = (this.x - targetX) * 0.25; // наклон при перестроении
        const blob = this.rat.userData.blob;
        blob.position.x = this.x;
        blob.scale.setScalar(1 - Math.min(0.5, this.y * 0.2));

        if (this.boostLeft > 0) this.boostLeft -= dt;
        this.collide();
        this.updateHud();
    }

    collide() {
        const sliding = this.slideLeft > 0;
        for (const o of this.world.obstacles) {
            const d = o.userData;
            if (Math.abs(o.position.x - this.x) > 0.8) continue;
            if (Math.abs(o.position.z) > d.halfZ + 0.25) continue;
            if (d.type === "dumpster" && this.y > d.top - 0.05) continue;
            if (d.type === "barrier" && sliding) continue;
            return this.gameOver(d.type);
        }

        const coins = this.world.coins;
        const ratTop = sliding ? 0.9 : 1.6;
        for (let i = coins.length - 1; i >= 0; i--) {
            const c = coins[i];
            if (Math.abs(c.position.x - this.x) > 0.7 || Math.abs(c.position.z) > 0.7) continue;
            if (c.position.y < this.y - 0.2 || c.position.y > this.y + ratTop) continue;
            if (c.userData.boost) {
                this.boostLeft = BALANCE.boostTime;
                this.audio.play("boost");
                tg.haptic("success");
            } else {
                this.usdt += this.boostLeft > 0 ? 2 : 1;
                this.audio.play("coin");
            }
            this.world.removeCoin(i);
        }
    }
}

new Game();
