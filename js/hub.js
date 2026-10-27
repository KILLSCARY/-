// Главная (плитки 01–05), вкладка «Герои» (карусель с портретами), кейсы с лентой наград и NS Store.

import { tg } from "./tg.js";
import { CHARACTERS, SOON_HEROES, HERO_PRICES, HERO_PERKS, BOOSTS, UPGRADES, CASES, RARITY, APPEAL_PRICE, CASE_ITEM_ART, CHAPTERS, LINKS, CLIENT_TYPES, HERO_SKILLS, HERO_GEM_PRICES, GEMS, DAILY, SETS, NS_STORE_URL, BOOST_LIMIT } from "./config.js";

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.floor(n).toLocaleString("ru-RU").replace(/\s/g, " "); // разряды — неразрывным пробелом (узкого в шрифте Unbounded нет): «1 234» не переносится
// в шапке места мало: от 100 тысяч — «123 тыс», от миллиона — «1,2 млн» (точные суммы — в магазине и на экране забега)
const short = (n) => n < 1e5 ? fmt(n) : n < 1e6 ? `${Math.floor(n / 1000)} тыс` : `${(Math.floor(n / 1e5) / 10).toLocaleString("ru-RU")} млн`;
const ICON = { usdt: '<svg class="ico-usdt"><use href="#ico-usdt"/></svg>', trx: '<svg class="ico-usdt"><use href="#ico-trx"/></svg>', gem: '<svg class="ico-usdt"><use href="#ico-gem"/></svg>' };
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export class Hub {
    constructor(game, profile) {
        this.game = game;
        this.p = profile;
        this.current = "run";
        this.seg = "boosts";
        for (const b of document.querySelectorAll("[data-back]")) b.onclick = () => this.back();
        $("btn-settings").onclick = () => this.tab("settings");
        // «назад» на компьютере — Esc или Backspace
        addEventListener("keydown", (e) => {
            if ((e.key === "Escape" || e.key === "Backspace") && this.game.state === "menu" && this.current !== "run") this.back();
        });
        for (const b of document.querySelectorAll(".seg button")) b.onclick = () => { this.seg = b.dataset.seg; this.renderShop(); };
        for (const t of document.querySelectorAll("#tiles [data-go]")) t.onclick = () => this.tab(t.dataset.go);
        this.focus = null; // герой в центре карусели «Героев»
        $("btn-case-ok").onclick = () => {
            const v = $("co-video");
            v.pause();
            v.removeAttribute("src");
            v.load();
            this.game.show("menu");
            this.render();
        };
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
        // поверх открыт кейс: «назад» (Telegram, Esc) — как «Забрать», когда приз уже показан; до этого — ничего
        if (!$("case-open").hidden) {
            if (!$("btn-case-ok").disabled) $("btn-case-ok").click();
            return;
        }
        if (this.current !== "run") this.tab("run");
    }

    render() {
        const p = this.p;
        $("w-usdt").textContent = short(p.usdt);
        $("w-trx").textContent = short(p.trx);
        $("w-gems").textContent = short(p.gems);
        $("menu-best").textContent = short(this.game.best);
        const ch = p.chapter();
        $("chap-name").textContent = ch.done ? "Сезон 1 пройден" : `Глава ${ch.index + 1} · ${ch.name}`;
        $("chap-num").textContent = ch.done ? fmt(ch.earned) : `${fmt(ch.earned)} / ${fmt(ch.goal)}`;
        $("chap-bar").style.width = `${Math.min(100, (ch.earned / ch.goal) * 100)}%`;
        const free = this.freeReady();
        // плитки главной
        $("tile-cases-badge").hidden = !free;
        $("tile-cases-sub").textContent = free ? "Конверт готов" : "Мерчант, Покоритель";
        const next = Object.values(p.data.next || {}).reduce((a, b) => a + b, 0);
        $("tile-shop-sub").textContent = next ? `Добавок в запасе: ${next}` : "Фокус, Рывок, Щит";
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
        if (this.current === "chapters") this.renderChapters();
        if (this.current === "settings") this.renderSettings();
    }

    // ---- настройки: музыка, звуки, вибрация, графика (хранятся в телефоне) ----
    renderSettings() {
        const g = this.game, box = $("settings-list");
        const toggles = [
            { id: "music", name: "Музыка", text: "Треки в меню и в забеге", on: g.audio.musicOn },
            { id: "sfx", name: "Звуки", text: "Монеты, удары, свистки, шум улицы", on: g.audio.sfxOn },
            { id: "vibro", name: "Вибрация", text: "Отклик телефона на действия", on: tg.vibro },
        ];
        const q = g.settings.quality || "auto";
        box.innerHTML = toggles.map((t) => `<div class="card set-row"><div class="card-main"><h3>${t.name}</h3><p>${t.text}</p></div>
            <button class="switch${t.on ? " on" : ""}" data-set="${t.id}" role="switch" aria-checked="${t.on}" aria-label="${t.name}"><i></i></button></div>`).join("")
            + `<div class="card set-row set-q"><div class="card-main"><h3>Графика</h3><p>«Авто» сама снижает качество, если телефон не успевает. Низкая — меньше нагрев и расход батареи.</p>
            <div class="seg seg4">${[["auto", "Авто"], ["high", "Высокая"], ["medium", "Средняя"], ["low", "Низкая"]].map(([v, n]) => `<button data-q="${v}" class="${q === v ? "on" : ""}">${n}</button>`).join("")}</div></div></div>`;
        for (const b of box.querySelectorAll("[data-set]")) b.onclick = () => { g.setSetting(b.dataset.set, !b.classList.contains("on")); this.renderSettings(); };
        for (const b of box.querySelectorAll("[data-q]")) b.onclick = () => { g.setSetting("quality", b.dataset.q); this.renderSettings(); };
    }

    // ---- ежедневный вход ----
    showDaily() {
        const st = this.p.dailyState();
        if (st.claimed || this.game.state !== "menu") return;
        $("daily-day").textContent = st.day;
        $("daily-grid").innerHTML = DAILY.map((r, i) => {
            const label = r.usdt ? `${ICON.usdt}<b>${r.usdt}</b>` : r.gems ? `${ICON.gem}<b>${r.gems}</b>` : `<span class="dg-hero">★</span><b>Герой</b>`;
            const cls = i + 1 < st.day ? "done" : i + 1 === st.day ? "now" : "";
            return `<div class="dg ${cls}"><span>День ${i + 1}</span>${label}</div>`;
        }).join("");
        $("daily").hidden = false;
        $("btn-daily").onclick = () => {
            const day = this.p.claimDaily();
            $("daily").hidden = true;
            if (!day) return;
            const r = DAILY[day - 1];
            if (r.usdt) { this.p.gift(r.usdt); this.toast(`+${r.usdt} USDT`); }
            if (r.gems) { this.p.addGems(r.gems); this.toast(`+${r.gems} кристаллов`); }
            if (r.trial) { // герой на пробу — из тех, кого ещё нет
                const id = pick(Object.keys(HERO_PRICES).filter((h) => !this.p.data.heroes.includes(h)));
                if (id) {
                    this.p.data.trial = { id, until: Date.now() + r.trial * 36e5 };
                    this.p.save();
                    this.toast(`${CHARACTERS.find((c) => c.id === id)?.name} на пробу на ${r.trial} ч!`);
                } else { this.p.addGems(15); this.toast("+15 кристаллов"); }
            }
            this.game.audio.play("chest");
            this.render();
        };
    }

    // Чат с менеджером с готовым сообщением: кодовые фразы и код типа клиента (сам тип игроку не показываем)
    managerLink() {
        const phrases = this.p.phrases(), weak = this.p.weakType();
        const text = `Привет! Я из игры «Покоритель P2P 3.0».${phrases.length ? ` Мои кодовые фразы: ${phrases.join(", ")}.` : ""}${weak ? ` Код: ${CLIENT_TYPES[weak].tag}` : ""}`;
        return `${LINKS.manager}?text=${encodeURIComponent(text)}`;
    }

    // ---- главы: пройденные, текущая (прогресс), закрытые ----
    renderChapters() {
        const ch = this.p.chapter(), earned = this.p.data.earned || 0;
        $("chapter-list").innerHTML = CHAPTERS.map((c, i) => {
            const st = i < ch.index ? "done" : i === ch.index ? "now" : "locked";
            const from = i ? CHAPTERS[i - 1].goal : 0;
            const k = st === "done" ? 1 : st === "now" ? Math.min(1, earned / c.goal) : 0; // как на плитке 05: заработано / цель
            const tag = st === "done" ? "Пройдена" : st === "now" ? "Сейчас" : "Закрыта";
            const line = st === "done" ? `Заработано ${fmt(c.goal)} USDT`
                : st === "now" ? `${fmt(earned)} из ${fmt(c.goal)} USDT, осталось ${fmt(c.goal - earned)}`
                : `Откроется на ${fmt(from)} USDT`;
            const phrase = st === "done" ? `<p class="ch-phrase">Кодовая фраза <b>${c.phrase}</b></p>` : `<p class="ch-phrase">Кодовая фраза откроется после главы</p>`;
            return `<div class="card chapter st-${st}">
                <span class="ch-n">${String(i + 1).padStart(2, "0")}</span>
                <div class="card-main"><span class="card-tag${st === "now" ? " on" : ""}">${tag}</span><h3>${c.name}</h3><p>${line}</p>
                ${c.place ? `<p class="ch-place">${c.place}</p>` : ""}${phrase}
                ${st === "locked" ? "" : `<div class="bar"><i style="width:${k * 100}%"></i></div>`}</div></div>`;
        }).join("") + (this.p.phrases().length ? `<div class="card card-note"><div class="card-main"><h3>Кодовые фразы</h3>
            <p>Назови их менеджеру отдела продаж — он подберёт, что тебе подойдёт.</p><button class="btn-small" id="btn-manager">Написать менеджеру →</button></div></div>` : "") + (ch.done ? `<div class="card card-note"><div class="card-main"><h3>Сезон 1 пройден</h3><p>Все главы открыты. Новые — в следующем сезоне.</p></div></div>` : "");
        const mb = $("btn-manager");
        if (mb) mb.onclick = () => tg.open(this.managerLink());
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
            for (const el of box.querySelectorAll('.hcard')) el.onclick = () => { this.setFocus(el.dataset.id); this.scrollTo(el.dataset.id, true); };
            // колесо мыши на компьютере листает карусель вбок (иначе вертикальное колесо её не двигает)
            box.onwheel = (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.preventDefault(); box.scrollBy({ left: e.deltaY, behavior: "smooth" }); } };
            box.onscroll = () => { if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; this.layoutCarousel(); }); };
            // прокрутка встала (щелчок к карточке) — герой под каруселью сразу, без ожидания последнего scroll
            box.onscrollend = () => { this.layoutCarousel(); clearTimeout(this.snapTimer); this.setFocus(box.querySelector(".hcard.active")?.dataset.id); };
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
        // панель под каруселью сразу следует за центральной карточкой (раньше — только через 90 мс
        // тишины после последнего scroll, и при инерции/лагах она «застревала» на Спиди)
        this.setFocus(best?.dataset.id, true);
    }

    setFocus(id, quiet) {
        if (!id || id === this.focus) return;
        this.focus = id;
        if (!quiet) this.game.audio.play("swipe");
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
        const skill = HERO_SKILLS[c.id];
        const text = c.soon ? "Появится в следующих главах" : st === "locked" ? `${c.locked}. Сыграть за него нельзя`
            : `${HERO_PERKS[c.id]?.text ?? ""}${skill ? `. Умение «${skill.name}»: ${skill.text.toLowerCase()} (раз за забег)` : ""}`;
        const trial = this.p.trialHero() === c.id ? Math.ceil((this.p.data.trial.until - Date.now()) / 36e5) : 0;
        box.innerHTML = `<p class="label">${trial ? `На пробу · ещё ${trial} ч` : on ? "В забеге" : st === "play" ? "В команде" : st === "buy" ? "Выкуп" : st === "locked" ? "На связи" : "Скоро"}</p>
            <h3>${c.name}</h3><p class="perk">${text}</p>
            ${st === "buy" ? `<div class="lock-row"><span>${fmt(Math.min(this.p.usdt, price))} / ${fmt(price)} USDT</span><b>${Math.floor(share * 100)}%</b></div><div class="bar"><i style="width:${share * 100}%"></i></div>` : ""}`;
        const b = document.createElement("button");
        b.className = "btn btn-main";
        if (st === "play") {
            b.textContent = on ? "Выбран" : "Выбрать";
            b.disabled = on;
            b.onclick = () => { this.game.selectHero(c.id); this.render(); };
        } else if (st === "buy") {
            b.innerHTML = share >= 1 ? `Выкупить за ${ICON.usdt} ${fmt(price)}` : `Ещё ${ICON.usdt} ${fmt(price - this.p.usdt)}`;
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
        const gp = HERO_GEM_PRICES[c.id];
        if (gp && (st === "buy" || trial)) { // выкуп за кристаллы
            const g = document.createElement("button");
            g.className = "btn";
            g.innerHTML = `Выкупить за ${ICON.gem} ${gp}`;
            g.disabled = this.p.gems < gp;
            g.onclick = () => {
                if (!this.p.buyHero(c.id, true)) return;
                this.game.audio.play("buy");
                this.toast(`${c.name} в команде!`);
                this.game.selectHero(c.id);
                this.render();
            };
            box.append(g);
        }
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
            const head = (t, p) => {
                const n = document.createElement("div");
                n.className = "card card-note";
                n.innerHTML = `<div class="card-main"><h3>${t}</h3><p>${p}</p></div>`;
                box.append(n);
            };
            head("Горилла-кладовщик", `«Бегать на голодный организм — это к Инспекторше. Затарься.» Бусты — за монеты, можно взять ${BOOST_LIMIT} буста на забег.`);
            for (const it of BOOSTS) {
                const have = this.p.data.next[it.id] || 0;
                box.append(this.storeCard(it, have ? `На следующие забеги: ${have}` : "", this.priceButton({ coins: it.price }, () => {
                    this.p.addBoost(it.id);
                    this.toast("Взял! Буст ждёт в следующем забеге.");
                })));
            }
            head("Наборы", "Паки бустов за кристаллы. Настоящий набор — в @Nesuschiystore.");
            for (const st of SETS) {
                const owned = st.skin && (this.p.data.skins || []).includes(st.skin);
                const btn = owned ? Object.assign(document.createElement("button"), { className: "btn-small is-on", textContent: "Есть", disabled: true })
                    : this.priceButton({ gems: st.gems }, () => {
                        for (const [id, n] of Object.entries(st.give || {})) this.p.addBoost(id, n);
                        if (st.x2runs) this.p.data.x2runs = (this.p.data.x2runs || 0) + st.x2runs;
                        if (st.restore) this.p.data.restore = (this.p.data.restore || 0) + 1;
                        if (st.skin) (this.p.data.skins ||= []).push(st.skin);
                        this.p.save();
                        this.toast(`${st.name} — в запасе`);
                    });
                box.append(this.storeCard(st, "", btn));
            }
            const appeal = document.createElement("div");
            appeal.className = "card card-note";
            appeal.innerHTML = `<div class="card-main"><h3>Апелляция</h3><p>Второй шанс после проигрыша — кнопка на экране проигрыша, ${APPEAL_PRICE} TRX. TRX дают монеты TRX на дороге и кейсы.</p></div>`;
            box.append(appeal);
        } else if (this.seg === "gems") {
            const note = document.createElement("div");
            note.className = "card card-note";
            note.innerHTML = `<div class="card-main"><h3>Кристаллы</h3><p>Твёрдая валюта: выкуп героев и редкое. Ещё дают за главу (${GEMS.chapter}), экзамен Инакова без ошибок и ежедневный вход.</p></div>`;
            box.append(note);
            for (const pk of GEMS.packs) {
                if (pk.once && (this.p.data.packs || []).includes(pk.id)) continue;
                const card = document.createElement("div");
                card.className = `card gem-pack${pk.once ? " gem-starter" : ""}`;
                card.innerHTML = `<div class="gem-ico">${ICON.gem}<b>${pk.gems}</b></div><div class="card-main">${pk.once ? '<span class="card-tag on">Один раз · выгодно</span>' : ""}<h3>${pk.name}</h3><p>${pk.gems} кристаллов${pk.hero ? " + герой" : ""}</p></div>`;
                // реальная оплата (Telegram Stars или кошелёк USDT) ещё не подключена — заглушка
                const b = document.createElement("button");
                b.className = "btn-small";
                b.textContent = `${pk.price} USDT`;
                b.onclick = () => this.toast("Оплата скоро: Telegram Stars или кошелёк USDT");
                card.append(b);
                box.append(card);
            }
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

    // карточка NS Store: иконка, название, эффект, реплика, цена и «Заказать настоящие» → @Nesuschiystore
    storeCard(it, have, priceBtn) {
        const card = document.createElement("div");
        card.className = "card card-store";
        card.innerHTML = `${it.art ? `<img class="store-art" src="${it.art}" alt="" loading="lazy">` : ""}<div class="card-main"><h3>${it.name}</h3><p>${it.text}</p>${it.line ? `<p class="store-line">${it.line}</p>` : ""}${have ? `<span class="have">${have}</span>` : ""}</div>`;
        const acts = document.createElement("div");
        acts.className = "store-acts";
        const real = document.createElement("button");
        real.className = "btn-small btn-real";
        real.textContent = "Заказать настоящие";
        real.onclick = () => this.openStore();
        acts.append(priceBtn, real);
        card.append(acts);
        return card;
    }

    openStore() {
        const wa = window.Telegram?.WebApp;
        if (wa?.openTelegramLink) wa.openTelegramLink(NS_STORE_URL);
        else window.open(NS_STORE_URL, "_blank");
    }

    priceButton(price, onBuy) {
        if (price.coins) { // монеты — игровой кошелёк (в коде он p.usdt), не реальные USDT
            const b = document.createElement("button");
            b.className = "btn-small";
            b.innerHTML = `🪙 ${fmt(price.coins)}`;
            b.disabled = this.p.usdt < price.coins;
            b.onclick = () => {
                if (!this.p.pay({ usdt: price.coins })) return this.toast("Монет маловато. Пробеги ещё главу — Горилла подождёт.");
                this.game.audio.play("buy");
                onBuy();
                this.render();
            };
            return b;
        }
        if (price.gems) {
            const b = document.createElement("button");
            b.className = "btn-small";
            b.innerHTML = `${ICON.gem} ${fmt(price.gems)}`;
            b.disabled = this.p.gems < price.gems;
            b.onclick = () => {
                if (!this.p.pay({ gems: price.gems })) return;
                this.game.audio.play("buy");
                onBuy();
                this.render();
            };
            return b;
        }
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
        this.preloadCaseVideos();
        const box = $("cases-list");
        box.innerHTML = "";
        if (this.p.data.chests > 0) { // сундук за сданный экзамен Инакова — Кейс Мерчанта бесплатно
            const ch = document.createElement("div");
            ch.className = "card card-note chest-note";
            ch.innerHTML = `<div class="card-main"><span class="card-tag on">Экзамен Инакова сдан</span><h3>Сундук ×${this.p.data.chests}</h3><p>Открой Кейс Мерчанта бесплатно</p></div>`;
            const b = document.createElement("button");
            b.className = "btn-small btn-gold";
            b.textContent = "Открыть";
            b.onclick = () => { this.p.data.chests--; this.p.save(); this.open(CASES.find((c) => c.id === "merchant")); };
            ch.append(b);
            box.append(ch);
        }
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
        // d.amount есть только у выпавшей награды, у награды из списка — d.usdt (иначе «легенда» на витрине — с иконкой TRX)
        return d.level ? "level" : d.all ? "all" : d.boosts ? "boost" : d.trx && !d.amount && !d.usdt ? "trx" : "usdt";
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
        // приз — сразу в кошелёк: закрыли приложение посреди анимации — он уже начислен
        const text = this.give(win);
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
        // ролик открытия: кейс разгорается, открывается, бьёт свет — на «burst» вспышка и лента; тап — пропустить.
        // Нет ролика или не запустился — кейс просто трясётся 1.2 с.
        const video = $("co-video");
        let started = false;
        const go = () => { if (started) return; started = true; co.onclick = null; spin(); };
        if (c.video && !reduce && video.canPlayType('video/mp4; codecs="avc1.4D401E"')) {
            co.classList.add("has-video");
            video.src = c.video;
            video.muted = !this.game.audio.enabled;
            video.currentTime = 0;
            video.ontimeupdate = () => { if (video.currentTime >= c.burst) go(); };
            video.play().catch(() => { video.muted = true; return video.play(); }).catch(() => { co.classList.remove("has-video"); this.caseTimer = setTimeout(go, 1200); });
            // кадры ролика — на холст: на iPhone видео рисуется поверх страницы и «осветление» (убрать чёрный фон)
            // на нём не работает, а на холсте работает
            const ctx = $("co-canvas").getContext("2d");
            ctx.clearRect(0, 0, 480, 480);
            const draw = () => {
                if (!co.classList.contains("s-intro") && !co.classList.contains("s-spin")) return;
                if (video.readyState >= 2) ctx.drawImage(video, 0, 0, 480, 480);
                if (!co.classList.contains("s-win")) requestAnimationFrame(draw);
            };
            requestAnimationFrame(draw);
            this.caseTimer = setTimeout(go, (c.burst + 1.5) * 1000); // страховка, если timeupdate не придёт
            setTimeout(() => { co.onclick = (e) => { if (!e.target.closest("button")) go(); }; }, 300);
        } else {
            this.caseTimer = setTimeout(go, reduce ? 50 : 1200);
        }
    }

    // ролики кейсов — заранее, когда открыта вкладка «Кейсы» (чтобы открытие стартовало сразу)
    preloadCaseVideos() {
        if (this.videosLoaded) return;
        this.videosLoaded = true;
        for (const c of CASES) if (c.video) fetch(c.video).catch(() => {});
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
