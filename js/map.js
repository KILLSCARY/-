// Карта города (меню → «Карта»): как карта местности в гонках — тёмная земля, районы пятнами с рваным краем,
// внутри тонкие белые дороги, между районами толстая трасса, вода, красные названия на чёрных плашках и подписи мест.
// Открытые районы выбираются как локация забега, у Дубая — свои герои, остальные — «СКОРО».
// Один SVG (векторно — чётко на любом экране); районы, подписи и тексты — MAP_DISTRICTS в config.js.
import { MAP_DISTRICTS, CHARACTERS } from "./config.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// детерминированный «шум» — одинаковая карта у всех и при каждом открытии
const random = (seed) => () => ((seed = Math.imul(1664525, seed) + 1013904223 >>> 0) / 4294967296);

// цвет пятна района (как зелень, пустыня, каньон на картах гонок)
const THEMES = {
    ice: "#5f7f99", sand: "#b98a4e", city: "#2b2f35", forest: "#3d5a45", rust: "#8a3f2c", harbor: "#3f5f63", olive: "#6f6a3c", runway: "#3a3836",
};

// сглаженный контур по точкам: замкнутый (closed) или линия
function smooth(points, closed = true, k = 0.2) {
    const n = points.length, p = (i) => points[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
    let d = `M${p(0)[0].toFixed(0)},${p(0)[1].toFixed(0)}`;
    for (let i = 0; i < (closed ? n : n - 1); i++) {
        const [a, b, c, e] = [p(i - 1), p(i), p(i + 1), p(i + 2)];
        d += ` C${(b[0] + (c[0] - a[0]) * k).toFixed(0)},${(b[1] + (c[1] - a[1]) * k).toFixed(0)} ${(c[0] - (e[0] - b[0]) * k).toFixed(0)},${(c[1] - (e[1] - b[1]) * k).toFixed(0)} ${c[0].toFixed(0)},${c[1].toFixed(0)}`;
    }
    return closed ? d + "Z" : d;
}

// пятно района: неровный эллипс из точек по кругу
function blob(rand, [cx, cy], [rx, ry], n = 14) {
    const pts = [];
    for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, k = 0.82 + rand() * 0.3;
        pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
    }
    return pts;
}

export class CityMap {
    constructor(hub) {
        this.hub = hub;
        this.game = hub.game;
        this.root = document.getElementById("map-root");
        this.selected = null;
    }

    current() {
        return MAP_DISTRICTS.find((d) => d.loc === this.game.location)?.id || "street";
    }

    heroNames(ids) {
        return ids.map((id) => CHARACTERS.find((c) => c.id === id)?.name || id).join(" и ");
    }

    // here — уже здесь, open — можно бежать, hero — только для своих героев, fixed — у героя своя локация, soon — строится
    state(d) {
        const own = MAP_DISTRICTS.find((x) => x.heroes?.includes(this.game.heroId));
        if (d.soon) return "soon";
        if (d.id === this.current()) return "here";
        if (d.heroes && !d.heroes.includes(this.game.heroId)) return "hero";
        if (own && own.id !== d.id) return "fixed";
        return "open";
    }

    chip(d, st) {
        return { here: "ВЫ ЗДЕСЬ", open: "ОТКРЫТ", soon: "СКОРО", hero: "ДИМА · САША", fixed: "НЕ ДЛЯ ГЕРОЯ" }[st];
    }

    // плашка: чёрный прямоугольник с наклонным текстом (ширина — по длине надписи)
    plate(x, y, text, cls, size) {
        const w = text.length * size * 0.56 + size;
        return `<g class="map-plate ${cls}" transform="translate(${x},${y})"><rect x="${(-w / 2).toFixed(0)}" y="${(-size * 0.85).toFixed(0)}" width="${w.toFixed(0)}" height="${(size * 1.35).toFixed(0)}"/><text>${esc(text)}</text></g>`;
    }

    render() {
        if (!this.root) return;
        if (!this.svg) this.build();
        for (const d of MAP_DISTRICTS) {
            const g = this.svg.querySelector(`[data-district="${d.id}"]`), st = this.state(d), label = this.chip(d, st);
            g.dataset.state = st;
            g.classList.toggle("sel", this.selected === d.id);
            const l = this.svg.querySelector(`[data-label="${d.id}"]`); // подписи — отдельным слоем поверх районов
            l.dataset.state = st;
            const w = label.length * 11.5 + 22, rect = l.querySelector(".status rect");
            l.querySelector(".status text").textContent = label;
            rect.setAttribute("x", (-w / 2).toFixed(0));
            rect.setAttribute("width", w.toFixed(0));
        }
        const here = MAP_DISTRICTS.find((d) => d.id === this.current());
        this.svg.querySelector(".map-pin").setAttribute("transform", `translate(${here.at[0]},${here.at[1] - 70})`);
        this.card(MAP_DISTRICTS.find((d) => d.id === (this.selected || here.id)));
    }

    build() {
        const rand = random(57), areas = [], labels = [];
        for (const d of MAP_DISTRICTS) {
            const shape = smooth(blob(rand, d.at, d.r), true, 0.22), [cx, cy] = d.at, [rx, ry] = d.r, inner = [];
            // дороги внутри района: у города — сетка улиц, у аэропорта — полосы, у остальных — извилистые
            if (d.theme === "city") {
                for (let x = cx - rx; x < cx + rx; x += 26 + rand() * 18) inner.push(`<path d="M${x.toFixed(0)},${cy - ry} L${(x + rand() * 30 - 15).toFixed(0)},${cy + ry}"/>`);
                for (let y = cy - ry; y < cy + ry; y += 26 + rand() * 18) inner.push(`<path d="M${cx - rx},${y.toFixed(0)} L${cx + rx},${(y + rand() * 30 - 15).toFixed(0)}"/>`);
                inner.push(`<path class="ring" d="${smooth(blob(rand, d.at, [rx * 0.62, ry * 0.62], 10), true, 0.22)}"/>`);
            } else if (d.theme === "runway") {
                for (const dy of [-22, 22]) inner.push(`<path class="runway" d="M${cx - rx * 0.8},${cy + dy} L${cx + rx * 0.8},${cy + dy - 20}"/>`);
            }
            for (let i = 0; i < (d.theme === "city" ? 3 : 9); i++) {
                const pts = [];
                let x = cx + (rand() - 0.5) * rx * 1.6, y = cy + (rand() - 0.5) * ry * 1.6;
                for (let k = 0; k < 5; k++) { pts.push([x, y]); x += (rand() - 0.5) * rx * 0.7; y += (rand() - 0.5) * ry * 0.7; }
                inner.push(`<path d="${smooth(pts, false, 0.3)}"/>`);
            }
            areas.push(`
                <g class="district" data-district="${d.id}" data-theme="${d.theme}" tabindex="0" role="button" aria-label="${esc(d.name)}">
                    <clipPath id="clip-${d.id}"><path d="${shape}"/></clipPath>
                    <path class="area" d="${shape}" fill="${THEMES[d.theme]}" filter="url(#map-rough)"/>
                    <g class="streets" clip-path="url(#clip-${d.id})">${inner.join("")}</g>
                    <path class="edge" d="${shape}" filter="url(#map-rough)"/>
                </g>`);
            // подписи — поверх всего: места (белые), название района (красное), статус
            for (const [x, y, t] of d.pois || []) labels.push(this.plate(x, y, t.toUpperCase(), "poi", 17));
            labels.push(`<g class="label" data-label="${d.id}">${this.plate(cx, cy, d.name.toUpperCase(), "name", 30)}
                <g class="status" transform="translate(${cx},${cy + 38})"><rect y="-15" height="26" rx="3"/><text y="4"></text></g></g>`);
        }
        // трасса: петля через все районы и поперечина через центр
        const loop = ["port", "winter", "dubai", "street", "airport", "rublevka", "mountains"].map((id) => MAP_DISTRICTS.find((d) => d.id === id).at);
        const cross = ["winter", "industrial", "airport"].map((id) => MAP_DISTRICTS.find((d) => d.id === id).at);
        this.root.innerHTML = `
            <svg class="map-svg" viewBox="0 0 1000 1000" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <filter id="map-rough" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="3" seed="4"/><feDisplacementMap in="SourceGraphic" scale="26"/></filter>
                    <filter id="map-grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="2"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 .9  0 0 0 0 .8  0 0 0 .05 0"/></filter>
                    <radialGradient id="map-vignette" cx="50%" cy="50%" r="70%"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient>
                </defs>
                <rect class="ground" width="1000" height="1000"/>
                <rect width="1000" height="1000" filter="url(#map-grain)"/>
                <path class="water" d="M1000,0 L1000,330 C950,320 930,250 900,200 C870,150 880,90 850,40 C840,20 830,8 820,0 Z" filter="url(#map-rough)"/>
                <path class="water" d="M0,0 L170,0 C150,40 110,60 70,70 C40,80 20,100 0,110 Z" filter="url(#map-rough)"/>
                <g class="districts">${areas.join("")}</g>
                <path class="highway" d="${smooth(loop, true, 0.2)}"/>
                <path class="highway minor" d="${smooth(cross, false, 0.3)}"/>
                <g class="labels">${labels.join("")}</g>
                <g class="map-pin"><circle class="pulse" r="16"/><circle class="dot" r="7"/></g>
                <rect width="1000" height="1000" fill="url(#map-vignette)" pointer-events="none"/>
            </svg>
            <div class="map-card card" id="map-card"></div>`;
        this.svg = this.root.querySelector("svg");
        const pickers = [...this.svg.querySelectorAll(".district"), ...this.svg.querySelectorAll(".label")];
        for (const g of pickers) {
            const id = g.dataset.district || g.dataset.label;
            const pick = () => { this.selected = id; this.game.audio.play("swipe"); this.render(); };
            g.addEventListener("click", pick);
            g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
        }
    }

    // карточка района под картой: что это, можно ли сюда, и действие
    card(d) {
        const el = document.getElementById("map-card"), st = this.state(d);
        const hero = CHARACTERS.find((c) => c.id === this.game.heroId)?.name || "Герой";
        const note = st === "soon" ? "Район строится — откроется в следующих обновлениях."
            : st === "hero" ? `Открывается только у героев: ${this.heroNames(d.heroes)}.`
                : st === "fixed" ? `${hero} бегает только в своём районе. Чтобы бежать здесь — выбери другого героя.`
                    : st === "here" ? "Здесь проходит твой забег." : "Открыт — можно бежать здесь.";
        // в сюжетном забеге район задаёт глава (Game.story), выбор на карте действует в свободной игре
        const storyNote = this.game.story && !d.soon ? "В сюжетном забеге район задаётся главой; выбор карты действует в свободной игре." : "";
        const action = st === "open" ? `<button class="btn btn-main" id="map-go">Бежать здесь</button>`
            : st === "hero" || st === "fixed" ? `<button class="btn btn-ghost map-btn-line" id="map-heroes">К героям</button>`
                : st === "here" ? `<button class="btn btn-main" id="map-run">Забег</button>` : "";
        el.dataset.state = st;
        el.innerHTML = `<div class="card-main"><div class="map-card-head"><h3>${esc(d.name)}</h3><span class="map-chip">${this.chip(d, st)}</span></div>
            <p class="map-text">${esc(d.text || "")}</p><p>${esc(note)}</p>${storyNote ? `<p>${esc(storyNote)}</p>` : ""}${action}</div>`;
        el.querySelector("#map-go")?.addEventListener("click", () => {
            this.game.setSetting("location", d.loc);
            this.selected = null;
            this.hub.toast(`Локация: ${d.name}`);
            this.hub.render(); // и плитка «Карта» на главной, и сама карта
        });
        el.querySelector("#map-heroes")?.addEventListener("click", () => this.hub.tab("heroes"));
        el.querySelector("#map-run")?.addEventListener("click", () => this.hub.tab("run"));
    }
}
