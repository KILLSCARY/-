// Музыка и звуки из audio/ (список — SOUNDS в config.js) через Web Audio.
// Чего нет в файлах или что не успело загрузиться — синтезируется на лету.

import { SOUNDS } from "./config.js";

export class Audio {
    constructor() {
        this.ctx = null;
        this.enabled = true;
        this.buffers = {}; // url → AudioBuffer
        this.mode = "off"; // off | menu | run | pause
        this.trackIndex = 0;
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
        this.master.connect(this.ctx.destination);
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = 0;
        this.musicGain.connect(this.master);

        // музыка идёт потоком через <audio>, чтобы не распаковывать два трека по 2 минуты в память
        this.track = new window.Audio();
        this.track.preload = "auto";
        this.track.src = SOUNDS.music[0];
        this.track.addEventListener("ended", () => this.nextTrack());
        this.ctx.createMediaElementSource(this.track).connect(this.musicGain);

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

    // музыка под экран: menu / run / pause (тише) / off
    music(mode) {
        this.mode = mode;
        if (!this.ctx) return;
        const vol = SOUNDS.musicVolume[mode] ?? 0;
        this.musicGain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.3);
        this.syncTrack();
        this.syncAmbience();
    }

    nextTrack() {
        this.trackIndex = (this.trackIndex + 1) % SOUNDS.music.length;
        this.track.src = SOUNDS.music[this.trackIndex];
        this.syncTrack();
    }

    syncTrack() {
        const on = this.enabled && this.mode !== "off" && !document.hidden;
        if (on && this.track.paused) this.track.play().catch(() => {});
        else if (!on && !this.track.paused) this.track.pause();
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
