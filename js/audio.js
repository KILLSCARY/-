// Музыка и звуки из audio/ (список — SOUNDS в config.js) через Web Audio.
// Чего нет в файлах или что не успело загрузиться — синтезируется на лету.

import { SOUNDS } from "./config.js";

export class Audio {
    constructor() {
        this.ctx = null;
        this.enabled = true; // кнопка звука в забеге: всё разом
        this.musicOn = true;  // настройки: музыка
        this.sfxOn = true;    // настройки: звуки (и шум улицы)
        this.buffers = {}; // url → AudioBuffer
        this.mode = "off"; // off | menu | run | pause
        this.players = {}; // плейлист (menu / run) → { el, gain, index }
    }

    // браузеры дают включить звук только по клику
    unlock() {
        try {
            if (!this.ctx) this.setup();
            if (this.ctx.state !== "running" && !document.hidden) this.ctx.resume()?.catch(() => {});
        } catch {
            this.ctx = null;
        }
    }

    setup() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.enabled ? 1 : 0; // звук мог быть выключен ещё до первого касания (запомнен с прошлого раза)
        this.master.connect(this.ctx.destination);

        // музыка идёт потоком через <audio>, чтобы не распаковывать треки по 2 минуты в память;
        // у меню и забега свой плеер, между ними — плавный переход громкостью
        for (const [list, all] of Object.entries(SOUNDS.music)) {
            const urls = list === "run" && this.runUrls ? this.runUrls : all; // свой трек героя (setRunTracks до первого касания)
            const el = new window.Audio();
            el.preload = "auto";
            el.src = urls[0];
            const gain = this.ctx.createGain();
            gain.gain.value = 0;
            // забег: после громкости — ограничитель (heroMusicGain поднимает тихие песни выше 1 — пики не хрипят);
            // обычная музыка (0,6) до порога не доходит и звучит как раньше
            let out = gain;
            if (list === "run") {
                const lim = this.ctx.createDynamicsCompressor();
                lim.threshold.value = -3; lim.knee.value = 2; lim.ratio.value = 20; lim.attack.value = 0.003; lim.release.value = 0.15;
                out = gain.connect(lim);
            }
            this.ctx.createMediaElementSource(el).connect(gain);
            out.connect(this.master);
            const p = { el, gain, index: 0, urls };
            el.addEventListener("ended", () => this.nextTrack(p));
            this.players[list] = p;
        }

        const urls = [...new Set([SOUNDS.ambience.url, ...Object.values(SOUNDS.sfx).flatMap((s) => s.urls)])]; // общие файлы (hit и crash) — один раз
        for (const url of urls) {
            fetch(url)
                .then((r) => r.arrayBuffer())
                .then((data) => new Promise((ok, fail) => this.ctx.decodeAudioData(data, ok, fail)))
                .then((buf) => { this.buffers[url] = buf; if (url === SOUNDS.ambience.url) this.syncAmbience(); })
                .catch((e) => console.warn("[audio] не загрузился", url, e));
        }

        // свернули Telegram — тишина, вернулись — играем дальше
        // Пока свёрнуто, звуки не запускаются (иначе копятся и при возврате играют все разом), а при возврате
        // громкость плавно нарастает, а не бьёт по ушам
        document.addEventListener("visibilitychange", () => {
            const g = this.master.gain, now = this.ctx.currentTime;
            if (document.hidden) {
                g.cancelScheduledValues(now);
                g.setValueAtTime(0, now);
                this.muted = true; // громкость вернёт fadeIn — по возврату или по первому касанию
                this.ctx.suspend()?.catch(() => {});
            } else {
                this.quietUntil = performance.now() + 400;
                this.ctx.resume()?.then(() => this.fadeIn()).catch(() => {});
            }
            this.syncTrack();
        });
    }

    // после сворачивания — плавно вернуть громкость (один раз, когда звук снова идёт)
    fadeIn() {
        if (!this.muted || this.ctx.state !== "running") return;
        this.muted = false;
        const g = this.master.gain, t = this.ctx.currentTime;
        g.cancelScheduledValues(t);
        g.setValueAtTime(0, t);
        g.linearRampToValueAtTime(this.enabled ? 1 : 0, t + 0.8);
    }

    setEnabled(on) {
        this.enabled = on;
        if (!this.ctx) return;
        this.master.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.05);
        this.syncTrack();
    }

    // музыка под экран: menu / run / pause (забег, тише) / off
    music(mode) {
        const prev = this.mode;
        this.mode = mode;
        if (!this.ctx) return;
        const list = this.listFor(mode);
        // новый забег — трек забега с начала
        if (list === "run" && this.listFor(prev) !== "run") this.players.run.el.currentTime = 0;
        for (const [name, p] of Object.entries(this.players)) {
            const vol = name === list && this.musicOn ? (SOUNDS.musicVolume[mode] ?? 0) * (name === "run" ? this.runGain ?? 1 : 1) : 0;
            p.gain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.3);
        }
        this.syncTrack();
        this.syncAmbience();
    }

    // музыка забега под героя (SOUNDS.heroMusic: у Саши Белого и Ислама — своя), у остальных — общая.
    // Меняем плейлист плеера забега; выбор героя — касание, и iOS даёт запустить новый трек
    // gain — громкость трека относительно общей (тихо сведённая песня — громче; перегруз срезает limiter плеера)
    setRunTracks(urls, gain = 1) {
        this.runUrls = urls;
        if (this.runGain !== gain) { this.runGain = gain; this.music(this.mode); }
        const p = this.players.run;
        if (!p || p.urls === urls) return;
        p.urls = urls;
        p.index = 0;
        p.el.src = urls[0];
        this.syncTrack();
    }

    setMusic(on) {
        this.musicOn = on;
        this.music(this.mode);
    }

    setSfx(on) {
        this.sfxOn = on;
        this.syncAmbience();
    }

    listFor(mode) {
        return mode === "run" || mode === "pause" ? "run" : mode === "menu" ? "menu" : null;
    }

    nextTrack(p) {
        p.index = (p.index + 1) % p.urls.length;
        if (p.urls.length > 1) p.el.src = p.urls[p.index];
        else p.el.currentTime = 0;
        this.syncTrack();
    }

    // На каждое касание: музыка должна играть, а встала — запустить снова. Вернулся в Telegram (канал, «Поделиться»),
    // и трек пытается продолжиться без касания — iPhone это блокирует, и музыка молчала до перезапуска игры,
    // хотя звуки (Web Audio) играли. Касание — разрешённый момент: запускаем ещё раз
    kick() {
        if (!this.ctx || document.hidden) return;
        // открыл ссылку (NS Store, канал) и вернулся: iPhone не даёт возобновить звук без касания — resume() при возврате
        // не срабатывал, и громкость, сброшенная в 0 при уходе, так и оставалась нулём: музыка молчала при включённой настройке
        if (this.ctx.state !== "running") this.ctx.resume()?.then(() => this.fadeIn()).catch(() => {});
        else this.fadeIn();
        if (this.enabled && this.mode !== "off") for (const p of Object.values(this.players)) if (p.el.paused) p.el.play().catch(() => {});
    }

    // оба плеера крутятся всегда, слышно только нужный (громкость в music()): iOS не даст
    // запустить второй трек позже, не по нажатию — поэтому оба стартуют с первого касания
    syncTrack() {
        const on = this.enabled && this.mode !== "off" && !document.hidden;
        for (const p of Object.values(this.players)) {
            if (on && p.el.paused) p.el.play().catch(() => {});
            else if (!on && !p.el.paused) p.el.pause();
        }
    }

    syncAmbience() {
        const buf = this.buffers[SOUNDS.ambience.url];
        const on = this.mode === "run" && this.sfxOn;
        if (on && buf && !this.ambience) {
            this.ambience = this.ctx.createBufferSource();
            this.ambience.buffer = buf;
            this.ambience.loop = true;
            const amp = this.ctx.createGain();
            amp.gain.value = SOUNDS.ambience.volume;
            this.ambience.connect(amp).connect(this.master);
            this.ambience.start();
        } else if (!on && this.ambience) {
            this.ambience.stop();
            this.ambience = null;
        }
    }

    // звук из файла; false — если файла нет или он ещё грузится
    // можно ли сейчас звучать: приложение не свёрнуто и после возврата прошло немного времени
    live() {
        return this.ctx && !document.hidden && performance.now() > (this.quietUntil || 0);
    }

    // opts: vol — доля громкости, rate — высота (0,75 — глуше и ниже), vary — каждый раз чуть другая высота
    // (удары серией не сливаются в один и тот же звук)
    sample(name, { vol = 1, rate = 1, vary = false } = {}) {
        const s = SOUNDS.sfx[name];
        if (!s) return false;
        const buf = this.buffers[s.urls[Math.floor(Math.random() * s.urls.length)]];
        if (!buf) return false;
        try {
            const src = this.ctx.createBufferSource();
            src.buffer = buf;
            src.playbackRate.value = rate * (s.rate || 1) * (vary ? 0.92 + Math.random() * 0.16 : 1);
            const amp = this.ctx.createGain();
            amp.gain.value = s.volume * vol;
            src.connect(amp).connect(this.master);
            src.start();
            // max — звук длиннее сцены (сирена ~12 с): гасим к концу, а новый забег глушит его сразу (stop)
            if (s.max) amp.gain.setTargetAtTime(0, this.ctx.currentTime + s.max, 0.3);
            (this.playing ||= {})[name] = { src, amp };
            src.onended = () => { if (this.playing[name]?.src === src) delete this.playing[name]; };
        } catch {}
        return true;
    }

    // заглушить звук из файла, если ещё звучит (плавно, без щелчка)
    stop(name) {
        const p = this.playing?.[name];
        if (!p || !this.ctx) return;
        delete this.playing[name];
        try {
            const t = this.ctx.currentTime;
            p.amp.gain.cancelScheduledValues(t);
            p.amp.gain.setTargetAtTime(0, t, 0.08);
            p.src.stop(t + 0.5);
        } catch {}
    }

    tone(freq, { at = 0, dur = 0.15, vol = 0.2, type = "sine", to = 0 } = {}) {
        if (!this.ctx || !this.enabled || !this.sfxOn || !this.live()) return;
        try {
            const t = this.ctx.currentTime + at;
            const osc = this.ctx.createOscillator();
            const amp = this.ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, t);
            if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
            amp.gain.setValueAtTime(vol, t);
            amp.gain.exponentialRampToValueAtTime(0.001, t + dur);
            osc.connect(amp).connect(this.master);
            osc.start(t);
            osc.stop(t + dur + 0.02);
        } catch {}
    }

    play(name, opts) {
        if (!this.ctx || !this.enabled || !this.sfxOn || !this.live() || this.sample(name, opts)) return;
        switch (name) {
            case "coin": this.tone(1320, { dur: 0.08, vol: 0.12, type: "square" }); this.tone(1760, { at: 0.06, dur: 0.12, vol: 0.12, type: "square" }); break;
            case "boost": [660, 880, 1100, 1320].forEach((f, i) => this.tone(f, { at: i * 0.06, dur: 0.15, vol: 0.12, type: "square" })); break;
            case "swipe": this.tone(420, { dur: 0.05, vol: 0.06, type: "triangle" }); break;
            case "hit": this.tone(180, { dur: 0.5, vol: 0.35, type: "sawtooth", to: 40 }); break;
            case "count": this.tone(880, { dur: 0.12, vol: 0.15 }); break;
            case "go": this.tone(1320, { dur: 0.25, vol: 0.15 }); break;
        }
    }
}
