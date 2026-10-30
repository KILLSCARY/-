// Карта города (меню → «Карта»): в стиле меню игры — чёрный фон, графитовые кварталы-блоки, между ними дороги
// с пунктиром, красный — где ты сейчас. Открытые районы выбираются как локация забега, у Дубая — свои герои,
// остальные — «СКОРО». Один SVG (векторно — чётко на любом экране); районы и тексты — MAP_DISTRICTS в config.js.
import { MAP_DISTRICTS, CHARACTERS } from "./config.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// детерминированный «шум» — одинаковая карта у всех и при каждом открытии
const random = (seed) => () => ((seed = Math.imul(1664525, seed) + 1013904223 >>> 0) / 4294967296);

// фактура кварталов: цвет «домов» внутри блока и свет в окнах
const THEMES = {
    winter: { from: "#1a2433", to: "#0f141c", house: "#9fc2ff", lit: "#ffd9a0", snow: true },
    street: { from: "#221a2b", to: "#121016", house: "#8f7aa8", lit: "#ffb36a" },
    dubai: { from: "#2e2116", to: "#16110c", house: "#e0b07a", lit: "#ffe0a8", water: true },
    soon: { from: "#17171a", to: "#111113", house: "#3b3b42", lit: null },
};
const LOCK = "M-7 -1v-4a7 7 0 0 1 14 0v4h2v12h-18v-12z M-4 -1h8v-4a4 4 0 0 0-8 0z"; // замок (центр в 0,0)

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

    render() {
        if (!this.root) return;
        if (!this.svg) this.build();
        for (const d of MAP_DISTRICTS) {
            const g = this.svg.querySelector(`[data-district="${d.id}"]`), st = this.state(d), label = this.chip(d, st);
            g.dataset.state = st;
            g.classList.toggle("sel", this.selected === d.id);
            const w = 30 + label.length * 11, rect = g.querySelector(".chip rect");
            g.querySelector(".chip text").textContent = label;
            rect.setAttribute("x", -w / 2);
            rect.setAttribute("width", w);
        }
        this.card(MAP_DISTRICTS.find((d) => d.id === (this.selected || this.current())));
    }

    build() {
        const rand = random(91), roads = [], blocks = [];
        // дороги — в промежутках между кварталами: тёмное полотно и пунктир по оси
        const lanes = [[20, 343, 654, 343], [20, 653, 654, 653], [680, 573, 980, 573], [333, 20, 333, 330], [333, 666, 333, 980],
            [433, 356, 433, 640], [667, 20, 667, 980]];
        for (const [x1, y1, x2, y2] of lanes) roads.push(`<line class="road" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/><line class="lane" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`);
        for (const d of MAP_DISTRICTS) {
            const [x1, y1, x2, y2] = d.rect, t = THEMES[d.theme], w = x2 - x1, h = y2 - y1;
            const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2, houses = [];
            // застройка: дома сеткой с пропусками, в части окон свет; у Дубая — вода вдоль края, у зимы — снег
            for (let y = y1 + 18; y < y2 - 24; y += 30) for (let x = x1 + 18; x < x2 - 24; x += 30) {
                if (rand() < 0.28) continue;
                const s = 12 + rand() * 10;
                houses.push(`<rect x="${(x + rand() * 6).toFixed(0)}" y="${(y + rand() * 6).toFixed(0)}" width="${s.toFixed(0)}" height="${s.toFixed(0)}" rx="3" fill="${t.lit && rand() < 0.22 ? t.lit : t.house}" opacity="${(0.08 + rand() * 0.14).toFixed(2)}"/>`);
            }
            if (t.water) houses.push(`<rect x="${x2 - 70}" y="${y1}" width="70" height="${h}" fill="#3a6f8f" opacity=".35"/>`);
            if (t.snow) for (let i = 0; i < 40; i++) houses.push(`<circle cx="${(x1 + rand() * w).toFixed(0)}" cy="${(y1 + rand() * h).toFixed(0)}" r="${(1 + rand() * 2).toFixed(1)}" fill="#fff" opacity=".35"/>`);
            blocks.push(`
                <g class="district" data-district="${d.id}" tabindex="0" role="button" aria-label="${esc(d.name)}">
                    <clipPath id="clip-${d.id}"><rect x="${x1}" y="${y1}" width="${w}" height="${h}" rx="26"/></clipPath>
                    <linearGradient id="fill-${d.id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.from}"/><stop offset="1" stop-color="${t.to}"/></linearGradient>
                    <rect class="block" x="${x1}" y="${y1}" width="${w}" height="${h}" rx="26" fill="url(#fill-${d.id})"/>
                    <g clip-path="url(#clip-${d.id})">${houses.join("")}${d.soon ? `<rect x="${x1}" y="${y1}" width="${w}" height="${h}" fill="url(#map-hatch)"/>` : ""}</g>
                    <rect class="frame" x="${x1}" y="${y1}" width="${w}" height="${h}" rx="26"/>
                    ${d.soon ? `<path class="lock" d="${LOCK}" transform="translate(${cx},${cy - 66}) scale(1.6)"/>` : ""}
                    <text class="name" x="${cx}" y="${cy}">${this.wrap(d.name, cx, w)}</text>
                    <g class="chip" transform="translate(${cx},${cy + 44})"><rect y="-17" height="32" rx="16"/><text y="6"></text></g>
                </g>`);
        }
        this.root.innerHTML = `
            <svg class="map-svg" viewBox="0 0 1000 1000" xmlns="http://www.w3.org/2000/svg">
                <defs><pattern id="map-hatch" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="16" fill="#fff" opacity=".035"/></pattern></defs>
                <rect class="ground" x="0" y="0" width="1000" height="1000" rx="34"/>
                <g class="roads">${roads.join("")}</g>
                <g class="districts">${blocks.join("")}</g>
            </svg>
            <div class="map-card card" id="map-card"></div>`;
        this.svg = this.root.querySelector("svg");
        for (const g of this.svg.querySelectorAll(".district")) {
            const pick = () => { this.selected = g.dataset.district; this.game.audio.play("swipe"); this.render(); };
            g.addEventListener("click", pick);
            g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
        }
    }

    // название в одну строку, если влезает в блок, иначе — в две (по пробелу)
    wrap(name, cx, w) {
        const up = esc(name.toUpperCase()), words = up.split(" ");
        if (up.length * 23 < w - 40 || words.length < 2) return up;
        return `<tspan x="${cx}" dy="-14">${words[0]}</tspan><tspan x="${cx}" dy="32">${words.slice(1).join(" ")}</tspan>`;
    }

    // карточка района под картой: что это, можно ли сюда, и действие
    card(d) {
        const el = document.getElementById("map-card"), st = this.state(d);
        const hero = CHARACTERS.find((c) => c.id === this.game.heroId)?.name || "Герой";
        const note = st === "soon" ? "Район строится — откроется в следующих обновлениях."
            : st === "hero" ? `Открывается только у героев: ${this.heroNames(d.heroes)}.`
                : st === "fixed" ? `${hero} бегает только в своём районе. Чтобы бежать здесь — выбери другого героя.`
                    : st === "here" ? "Здесь проходит твой забег." : "Открыт — можно бежать здесь.";
        const action = st === "open" ? `<button class="btn btn-main" id="map-go">Бежать здесь</button>`
            : st === "hero" || st === "fixed" ? `<button class="btn btn-ghost map-btn-line" id="map-heroes">К героям</button>`
                : st === "here" ? `<button class="btn btn-main" id="map-run">Забег</button>` : "";
        el.dataset.state = st;
        el.innerHTML = `<div class="card-main"><div class="map-card-head"><h3>${esc(d.name)}</h3><span class="map-chip">${this.chip(d, st)}</span></div>
            <p class="map-text">${esc(d.text || "")}</p><p>${esc(note)}</p>${action}</div>`;
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
