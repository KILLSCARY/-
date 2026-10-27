// Главная: кошелёк, глава, вкладки «Герои / Забег / Кейсы / Магазин» и открытие кейсов с лентой наград.

import { CHARACTERS, SOON_HEROES, HERO_PRICES, HERO_PERKS, BOOSTS, UPGRADES, CASES, RARITY, APPEAL_PRICE } from "./config.js";

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.floor(n).toLocaleString("ru-RU").replace(/ /g, " ");
const ICON = { usdt: '<svg class="ico-usdt"><use href="#ico-usdt"/></svg>', trx: '<svg class="ico-usdt"><use href="#ico-trx"/></svg>' };
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export class Hub {
    constructor(game, profile) {
        this.game = game;
        this.p = profile;
        this.current = "run";
        this.seg = "boosts";
        for (const b of document.querySelectorAll(".tabbar button")) b.onclick = () => this.tab(b.dataset.tab);
        for (const b of document.querySelectorAll(".seg button")) b.onclick = () => { this.seg = b.dataset.seg; this.renderShop(); };
        $("hero-chip").onclick = () => this.tab("heroes");
        $("btn-case-ok").onclick = () => { this.game.show("menu"); this.render(); };
        setInterval(() => { if (this.current === "cases") this.renderCases(); }, 30000); // таймер бесплатного конверта
    }

    tab(name) {
        this.current = name;
        for (const b of document.querySelectorAll(".tabbar button")) b.classList.toggle("on", b.dataset.tab === name);
        for (const v of document.querySelectorAll(".view")) v.hidden = v.id !== `view-${name}`;
        this.game.audio.play("swipe");
        this.render();
    }

    render() {
        const p = this.p;
        $("w-usdt").textContent = fmt(p.usdt);
        $("w-trx").textContent = fmt(p.trx);
        const ch = p.chapter();
        $("chap-name").textContent = ch.done ? "Сезон 1 пройден" : `Глава ${ch.index + 1} · ${ch.name}`;
        $("chap-num").textContent = ch.done ? fmt(ch.earned) : `${fmt(ch.earned)} / ${fmt(ch.goal)}`;
        $("chap-bar").style.width = `${Math.min(100, (ch.earned / ch.goal) * 100)}%`;
        const hero = CHARACTERS.find((c) => c.id === this.game.heroId);
        $("hero-chip").textContent = `${hero?.name ?? ""} ▸`;
        $("cases-badge").hidden = !this.freeReady();
        if (this.current === "heroes") this.renderHeroes();
        if (this.current === "cases") this.renderCases();
        if (this.current === "shop") this.renderShop();
    }

    toast(text) {
        const t = $("toast");
        t.textContent = text;
        t.hidden = false;
        t.classList.remove("show"); void t.offsetWidth; t.classList.add("show");
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
    }

    // ---- герои ----
    renderHeroes() {
        const box = $("heroes-list");
        box.innerHTML = "";
        const art = (c) => c.portrait ? `<div class="card-art" style="background-image:url('${c.portrait}')"></div>` : "";
        for (const c of CHARACTERS) {
            const card = document.createElement("div");
            card.className = "card card-hero" + (c.portrait ? " has-art" : "");
            const perk = HERO_PERKS[c.id]?.text ?? "";
            if (c.locked) {
                card.classList.add("card-off");
                card.innerHTML = `${art(c)}<div class="card-main"><span class="card-tag">Не играбелен</span><h3>${c.name}</h3><p>${c.locked}. Сыграть за него нельзя</p></div>`;
            } else if (this.p.owns(c.id)) {
                const on = c.id === this.game.heroId;
                card.innerHTML = `${art(c)}<div class="card-main">${on ? '<span class="card-tag on">В забеге</span>' : ""}<h3>${c.name}</h3><p>${perk}</p></div>`;
                const b = document.createElement("button");
                b.className = "btn-small" + (on ? " is-on" : "");
                b.textContent = on ? "Выбран" : "Выбрать";
                b.disabled = on;
                b.onclick = () => { this.game.selectHero(c.id); this.render(); };
                card.append(b);
            } else {
                const price = HERO_PRICES[c.id];
                const share = Math.min(1, this.p.usdt / price);
                card.classList.add("card-lock");
                card.innerHTML = `${art(c)}<div class="card-main"><span class="card-tag">Выкуп</span><h3>${c.name}</h3><p>${perk}</p>
                    <div class="lock-row"><span>${fmt(Math.min(this.p.usdt, price))} / ${fmt(price)} USDT</span><b>${Math.floor(share * 100)}%</b></div>
                    <div class="bar gold"><i style="width:${share * 100}%"></i></div></div>`;
                const b = document.createElement("button");
                b.className = "btn-small btn-gold";
                b.innerHTML = share >= 1 ? `Выкупить ${ICON.usdt} ${fmt(price)}` : `Ещё ${fmt(price - this.p.usdt)}`;
                b.disabled = share < 1;
                b.onclick = () => {
                    if (!this.p.buyHero(c.id)) return;
                    this.game.audio.play("buy");
                    this.toast(`${c.name} в команде!`);
                    this.game.selectHero(c.id);
                    this.render();
                };
                card.append(b);
            }
            box.append(card);
        }
        for (const c of SOON_HEROES) {
            const card = document.createElement("div");
            card.className = "card card-hero has-art card-soon";
            card.innerHTML = `${art(c)}<div class="card-main"><span class="card-tag">Скоро</span><h3>${c.name}</h3><p>Появится в следующих главах</p></div>`;
            box.append(card);
        }
    }

    // ---- магазин ----
    renderShop() {
        for (const b of document.querySelectorAll(".seg button")) b.classList.toggle("on", b.dataset.seg === this.seg);
        const box = $("shop-list");
        box.innerHTML = "";
        if (this.seg === "boosts") {
            for (const it of BOOSTS) {
                const have = this.p.data.next[it.id] || 0;
                const card = document.createElement("div");
                card.className = "card";
                card.innerHTML = `<div class="card-main"><h3>${it.name}</h3><p>${it.text}</p>${have ? `<span class="have">На следующие забеги: ${have}</span>` : ""}</div>`;
                card.append(this.priceButton({ usdt: it.price }, () => {
                    this.p.addBoost(it.id);
                    this.toast(`${it.name} — сработает в следующем забеге`);
                }));
                box.append(card);
            }
            const appeal = document.createElement("div");
            appeal.className = "card card-note";
            appeal.innerHTML = `<div class="card-main"><h3>Апелляция</h3><p>Второй шанс после проигрыша — кнопка на экране проигрыша, ${APPEAL_PRICE} TRX. TRX дают монеты TRX на дороге и кейсы.</p></div>`;
            box.append(appeal);
        } else {
            for (const [id, u] of Object.entries(UPGRADES)) {
                const lvl = this.p.level(id);
                const card = document.createElement("div");
                card.className = "card";
                const pips = u.times.map((_, i) => `<i class="${i < lvl ? "f" : ""}"></i>`).join("");
                card.innerHTML = `<div class="card-main"><h3>${u.name}</h3><p>${u.text}: сейчас ${u.times[lvl - 1]} с${lvl < u.times.length ? `, дальше ${u.times[lvl]} с` : ""}</p><div class="pips">${pips}</div></div>`;
                if (lvl < u.times.length) {
                    card.append(this.priceButton({ usdt: u.prices[lvl - 1] }, () => {
                        this.p.levelUp(id);
                        this.toast(`${u.name}: уровень ${lvl + 1}`);
                    }));
                } else {
                    const b = document.createElement("button");
                    b.className = "btn-small is-on";
                    b.textContent = "Максимум";
                    b.disabled = true;
                    card.append(b);
                }
                box.append(card);
            }
        }
    }

    priceButton(price, onBuy) {
        const b = document.createElement("button");
        b.className = "btn-small" + (price.trx ? " btn-trx" : "");
        b.innerHTML = price.trx ? `${ICON.trx} ${price.trx}` : `${ICON.usdt} ${fmt(price.usdt)}`;
        const enough = price.trx ? this.p.trx >= price.trx : this.p.usdt >= price.usdt;
        b.disabled = !enough;
        b.onclick = () => {
            if (!this.p.pay(price)) return;
            this.game.audio.play("buy");
            onBuy();
            this.render();
        };
        return b;
    }

    // ---- кейсы ----
    freeReady() {
        const env = CASES.find((c) => c.free);
        return Date.now() - (this.p.data.freeAt || 0) >= env.free;
    }

    renderCases() {
        const box = $("cases-list");
        box.innerHTML = "";
        for (const c of CASES) {
            const card = document.createElement("div");
            card.className = `card case-card case-${c.id}`;
            card.innerHTML = `<div class="case-box"></div><div class="card-main"><h3>${c.name}</h3><p>${c.text}</p>
                <div class="odds">${this.odds(c)}</div></div>`;
            if (c.free) {
                const left = c.free - (Date.now() - (this.p.data.freeAt || 0));
                const b = document.createElement("button");
                b.className = "btn-small btn-gold";
                b.disabled = left > 0;
                b.textContent = left > 0 ? `через ${Math.floor(left / 3600000)} ч ${Math.ceil((left % 3600000) / 60000)} мин` : "Открыть";
                b.onclick = () => { this.p.data.freeAt = Date.now(); this.p.save(); this.open(c); };
                card.append(b);
            } else {
                card.append(this.priceButton(c.priceTrx ? { trx: c.priceTrx } : { usdt: c.price }, () => this.open(c)));
            }
            box.append(card);
        }
    }

    odds(c) {
        const total = c.drops.reduce((s, d) => s + d.w, 0);
        const by = {};
        for (const d of c.drops) by[d.r] = (by[d.r] || 0) + d.w;
        return Object.entries(by).map(([r, w]) => `<span style="--rc:${RARITY[r].color}">${RARITY[r].name} ${Math.round((w / total) * 100)}%</span>`).join("");
    }

    roll(c) {
        let r = Math.random() * c.drops.reduce((s, d) => s + d.w, 0);
        const d = c.drops.find((x) => (r -= x.w) < 0) || c.drops[0];
        return { ...d, amount: d.usdt ? rnd(d.usdt[0], d.usdt[1]) : 0 };
    }

    label(d) {
        const parts = [];
        if (d.amount) parts.push(`${fmt(d.amount)} USDT`);
        if (d.trx) parts.push(`${d.trx} TRX`);
        if (d.boosts) parts.push(d.boosts > 1 ? `${d.boosts} добавки` : "Добавка");
        if (d.all) parts.push("Все добавки");
        if (d.level) parts.push("Уровень прокачки");
        return parts.join(" + ");
    }

    // лента наград крутится 4 с и останавливается на выигрыше
    open(c) {
        const WIN = 34, CELL = 112;
        const items = Array.from({ length: WIN + 6 }, () => this.roll(c));
        const win = items[WIN];
        $("case-title").textContent = c.name;
        $("case-result").textContent = "Крутится…";
        $("btn-case-ok").disabled = true;
        const strip = $("case-strip");
        strip.innerHTML = items.map((d) => `<div class="cell" style="--rc:${RARITY[d.r].color}"><span>${this.label(d)}</span></div>`).join("");
        this.game.show("case-open");
        const center = (i) => strip.parentElement.clientWidth / 2 - (i * CELL + 52);
        strip.style.transition = "none";
        strip.style.transform = `translateX(${center(2)}px)`;
        void strip.offsetWidth;
        const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
        strip.style.transition = reduce ? "none" : "transform 4s cubic-bezier(.12,.72,.14,1)";
        strip.style.transform = `translateX(${center(WIN) + (Math.random() - 0.5) * 70}px)`;
        setTimeout(() => {
            const text = this.give(win);
            this.game.audio.play("chest");
            $("case-result").innerHTML = `<b style="color:${RARITY[win.r].color}">${RARITY[win.r].name}</b>: ${text}`;
            $("btn-case-ok").disabled = false;
        }, reduce ? 100 : 4100);
    }

    give(d) {
        if (d.amount || d.trx) this.p.gift(d.amount, d.trx || 0);
        const got = [];
        if (d.boosts) for (let i = 0; i < d.boosts; i++) { const b = pick(BOOSTS); this.p.addBoost(b.id); got.push(b.name); }
        if (d.all) for (const b of BOOSTS) this.p.addBoost(b.id);
        if (d.level) {
            const id = pick(Object.keys(UPGRADES));
            if (this.p.levelUp(id)) got.push(`${UPGRADES[id].name}: уровень ${this.p.level(id)}`);
            else { this.p.gift(3000); got.push("прокачка уже на максимуме — 3 000 USDT"); }
        }
        return [this.label(d), got.length ? `(${got.join(", ")})` : ""].join(" ");
    }
}
