// Музыка и звуки из audio/ (список — SOUNDS в config.js) через Web Audio.
// Чего нет в файлах или что не успело загрузиться — синтезируется на лету.

import { SOUNDS } from "./config.js";

export class Audio {
    constructor() {
        this.ctx = null;
        this.enabled = true;
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
        for (const [list, urls] of Object.entries(SOUNDS.music)) {
            const el = new window.Audio();
            el.preload = "auto";
            el.src = urls[0];
            const gain = this.ctx.createGain();
            gain.gain.value = 0;
            this.ctx.createMediaElementSource(el).connect(gain).connect(this.master);
            const p = { el, gain, index: 0, urls };
            el.addEventListener("ended", () => this.nextTrack(p));
            this.players[list] = p;
        }

        const urls = [SOUNDS.ambience.url, ...Object.values(SOUNDS.sfx).flatMap((s) => s.urls)];
        for (const url of urls) {
            fetch(url)
                .then((r) => r.arrayBuffer())
                .then((data) => new Promise((ok, fail) => this.ctx.decodeAudioData(data, ok, fail)))
                .then((buf) => { this.buffers[url] = buf; if (url === SOUNDS.ambience.url) this.syncAmbience(); })
                .catch((e) => console.warn("[audio] не загрузился", url, e));
        }

        // свернули Telegram — тишина, вернулись — играем дальше
        document.addEventListener("visibilitychange", () => {
            if (document.hidden) this.ctx.suspend()?.catch(() => {});
            else this.ctx.resume()?.catch(() => {});
            this.syncTrack();
        });
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
            const vol = name === list ? SOUNDS.musicVolume[mode] ?? 0 : 0;
            p.gain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.3);
        }
        this.syncTrack();
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
        const on = this.mode === "run";
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
    sample(name) {
        const s = SOUNDS.sfx[name];
        if (!s) return false;
        const buf = this.buffers[s.urls[Math.floor(Math.random() * s.urls.length)]];
        if (!buf) return false;
        try {
            const src = this.ctx.createBufferSource();
            src.buffer = buf;
            const amp = this.ctx.createGain();
            amp.gain.value = s.volume;
            src.connect(amp).connect(this.master);
            src.start();
        } catch {}
        return true;
    }

    tone(freq, { at = 0, dur = 0.15, vol = 0.2, type = "sine", to = 0 } = {}) {
        if (!this.ctx || !this.enabled) return;
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

    play(name) {
        if (!this.ctx || !this.enabled || this.sample(name)) return;
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
