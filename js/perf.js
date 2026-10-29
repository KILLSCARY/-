// Диагностика производительности (ТЗ: P0 — измерения и базовая линия). По умолчанию выключена и ничего не считает.
// Включается: «Настройки → Для теста → Диагностика FPS», ?perf=1 в адресе или startapp=perf в ссылке на мини-приложение.
// Показывает за последние ~10 с: FPS, время кадра (среднее и 95-й перцентиль), время JS-кадра и отрисовки,
// вызовы отрисовки и треугольники (по всем проходам постобработки), память GPU (геометрии, текстуры, шейдеры),
// разрешение холста, уровень графики, долгие задачи JS и кучу JS (где браузер их отдаёт).
// Тап по панели — отчёт в буфер обмена (прислать вместе с моделью телефона).

const WINDOW = 600; // кадров в окне (~10 с при 60 кадрах)

export class PerfHud {
    constructor(game) {
        this.g = game;
        this.on = false;
        this.frames = []; // { dt, js, gpu, calls, tris }
        this.long = { n: 0, max: 0 };
    }

    toggle(on) {
        if (on === this.on) return;
        this.on = on;
        const r = this.g.renderer, g = this.g;
        if (on) {
            this.frames.length = 0;
            this.lastFrame = 0;
            r.info.autoReset = false; // считаем все проходы постобработки за кадр, а не только последний
            this.render = g.render;
            g.render = (...a) => this.measure(a);
            this.el = document.createElement("pre");
            this.el.className = "perf-hud";
            this.el.onclick = () => this.copy();
            document.body.append(this.el);
            this.timer = setInterval(() => this.draw(), 500);
            if (!this.obs && "PerformanceObserver" in window) {
                try { // долгие задачи (>50 мс) главного потока — Chrome/Android; на iOS их нет
                    this.obs = new PerformanceObserver((l) => { for (const e of l.getEntries()) { this.long.n++; this.long.max = Math.max(this.long.max, e.duration); } });
                    this.obs.observe({ type: "longtask", buffered: false });
                } catch { this.obs = null; }
            }
        } else {
            g.render = this.render;
            r.info.autoReset = true;
            clearInterval(this.timer);
            this.el?.remove();
            this.obs?.disconnect(); this.obs = null;
        }
    }

    // отрисовка кадра: JS — от начала кадра (game.loop) до отрисовки, отрисовка — сам вызов (CPU; GPU работает дальше сам)
    measure(args) {
        const r = this.g.renderer, t0 = performance.now();
        r.info.reset();
        this.render.apply(this.g, args);
        const t1 = performance.now();
        const f = { dt: this.lastFrame ? t0 - this.lastFrame : 0, js: this.g.frameStart ? t0 - this.g.frameStart : 0, gpu: t1 - t0, calls: r.info.render.calls, tris: r.info.render.triangles };
        this.lastFrame = t0;
        this.frames.push(f);
        if (this.frames.length > WINDOW) this.frames.shift();
    }

    stats() {
        const fr = this.frames.filter((f) => f.dt > 0 && f.dt < 1000), n = fr.length || 1;
        const avg = (k) => fr.reduce((s, f) => s + f[k], 0) / n;
        const dts = fr.map((f) => f.dt).sort((a, b) => a - b);
        const p95 = dts.length ? dts[Math.min(dts.length - 1, Math.floor(dts.length * 0.95))] : 0;
        const g = this.g, r = g.renderer, cv = r.domElement, m = performance.memory;
        return {
            fps: fr.length ? 1000 / avg("dt") : 0, frame: avg("dt"), p95, js: avg("js"), render: avg("gpu"),
            calls: Math.round(avg("calls")), tris: Math.round(avg("tris")),
            geo: r.info.memory.geometries, tex: r.info.memory.textures, progs: r.info.programs?.length || 0,
            quality: g.quality, ratio: +r.getPixelRatio().toFixed(2), canvas: `${cv.width}×${cv.height}`,
            res: +((g.resScale || 1) * (g.heatScale || 1)).toFixed(2), state: g.state, budget: Math.round(1000 / g.frameBudget()),
            longN: this.long.n, longMax: Math.round(this.long.max), heap: m ? Math.round(m.usedJSHeapSize / 1048576) : null,
        };
    }

    draw() {
        const s = this.stats(), f1 = (x) => x.toFixed(1);
        this.el.textContent = `FPS ${Math.round(s.fps)} / ${s.budget}  кадр ${f1(s.frame)} мс  p95 ${f1(s.p95)}\n`
            + `JS ${f1(s.js)}  отрисовка ${f1(s.render)} мс\n`
            + `вызовов ${s.calls}  треуг. ${Math.round(s.tris / 1000)}k\n`
            + `геом ${s.geo}  текст ${s.tex}  шейдер ${s.progs}\n`
            + `${s.quality} ×${s.ratio} ${s.canvas} разр ${s.res}\n`
            + `долгих ${s.longN} (макс ${s.longMax} мс)${s.heap != null ? `  куча ${s.heap} МБ` : ""}  ${s.state}`;
    }

    async copy() {
        const s = this.stats();
        const text = `Диагностика ${new Date().toISOString()}\n${navigator.userAgent}\n${JSON.stringify(s)}`;
        try { await navigator.clipboard.writeText(text); this.g.hub?.toast("Отчёт скопирован — пришли его в чат"); }
        catch { this.g.hub?.toast("Не скопировалось — сделай скриншот панели"); }
    }
}
