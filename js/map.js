// Карта города (меню → «Карта»): остров в неоновом ночном стиле — светящиеся дороги, районы, море в синем ореоле.
// Открытые районы выбираются как локация забега, у Дубая — свои герои, остальные — «СКОРО».
// Рисуется одним SVG (векторно — чётко на любом экране), районы и тексты — MAP_DISTRICTS в config.js.
import { MAP_DISTRICTS, CHARACTERS } from "./config.js";

const NS = "http://www.w3.org/2000/svg";
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// сглаженный замкнутый контур по точкам (Catmull-Rom → кубические кривые Безье)
function smooth(points, k = 0.18) {
    const n = points.length, p = (i) => points[(i + n) % n];
    let d = `M${p(0)[0]},${p(0)[1]}`;
    for (let i = 0; i < n; i++) {
        const [a, b, c, e] = [p(i - 1), p(i), p(i + 1), p(i + 2)];
        d += ` C${b[0] + (c[0] - a[0]) * k},${b[1] + (c[1] - a[1]) * k} ${c[0] - (e[0] - b[0]) * k},${c[1] - (e[1] - b[1]) * k} ${c[0]},${c[1]}`;
    }
    return d + "Z";
}

// детерминированный «шум» — одинаковая карта у всех и при каждом открытии
function random(seed) { return () => ((seed = Math.imul(1664525, seed) + 1013904223 >>> 0) / 4294967296); }

const ISLAND = [[180, 130], [420, 72], [640, 96], [800, 62], [905, 165], [872, 335], [935, 475], [884, 640], [942, 785],
    [822, 905], [640, 962], [560, 1052], [420, 1004], [300, 932], [160, 884], [108, 720], [152, 560], [88, 430], [138, 282]];

export class CityMap {
    constructor(hub) {
        this.hub = hub;
        this.game = hub.game;
        this.root = document.getElementById("map-root");
        this.selected = null;
    }

    // где сейчас бежит герой: id района по локации игры
    current() {
        const loc = this.game.location;
        return MAP_DISTRICTS.find((d) => d.loc === loc)?.id || "street";
    }

    heroName(ids) {
        return ids.map((id) => CHARACTERS.find((c) => c.id === id)?.name || id).join(" и ");
    }

    // состояние района для текущего героя: open — можно бежать, here — уже здесь, hero — только для своих героев,
    // fixed — у героя своя локация (Дима и Саша — только Дубай), soon — строится
    state(d) {
        const heroId = this.game.heroId, own = MAP_DISTRICTS.find((x) => x.heroes?.includes(heroId));
        if (d.soon) return "soon";
        if (d.id === this.current()) return "here";
        if (d.heroes && !d.heroes.includes(heroId)) return "hero";
        if (own && own.id !== d.id) return "fixed";
        return "open";
    }

    render() {
        if (!this.root) return;
        if (!this.svg) this.build();
        for (const d of MAP_DISTRICTS) {
            const g = this.svg.querySelector(`[data-district="${d.id}"]`);
            g.dataset.state = this.state(d);
            g.classList.toggle("sel", this.selected === d.id);
        }
        const here = MAP_DISTRICTS.find((d) => d.id === this.current());
        const pin = this.svg.querySelector(".map-pin");
        pin.setAttribute("transform", `translate(${here.label[0]},${here.label[1] - 46})`);
        this.card(MAP_DISTRICTS.find((d) => d.id === (this.selected || here.id)));
    }

    build() {
        const rand = random(91);
        const roads = [], dots = [];
        // дороги: кольцевая вдоль берега, магистрали между районами и мелкая сетка улиц внутри районов
        const ring = ISLAND.map(([x, y]) => [500 + (x - 500) * 0.86, 560 + (y - 560) * 0.86]);
        roads.push(`<path class="road main" d="${smooth(ring, 0.16)}"/>`);
        const hubs = MAP_DISTRICTS.map((d) => d.label);
        for (let i = 0; i < hubs.length; i++) {
            const a = hubs[i], b = hubs[(i + 3) % hubs.length], mx = (a[0] + b[0]) / 2 + (rand() - 0.5) * 160, my = (a[1] + b[1]) / 2 + (rand() - 0.5) * 160;
            roads.push(`<path class="road main" d="M${a[0]},${a[1]} Q${mx},${my} ${b[0]},${b[1]}"/>`);
        }
        for (const d of MAP_DISTRICTS) {
            const [cx, cy] = d.label;
            for (let i = 0; i < 10; i++) { // кварталы: короткие отрезки сеткой, чуть повёрнутой
                const a = (d.grid || 0) + (i % 2 ? Math.PI / 2 : 0), r = 30 + rand() * 70, ox = (rand() - 0.5) * 150, oy = (rand() - 0.5) * 130;
                const x1 = cx + ox - Math.cos(a) * r, y1 = cy + oy - Math.sin(a) * r, x2 = cx + ox + Math.cos(a) * r, y2 = cy + oy + Math.sin(a) * r;
                roads.push(`<path class="road street" d="M${x1.toFixed(0)},${y1.toFixed(0)} L${x2.toFixed(0)},${y2.toFixed(0)}"/>`);
            }
        }
        for (let i = 0; i < 260; i++) { // огни вне районов: деревни, фонари трасс
            const x = 120 + rand() * 800, y = 100 + rand() * 920;
            dots.push(`<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(0.8 + rand() * 1.6).toFixed(1)}"/>`);
        }
        const districts = MAP_DISTRICTS.map((d) => {
            const tag = d.soon ? "СКОРО" : d.heroes ? "ДИМА · САША" : "ОТКРЫТ", tw = 24 + tag.length * 10; // плашка по длине надписи
            return `
            <g class="district" data-district="${d.id}" tabindex="0" role="button" aria-label="${esc(d.name)}">
                <path class="area" d="${smooth(d.poly, 0.12)}"/>
                <text class="name" x="${d.label[0]}" y="${d.label[1]}">${esc(d.name.toUpperCase())}</text>
                <g class="tag" transform="translate(${d.label[0]},${d.label[1] + 26})">
                    <rect x="${-tw / 2}" y="-15" width="${tw}" height="26" rx="13"/><text y="4">${tag}</text>
                </g>
            </g>`;
        }).join("");
        this.root.innerHTML = `
            <svg class="map-svg" viewBox="40 20 940 1060" preserveAspectRatio="xMidYMid meet" xmlns="${NS}">
                <defs>
                    <radialGradient id="map-land" cx="45%" cy="45%" r="70%"><stop offset="0" stop-color="#3a1574"/><stop offset=".65" stop-color="#22104a"/><stop offset="1" stop-color="#160a33"/></radialGradient>
                    <filter id="map-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="22"/></filter>
                    <filter id="map-neon" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                    <pattern id="map-hatch" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="12" height="12" fill="#ffffff05"/><rect width="3" height="12" fill="#ffffff10"/></pattern>
                </defs>
                <path class="sea-glow" d="${smooth(ISLAND)}" filter="url(#map-glow)"/>
                <path class="land" d="${smooth(ISLAND)}" fill="url(#map-land)"/>
                <g class="lights">${dots.join("")}</g>
                <g class="roads" filter="url(#map-neon)">${roads.join("")}</g>
                <g class="districts">${districts}</g>
                <g class="map-pin"><circle class="pulse" r="18"/><circle class="dot" r="7"/><text y="-16">ВЫ ЗДЕСЬ</text></g>
            </svg>
            <div class="map-card" id="map-card"></div>`;
        this.svg = this.root.querySelector("svg");
        for (const g of this.svg.querySelectorAll(".district")) {
            const pick = () => { this.selected = g.dataset.district; this.game.audio.play("swipe"); this.render(); };
            g.addEventListener("click", pick);
            g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
        }
    }

    // карточка района под картой: что это, можно ли сюда, и действие
    card(d) {
        const el = document.getElementById("map-card"), st = this.state(d);
        const chip = { here: "ВЫ ЗДЕСЬ", open: "ОТКРЫТ", soon: "СКОРО", hero: "ЗАКРЫТ", fixed: "НЕ ДЛЯ ГЕРОЯ" }[st];
        const hero = CHARACTERS.find((c) => c.id === this.game.heroId)?.name || "Герой";
        const note = st === "soon" ? "Район ещё строится — откроется в следующих обновлениях."
            : st === "hero" ? `Открывается только у героев: ${this.heroName(d.heroes)}.`
                : st === "fixed" ? `${hero} бегает только в своей локации. Чтобы бежать здесь — выбери другого героя.`
                    : st === "here" ? "Здесь проходит твой забег." : "Можно бежать здесь — выбери район.";
        const action = st === "open" ? `<button class="btn btn-main" id="map-go">Бежать здесь</button>`
            : st === "hero" || st === "fixed" ? `<button class="btn btn-ghost" id="map-heroes">К героям</button>`
                : st === "here" ? `<button class="btn btn-main" id="map-run">Забег</button>` : "";
        el.dataset.state = st;
        el.innerHTML = `<div class="map-card-head"><h3>${esc(d.name)}</h3><span class="map-chip">${chip}</span></div>
            <p>${esc(d.text || "")}</p><p class="map-note">${esc(note)}</p>${action}`;
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
