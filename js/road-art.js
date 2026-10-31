// Мультяшная дорога для всех биомов: ровный цвет, крупные пятна вместо зерна, чистая разметка.
// Всё повторяется по высоте без шва: то, что вылезает за край, дорисовывается с другой стороны.
// Цвета: base — асфальт, light и dark — пятна, track — колея. dashes — штрихов разметки на тайл (0 — без разметки),
// edge — край: "snow" (волнистый снег) или "line" (цветная линия, edgeColor)
export function cartoonRoad(g, W, H, { base, light, dark, track, paint = "#f4f7fb", dashes = 4, edge = null, edgeColor = "#e6c073" }) {
    let seed = 111;
    const rand = () => ((seed = Math.imul(1664525, seed) + 1013904223 >>> 0) / 4294967296);
    g.fillStyle = base; g.fillRect(0, 0, W, H);
    const k = W / 1024, wrapped = (draw) => { for (const dy of [-H, 0, H]) { g.save(); g.translate(0, dy); draw(); g.restore(); } };
    // крупные пятна асфальта: светлее и темнее основы
    const blobs = Math.round(150 * H / 2048);
    for (let i = 0; i < blobs; i++) {
        const x = rand() * W, y = rand() * H, rx = (30 + rand() * 90) * k, ry = (30 + rand() * 130) * k, isLight = rand() > .5, turn = rand() * 3;
        wrapped(() => {
            g.fillStyle = isLight ? light : dark;
            g.beginPath(); g.ellipse(x, y, rx, ry, turn, 0, 7); g.fill();
        });
    }
    // редкие камешки: мало и крупно, чтобы вблизи не было «шума»
    const stones = Math.round(260 * H / 2048);
    for (let i = 0; i < stones; i++) {
        const x = rand() * W, y = rand() * H, r = (1.5 + rand() * 2.5) * k;
        g.fillStyle = rand() > .5 ? light.replace(/[\d.]+\)$/, ".3)") : dark.replace(/[\d.]+\)$/, ".35)");
        g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
    // накатанная колея: по две мягкие полосы на полосу движения
    for (const lane of [1 / 6, .5, 5 / 6]) for (const side of [-.055, .055]) {
        const x = (lane + side) * W, w = W * .05, band = g.createLinearGradient(x - w, 0, x + w, 0);
        band.addColorStop(0, track.replace(/[\d.]+\)$/, "0)")); band.addColorStop(.5, track); band.addColorStop(1, track.replace(/[\d.]+\)$/, "0)"));
        g.fillStyle = band; g.fillRect(x - w, 0, w * 2, H);
    }
    // разметка: крупные штрихи со скруглением и лёгкой тенью
    const dashW = W * .017, dashH = H / dashes * .44;
    if (dashes) for (const x of [W / 3, W * 2 / 3]) for (let i = 0; i < dashes; i++) {
        const y = H * (i / dashes + .06), bar = (dy, colour) => {
            g.fillStyle = colour; g.beginPath(); g.roundRect(x - dashW / 2, y + dy, dashW, dashH, dashW / 2); g.fill();
        };
        bar(5 * k, "rgba(18,24,44,.45)");
        bar(0, paint);
    }
    if (edge === "line") {
        const w = W * .012, m = W * .012;
        g.fillStyle = edgeColor;
        for (const x of [m, W - m - w]) { g.beginPath(); g.roundRect(x, -10, w, H + 20, w / 2); g.fill(); }
    }
    // снег по краям: волнистая кромка с голубой тенью; волн — целое число на высоту, поэтому без шва
    if (edge === "snow") {
        const waves = 16, side = (x0, dir) => {
            const path = (off) => {
                g.beginPath(); g.moveTo(x0, 0);
                for (let i = 0; i <= 160; i++) {
                    const y = i / 160 * H, t = y / H * Math.PI * 2;
                    g.lineTo(x0 + dir * (off + 13 * Math.abs(Math.sin(t * waves / 2)) + 6 * Math.sin(t * 5)) * k, y);
                }
                g.lineTo(x0, H); g.closePath(); g.fill();
            };
            g.fillStyle = "rgba(70,92,150,.55)"; path(30);
            g.fillStyle = "#e3ecf9"; path(22);
        };
        side(0, 1); side(W, -1);
    }
}
