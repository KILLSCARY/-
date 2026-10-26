// Все звуки синтезируются на лету через Web Audio — никаких аудиофайлов.

export class Audio {
    constructor() {
        this.ctx = null;
        this.enabled = true;
        this.music = null;
    }

    // браузеры дают включить звук только по клику
    unlock() {
        try {
            if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            if (this.ctx.state !== "running") this.ctx.resume()?.catch(() => {});
        } catch {
            this.ctx = null;
        }
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
            osc.connect(amp).connect(this.ctx.destination);
            osc.start(t);
            osc.stop(t + dur + 0.02);
        } catch {}
    }

    play(name) {
        switch (name) {
            case "coin": this.tone(1320, { dur: 0.08, vol: 0.12, type: "square" }); this.tone(1760, { at: 0.06, dur: 0.12, vol: 0.12, type: "square" }); break;
            case "boost": [660, 880, 1100, 1320].forEach((f, i) => this.tone(f, { at: i * 0.06, dur: 0.15, vol: 0.12, type: "square" })); break;
            case "jump": this.tone(300, { dur: 0.18, vol: 0.18, type: "triangle", to: 700 }); break;
            case "slide": this.tone(500, { dur: 0.2, vol: 0.15, type: "sawtooth", to: 120 }); break;
            case "lane": this.tone(420, { dur: 0.05, vol: 0.06, type: "triangle" }); break;
            case "hit": this.tone(180, { dur: 0.5, vol: 0.35, type: "sawtooth", to: 40 }); break;
            case "count": this.tone(880, { dur: 0.12, vol: 0.15 }); break;
            case "go": this.tone(1320, { dur: 0.25, vol: 0.15 }); break;
        }
    }

    // мрачный бит: бочка + бас, крутится пока идёт забег
    startMusic() {
        if (!this.ctx || !this.enabled || this.music) return;
        const bass = [55, 55, 65.4, 49];
        let step = 0;
        const tick = () => {
            const bar = Math.floor(step / 8) % bass.length;
            if (step % 4 === 0) this.tone(120, { dur: 0.25, vol: 0.4, to: 40 });
            if (step % 8 === 4) this.tone(2000, { dur: 0.05, vol: 0.03, type: "square" });
            if (step % 2 === 0) this.tone(bass[bar], { dur: 0.22, vol: 0.12, type: "sawtooth" });
            step++;
        };
        this.music = setInterval(tick, 150);
    }

    stopMusic() {
        clearInterval(this.music);
        this.music = null;
    }
}
