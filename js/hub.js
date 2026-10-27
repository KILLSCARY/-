// Главная (плитки 01–05), вкладка «Герои» (карусель с портретами), кейсы с лентой наград и NS Store.

import { tg } from "./tg.js";
import { CHARACTERS, SOON_HEROES, HERO_PRICES, HERO_PERKS, BOOSTS, UPGRADES, CASES, RARITY, APPEAL_PRICE, CASE_ITEM_ART } from "./config.js";

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
        for (const b of document.querySelectorAll("[data-back]")) b.onclick = () => this.back();
        // «назад» на компьютере — Esc или Backspace
        addEventListener("keydown", (e) => {
            if ((e.key === "Escape" || e.key === "Backspace") && this.game.state === "menu" && this.current !== "run") this.back();
        });
        for (const b of document.querySelectorAll(".seg button")) b.onclick = () => { this.seg = b.dataset.seg; this.renderShop(); };
        for (const t of document.querySelectorAll("#tiles [data-go]")) t.onclick = () => this.tab(t.dataset.go);
        this.focus = null; // герой в центре карусели «Героев»
        $("btn-case-ok").onclick = () => { this.game.show("menu"); this.render(); };
        setInterval(() => { if (this.current === "cases") this.renderCases(); }, 30000); // таймер бесплатного конверта
    }

    tab(name) {
        this.current = name;
        document.querySelector(".hub").dataset.tab = name;
        tg.backButton(name !== "run" && (() => this.back())); // системная «назад» Telegram в шапке
        for (const v of document.querySelectorAll(".view")) {
            const on = v.id === `view-${name}`;
            v.hidden = !on;
            if (!on) continue;
            // въезд: в раздел — справа, обратно на главную — слева
            v.classList.remove("in-fwd", "in-back");
            void v.offsetWidth;
            v.classList.add(name === "run" ? "in-back" : "in-fwd");
        }
        this.game.audio.play("swipe");
        this.render();
    }

    back() {
        if (this.current !== "run") this.tab("run");
    }

    render() {
        const p = this.p;
        $("w-usdt").textContent = fmt(p.usdt);
        $("w-trx").textContent = fmt(p.trx);
        const ch = p.chapter();
        $("chap-name").textContent = ch.done ? "Сезон 1 пройден" : `Глава ${ch.index + 1} · ${ch.name}`;
        $("chap-num").textContent = ch.done ? fmt(ch.earned) : `${fmt(ch.earned)} / ${fmt(ch.goal)}`;
        $("chap-bar").style.width = `${Math.min(100, (ch.earned / ch.goal) * 100)}%`;
        const free = this.freeReady();
        // плитки главной
        $("tile-cases-badge").hidden = !free;
        $("tile-cases-sub").textContent = free ? "Конверт готов" : "Мерчант, Покоритель";
        const next = Object.values(p.data.next || {}).reduce((a, b) => a + b, 0);
        $("tile-shop-sub").textContent = next ? `Добавок в запасе: ${next}` : "Магнит, мёд, щит";
        const hero = CHARACTERS.find((c) => c.id === this.game.heroId);
        $("tile-heroes-sub").textContent = hero?.name ?? "";
        $("tile-heroes-thumb").style.backgroundImage = hero?.portrait ? `url('${hero.portrait}')` : "none";
        $("tile-chap-name").textContent = ch.done ? "Сезон 1" : `Глава ${ch.index + 1}`;
        $("tile-chap-sub").textContent = ch.done ? "пройден" : `${ch.name} · ${Math.floor(Math.min(1, ch.earned / ch.goal) * 100)}%`;
        $("tile-chap-bar").style.width = `${Math.min(100, (ch.earned / ch.goal) * 100)}%`;
        $("tile-earned").textContent = `${fmt(p.data.earned || 0)} USDT`;
        document.querySelector(".hub").dataset.tab = this.current;
        this.updatePlay();
        if (this.current === "heroes") this.renderCarousel();
        if (this.current === "cases") this.renderCases();
        if (this.current === "shop") this.renderShop();
    }

    // ---- герои: карусель ----
    heroList() {
        return [...CHARACTERS.map((c) => ({ ...c, soon: false })), ...SOON_HEROES.map((c, i) => ({ ...c, id: `soon${i}`, soon: true }))];
    }

    // состояние героя: play — можно бежать, buy — выкуп, locked — не бегает, soon — скоро
    heroState(c) {
        if (c.soon) return "soon";
        if (c.locked) return "locked";
        return this.p.owns(c.id) ? "play" : "buy";
    }

    renderCarousel() {
        const box = $("carousel");
        const list = this.heroList();
        if (box.dataset.sig !== list.map((c) => c.id + this.heroState(c)).join()) {
            box.dataset.sig = list.map((c) => c.id + this.heroState(c)).join();
            box.innerHTML = list.map((c) => {
                const st = this.heroState(c);
                const tag = st === "play" ? (c.id === this.game.heroId ? "В забеге" : "В команде")
                    : st === "buy" ? `Выкуп · ${fmt(HERO_PRICES[c.id])}` : st === "locked" ? "На связи" : "Скоро";
                const text = c.soon ? "Появится в следующих главах" : st === "locked" ? c.locked : HERO_PERKS[c.id]?.text ?? "";
                return `<div class="hcard st-${st}" data-id="${c.id}">
                    <div class="ph" style="background-image:url('${c.portrait ?? ""}')"></div>
                    <div class="meta"><span class="tag">${tag}</span><h3>${c.name}</h3><p>${text}</p></div></div>`;
            }).join("");
            for (const el of box.querySelectorAll('.hcard')) el.onclick = () => this.scrollTo(el.dataset.id, true);
            box.onscroll = () => { if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; this.layoutCarousel(); }); };
            requestAnimationFrame(() => this.scrollTo(this.focus ?? this.game.heroId, false));
        } else if (!this.focus) {
            requestAnimationFrame(() => this.scrollTo(this.game.heroId, false));
        } else {
            for (const el of box.querySelectorAll(".hcard")) {
                const c = list.find((x) => x.id === el.dataset.id);
                if (this.heroState(c) === "play") el.querySelector(".tag").textContent = c.id === this.game.heroId ? "В забеге" : "В команде";
            }
        }
        this.renderDetail();
    }

    scrollTo(id, smooth) {
        const el = [...$("carousel").querySelectorAll(".hcard")].find((x) => x.dataset.id === id);
        if (!el) return;
        const box = $("carousel");
        box.scrollTo({ left: el.offsetLeft - (box.clientWidth - el.clientWidth) / 2, behavior: smooth ? "smooth" : "auto" });
        if (!smooth) this.layoutCarousel();
    }

    // карточки ближе к центру — крупнее и ярче; центральная становится выбранной
    layoutCarousel() {
        const box = $("carousel");
        const mid = box.scrollLeft + box.clientWidth / 2;
        let best = null, bestD = Infinity;
        const cards = box.querySelectorAll(".hcard");
        for (const el of cards) {
            const d = (el.offsetLeft + el.clientWidth / 2 - mid) / el.clientWidth;
            const k = Math.min(1, Math.abs(d));
            el.style.transform = `scale(${1 - 0.16 * k})`;
            el.style.opacity = String(1 - 0.5 * k);
            if (Math.abs(d) < bestD) { bestD = Math.abs(d); best = el; }
        }
        for (const el of cards) el.classList.toggle("active", el === best);
        clearTimeout(this.snapTimer);
        this.snapTimer = setTimeout(() => this.setFocus(best?.dataset.id), 90);
    }

    setFocus(id) {
        if (!id || id === this.focus) return;
        this.focus = id;
        this.game.audio.play("swipe");
        this.renderDetail();
    }

    // под каруселью: имя, умение и действие — «Выбрать», «Выкупить», «Скоро»
    renderDetail() {
        const box = $("hero-detail");
        const c = this.heroList().find((x) => x.id === (this.focus ?? this.game.heroId));
        if (!box || !c) return;
        const st = this.heroState(c);
        const on = st === "play" && c.id === this.game.heroId;
        const price = HERO_PRICES[c.id];
        const share = st === "buy" ? Math.min(1, this.p.usdt / price) : 0;
        const text = c.soon ? "Появится в следующих главах" : st === "locked" ? `${c.locked}. Сыграть за него нельзя` : HERO_PERKS[c.id]?.text ?? "";
        box.innerHTML = `<p class="label">${on ? "В забеге" : st === "play" ? "В команде" : st === "buy" ? "Выкуп" : st === "locked" ? "На связи" : "Скоро"}</p>
            <h3>${c.name}</h3><p class="perk">${text}</p>
            ${st === "buy" ? `<div class="lock-row"><span>${fmt(Math.min(this.p.usdt, price))} / ${fmt(price)} USDT</span><b>${Math.floor(share * 100)}%</b></div><div class="bar"><i style="width:${share * 100}%"></i></div>` : ""}`;
        const b = document.createElement("button");
        b.className = "btn btn-main";
        if (st === "play") {
            b.textContent = on ? "Выбран" : "Выбрать";
            b.disabled = on;
            b.onclick = () => { this.game.selectHero(c.id); this.render(); };
        } else if (st === "buy") {
            b.textContent = share >= 1 ? `Выкупить · ${fmt(price)} USDT` : `Ещё ${fmt(price - this.p.usdt)} USDT`;
            b.disabled = share < 1;
            b.onclick = () => {
                if (!this.p.buyHero(c.id)) return;
                this.game.audio.play("buy");
                this.toast(`${c.name} в команде!`);
                this.game.selectHero(c.id);
                this.render();
            };
        } else {
            b.textContent = st === "soon" ? "Скоро" : "Не бегает";
            b.disabled = true;
        }
        box.append(b);
    }

    // плитка 01 «Забег»: пока модель героя грузится — ждём
    updatePlay() {
        const btn = $("btn-play");
        if (!btn) return;
        btn.disabled = !!this.game.heroLoading;
        $("play-label").textContent = this.game.heroLoading ? "Загрузка…" : "Забег";
        $("play-hero").textContent = CHARACTERS.find((c) => c.id === this.game.heroId)?.name ?? "";
    }

    toast(text) {
        const t = $("toast");
        t.textContent = text;
        t.hidden = false;
        t.classList.remove("show"); void t.offsetWidth; t.classList.add("show");
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
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

    // Витрина: большая карточка на кейс — картинка на цветном свечении, полоса шансов, что внутри, цена
    renderCases() {
        const box = $("cases-list");
        box.innerHTML = "";
        for (const c of CASES) {
            const card = document.createElement("div");
            card.className = `case-card case-${c.id}`;
            card.style.setProperty("--cc", c.color);
            const kinds = [...new Set(c.drops.map((d) => this.kind(d)))];
            card.innerHTML = `<div class="case-art">${this.caseArt(c)}</div>
                <div class="case-info">
                    <span class="card-tag on">${c.free ? "Бесплатно" : c.priceTrx ? "За TRX" : "За USDT"}</span>
                    <h3>${c.name}</h3>
                    <p>${c.text}</p>
                    <div class="odds-bar">${this.oddsBar(c)}</div>
                    <div class="odds">${this.odds(c)}</div>
                    <div class="case-loot">${kinds.map((k) => `<span class="loot">${this.itemIcon(k)}</span>`).join("")}</div>
                </div>`;
            let btn;
            if (c.free) {
                const left = c.free - (Date.now() - (this.p.data.freeAt || 0));
                btn = document.createElement("button");
                btn.className = "btn-small btn-gold";
                btn.disabled = left > 0;
                btn.textContent = left > 0 ? `через ${Math.floor(left / 3600000)} ч ${Math.ceil((left % 3600000) / 60000)} мин` : "Открыть бесплатно";
                btn.onclick = () => { this.p.data.freeAt = Date.now(); this.p.save(); this.open(c); };
            } else {
                btn = this.priceButton(c.priceTrx ? { trx: c.priceTrx } : { usdt: c.price }, () => this.open(c));
            }
            btn.classList.add("case-buy");
            card.querySelector(".case-info").append(btn);
            box.append(card);
        }
    }

    // картинка кейса или нарисованная заглушка (коробка цвета кейса с ремнём)
    caseArt(c) {
        return c.art ? `<img src="${c.art}" alt="" draggable="false">` : `<div class="case-ph"><i></i><b></b></div>`;
    }

    // тип награды → иконка (картинка из CASE_ITEM_ART или заглушка)
    kind(d) {
        return d.level ? "level" : d.all ? "all" : d.boosts ? "boost" : d.trx && !d.amount ? "trx" : "usdt";
    }

    itemIcon(k) {
        if (CASE_ITEM_ART[k]) return `<img class="item-ico" src="${CASE_ITEM_ART[k]}" alt="" draggable="false">`;
        if (k === "usdt") return `<svg class="item-ico"><use href="#ico-usdt"/></svg>`;
        if (k === "trx") return `<svg class="item-ico"><use href="#ico-trx"/></svg>`;
        return `<span class="item-ico ph-${k}"></span>`;
    }

    oddsBar(c) {
        const total = c.drops.reduce((s, d) => s + d.w, 0);
        const by = {};
        for (const d of c.drops) by[d.r] = (by[d.r] || 0) + d.w;
        return Object.entries(by).map(([r, w]) => `<i style="flex:${w / total};background:${RARITY[r].color}"></i>`).join("");
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

    cellHtml(d) {
        return `<div class="cell" style="--rc:${RARITY[d.r].color}">${this.itemIcon(this.kind(d))}<span>${this.label(d)}</span></div>`;
    }

    // Открытие: кейс трясётся (1.2 с) → вспышка → лента крутится 4.2 с → выигрыш подсвечивается, всплывает приз
    open(c) {
        const WIN = 34, CELL = 132, W = 120; // ширина ячейки + промежуток, ширина ячейки
        const items = Array.from({ length: WIN + 6 }, () => this.roll(c));
        const win = items[WIN];
        const co = $("co");
        co.style.setProperty("--cc", c.color);
        co.className = "co s-intro";
        $("case-title").textContent = c.name;
        $("case-label").textContent = "Открытие";
        $("case-result").textContent = "";
        $("btn-case-ok").disabled = true;
        $("co-case").innerHTML = this.caseArt(c);
        $("co-prize").innerHTML = "";
        const strip = $("case-strip");
        strip.innerHTML = items.map((d) => this.cellHtml(d)).join("");
        this.game.show("case-open");
        this.game.audio.play("swipe");
        tg.haptic("light");
        const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
        const center = (i) => $("strip-box").clientWidth / 2 - (i * CELL + W / 2);
        strip.style.transition = "none";
        strip.style.transform = `translate3d(${center(2)}px,0,0)`;
        clearTimeout(this.caseTimer);
        const spin = () => {
            co.className = "co s-spin";
            tg.haptic("medium");
            void strip.offsetWidth;
            strip.style.transition = reduce ? "none" : "transform 4.2s cubic-bezier(.12,.72,.14,1)";
            strip.style.transform = `translate3d(${center(WIN) + (Math.random() - 0.5) * 80}px,0,0)`;
            this.caseTimer = setTimeout(done, reduce ? 50 : 4300);
        };
        const done = () => {
            const text = this.give(win);
            strip.children[WIN].classList.add("win");
            co.className = `co s-win r-${win.r}`;
            co.style.setProperty("--rc", RARITY[win.r].color);
            $("case-label").textContent = RARITY[win.r].name;
            $("co-prize").innerHTML = `<div class="prize">${this.itemIcon(this.kind(win))}<b>${this.label(win)}</b><span>${RARITY[win.r].name}</span>
                <i class="spark"></i><i class="spark"></i><i class="spark"></i><i class="spark"></i><i class="spark"></i><i class="spark"></i></div>`;
            $("case-result").textContent = text.replace(this.label(win), "").trim();
            $("btn-case-ok").disabled = false;
            this.game.audio.play(win.r === "legend" || win.r === "epic" ? "record" : "chest");
            tg.haptic(win.r === "common" ? "success" : "heavy");
        };
        this.caseTimer = setTimeout(spin, reduce ? 50 : 1200);
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
