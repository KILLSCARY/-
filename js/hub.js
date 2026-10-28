// Главная (плитки 01–05), вкладка «Герои» (карусель с портретами), кейсы с лентой наград и NS Store.

import { tg } from "./tg.js";
import { prize } from "./prize.js";
import { CHARACTERS, SOON_HEROES, HERO_PRICES, HERO_PERKS, BOOSTS, UPGRADES, CASES, RARITY, APPEAL_PRICE, CASE_ITEM_ART, USDT_TIERS, RARITY_TITLE, CHAPTERS, LINKS, CLIENT_TYPES, HERO_SKILLS, HERO_UNLOCKS, CHAPTER_BOSSES, DAILY, SETS, SET_RUNS, NS_STORE_URL, BOOST_LIMIT, GORILLA, FIGHTERS, STORIES, CARD_SHOP } from "./config.js";

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.floor(n).toLocaleString("ru-RU").replace(/\s/g, " "); // разряды — неразрывным пробелом (узкого в шрифте Unbounded нет): «1 234» не переносится
// в шапке места мало: от 100 тысяч — «123 тыс», от миллиона — «1,2 млн» (точные суммы — в магазине и на экране забега)
const short = (n) => n < 1e5 ? fmt(n) : n < 1e6 ? `${Math.floor(n / 1000)} тыс` : `${(Math.floor(n / 1e5) / 10).toLocaleString("ru-RU")} млн`;
const ICON = { usdt: '<svg class="ico-usdt"><use href="#ico-usdt"/></svg>', gem: '<svg class="ico-usdt"><use href="#ico-gem"/></svg>' };
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
        if (name === "rating") this.showRating();
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
        const nb = this.game.nextBoss?.();
        $("tile-chap-sub").textContent = ch.done ? "пройден" : nb ? `${ch.name} · босс в гл. ${nb.s.chapter}` : `${ch.name} · ${Math.floor(Math.min(1, ch.earned / ch.goal) * 100)}%`;
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
            { id: "questions", name: "Вопросы-возражения", text: "Стены с вопросами, кодовые фразы и экзамен Инакова. Выкл — просто раннер с арками профита", on: g.questions },
        ];
        const q = g.settings.quality || "auto";
        box.innerHTML = toggles.map((t) => `<div class="card set-row"><div class="card-main"><h3>${t.name}</h3><p>${t.text}</p></div>
            <button class="switch${t.on ? " on" : ""}" data-set="${t.id}" role="switch" aria-checked="${t.on}" aria-label="${t.name}"><i></i></button></div>`).join("")
            + `<div class="card set-row set-q"><div class="card-main"><h3>Графика</h3><p>«Авто» сама снижает качество, если телефон не успевает. Низкая — меньше нагрев и расход батареи.</p>
            <div class="seg seg4">${[["auto", "Авто"], ["high", "Высокая"], ["medium", "Средняя"], ["low", "Низкая"]].map(([v, n]) => `<button data-q="${v}" class="${q === v ? "on" : ""}">${n}</button>`).join("")}</div></div></div>`;
        // на время теста: сразу в бой с любым боссом, все герои; и «пройти всё заново»
        box.insertAdjacentHTML("beforeend", `<div class="card set-row set-q"><div class="card-main"><h3>Для теста</h3><p>Сразу в бой с боссом (после короткого разгона) и все герои открыты.</p>
            <div class="seg seg-test">${STORIES.map((st, i) => `<button data-fight="${i}">${FIGHTERS[st.opponent].short || FIGHTERS[st.opponent].name}${st.exam ? " · экзамен" : ""}</button>`).join("")}</div>
            <button class="btn-small" id="btn-all-heroes">Открыть всех героев</button></div></div>
            <div class="card set-row set-q"><div class="card-main"><h3>Пройти всё заново</h3><p>Сюжет и главы с начала: Мизулина, таблички, анкета Гориллы, боссы и их награды. Кошелёк, герои и бусты остаются.</p>
            <button class="btn-small btn-danger" id="btn-reset-story">Начать заново</button></div></div>`);
        for (const b of box.querySelectorAll("[data-fight]")) b.onclick = () => { this.tab("run"); g.testFight(+b.dataset.fight); };
        $("btn-all-heroes").onclick = () => {
            const d = this.p.data;
            d.heroes = [...new Set([...(d.heroes || []), ...CHARACTERS.map((c) => c.id)])];
            this.p.save();
            this.toast("Все герои открыты");
        };
        const reset = $("btn-reset-story");
        reset.onclick = () => {
            if (!reset.dataset.sure) { reset.dataset.sure = "1"; reset.textContent = "Точно? Нажми ещё раз"; return; }
            g.resetStory();
            this.toast("Начинаем заново: глава 1, Мизулина");
            this.tab("run");
        };
        for (const b of box.querySelectorAll("[data-set]")) b.onclick = () => { g.setSetting(b.dataset.set, !b.classList.contains("on")); this.renderSettings(); };
        for (const b of box.querySelectorAll("[data-q]")) b.onclick = () => { g.setSetting("quality", b.dataset.q); this.renderSettings(); };
    }

    // ---- ежедневный вход ----
    showDaily() {
        const st = this.p.dailyState();
        if (st.claimed || this.game.state !== "menu") return;
        $("daily-day").textContent = st.day;
        $("daily-grid").innerHTML = DAILY.map((r, i) => {
            const label = r.usdt ? `${ICON.usdt}<b>${r.usdt}</b>` : `<span class="dg-hero">★</span><b>Набор</b>`;
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
            if (r.set) { // 7-й день — набор (уже есть — 1000 USDT)
                const st = SETS.find((x) => x.id === r.set);
                if (this.p.unlockSet(r.set)) this.toast(`Набор «${st.name}» — в запасе!`);
                else { this.p.gift(1000); this.toast("+1000 USDT"); }
            }
            this.game.audio.play("chest");
            this.render();
        };
    }

    // первый вход: выбрать режим (по умолчанию — с вопросами)
    showMode() {
        if (this.game.state !== "menu") return;
        $("mode").hidden = false;
        const pickMode = (q) => {
            this.game.setSetting("questions", q);
            this.game.setSetting("modeChosen", true);
            $("mode").hidden = true;
            this.toast(q ? "Режим: с вопросами" : "Режим: просто бежать. Сменить — в настройках");
            setTimeout(() => this.showDaily(), 500);
        };
        $("btn-mode-q").onclick = () => pickMode(true);
        $("btn-mode-noq").onclick = () => pickMode(false);
    }

    // разовое задание для рейтинга: очки даёт сервер (один раз), отметку «сделано» помним сами
    task(id) {
        const d = this.p.data, done = (d.tasksDone ||= {});
        if (!done[id]) { done[id] = 1; this.p.save(); }
        prize.task(id);
    }

    // «Записаться на разбор»: чат с менеджером + задание рейтинга
    razbor(extra = "") {
        this.task("razbor");
        tg.open(this.managerLink(extra));
    }

    // ---- рейтинг игроков (очки считает сервер) ----
    async showRating() {
        const list = $("rate-list"), n = (x) => fmt(x || 0);
        const stats = (r) => [r.cards && `карт ${r.cards}`, r.bosses && `боссов ${r.bosses}`, r.signs && `табличек ${r.signs}`, r.tasks && `заданий ${r.tasks}`].filter(Boolean).join(" · ") || "только начал";
        list.innerHTML = `<p class="rate-empty">Загружаем…</p>`;
        $("rate-me").textContent = "Твоё место";
        $("rate-me-sub").textContent = "";
        this.renderRateTasks();
        const r = await prize.top(50);
        if (!r || r.status !== 200) {
            // код причины — чтобы по скрину было понятно: 401 — сервер не узнал Telegram (другой бот/нет BOT_TOKEN), 0 — нет сети
            const why = r?.status === 401 ? "сервер не узнал Telegram-аккаунт" : r?.status === 404 ? "сервер рейтинга не найден" : r?.status ? `ошибка ${r.status}` : "нет связи с сервером";
            list.innerHTML = `<p class="rate-empty">${r?.status === 0 && r.error === "no_telegram" ? "Рейтинг работает в Telegram — открой игру через бота." : `Рейтинг сейчас недоступен (${why}). Попробуй позже.`}</p>`;
            return;
        }
        const me = r.me || {};
        $("rate-me").textContent = me.rank ? `Ты №${me.rank}` : "Тебя пока нет в рейтинге";
        $("rate-me-sub").textContent = me.rank ? `${n(me.score)} очков · ${stats(me)}` : "Собери карту, победи босса или выполни задание — и попадёшь в таблицу.";
        $("tile-rate-sub").textContent = me.rank ? `Ты №${me.rank} · ${n(me.score)} очков` : "Карты, боссы, задания";
        list.innerHTML = r.top.length ? r.top.map((x) => `<div class="rate-row p${x.rank}${x.id === me.id ? " me" : ""}"><span class="pl">${x.rank}</span><span class="nm"><b></b><span>${stats(x)}</span></span><span class="sc">${n(x.score)}</span></div>`).join("")
            : `<p class="rate-empty">Пока никого — будь первым!</p>`;
        [...list.querySelectorAll(".nm b")].forEach((b, i) => (b.textContent = r.top[i].name)); // имя — текстом, не HTML
        const R = r.rules;
        if (R) $("rate-rules").innerHTML = [["Карта", R.card], ["Мизулина", R.boss[1]], ["Полиция", R.boss[2]], ["Инаков", R.boss[3]], ["Верная табличка (первый раз)", R.sign], ["Место в первой сотне", R.top100],
            ["Записаться на разбор", R.tasks.razbor], ["Анкета Гориллы", R.tasks.anketa], ["Позвать друга", R.tasks.invite], ["Заглянуть в NS Store", R.tasks.store]]
            .map(([t, v]) => `<p><span>${t}</span><b>+${v}</b></p>`).join("");
    }

    // задания рейтинга — кнопками; сделанные помечены
    renderRateTasks() {
        const done = this.p.data.tasksDone || {};
        const box = $("rate-tasks");
        box.innerHTML = "";
        for (const [id, label, pts, go] of [
            ["razbor", "Записаться на разбор", 50, () => this.razbor()],
            ["invite", "Позвать друга", 20, () => { this.task("invite"); tg.share("Бегу «Воронку» — залетай!", LINKS.bot); }],
            ["store", "Заглянуть в NS Store", 10, () => { this.task("store"); this.openStore(); }],
        ]) {
            const b = document.createElement("button");
            b.className = `rate-task${done[id] ? " done" : ""}`;
            b.innerHTML = `<span></span><b>${done[id] ? "✓" : `+${pts}`}</b>`;
            b.firstChild.textContent = label;
            b.onclick = () => { go(); setTimeout(() => this.renderRateTasks(), 300); };
            box.append(b);
        }
    }

    // Чат с менеджером с готовым сообщением: кодовые фразы и код типа клиента (сам тип игроку не показываем)
    managerLink(extra = "") {
        const phrases = this.p.phrases(), weak = this.p.weakType();
        // анкета Гориллы (доход, опыт, капитал, цель) уходит менеджеру вместе с заявкой
        const ak = this.p.data.anketa || {};
        const anketa = Object.keys(ak).length ? ` Анкета: ${GORILLA.anketa.filter((q) => ak[q.id]).map((q) => `${q.q} ${ak[q.id]}`).join("; ")}.` : "";
        const text = `Привет! Я из игры «Покоритель P2P 3.0».${extra ? ` ${extra}` : ""}${phrases.length ? ` Мои кодовые фразы: ${phrases.join(", ")}.` : ""}${weak ? ` Код: ${CLIENT_TYPES[weak].tag}` : ""}${anketa}`;
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
                : st === "now" ? `${fmt(earned)} из ${fmt(c.goal)} USDT, осталось ${fmt(Math.max(0, c.goal - earned))}`
                : `Откроется на ${fmt(from)} USDT`;
            const phrase = !this.game.questions ? "" : st === "done" ? `<p class="ch-phrase">Кодовая фраза <b>${c.phrase}</b></p>` : `<p class="ch-phrase">Кодовая фраза откроется после главы</p>`;
            return `<div class="card chapter st-${st}">
                <span class="ch-n">${String(i + 1).padStart(2, "0")}</span>
                <div class="card-main"><span class="card-tag${st === "now" ? " on" : ""}">${tag}</span><h3>${c.name}</h3><p>${line}</p>
                ${c.place ? `<p class="ch-place">${c.place}</p>` : ""}${c.boss ? `<p class="ch-place">Босс: ${FIGHTERS[c.boss]?.name}${st !== "done" ? " — глава засчитывается победой" : ""}</p>` : ""}${phrase}
                ${st === "locked" ? "" : `<div class="bar"><i style="width:${k * 100}%"></i></div>`}</div></div>`;
        }).join("") + (this.p.phrases().length ? `<div class="card card-note"><div class="card-main"><h3>Кодовые фразы</h3>
            <p>Назови их менеджеру отдела продаж — он подберёт, что тебе подойдёт.</p><button class="btn-small" id="btn-manager">Написать менеджеру →</button></div></div>` : "") + (ch.done ? `<div class="card card-note"><div class="card-main"><h3>Сезон 1 пройден</h3><p>Все главы открыты. Новые — в следующем сезоне.</p></div></div>` : "");
        const mb = $("btn-manager");
        if (mb) mb.onclick = () => this.razbor();
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
                    : st === "buy" ? (HERO_UNLOCKS[c.id]?.btn || "Закрыт") : st === "locked" ? "На связи" : "Скоро";
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
        const u = HERO_UNLOCKS[c.id];
        const skill = HERO_SKILLS[c.id];
        const text = c.soon ? "Появится в следующих главах" : st === "locked" ? `${c.locked}. Сыграть за него нельзя`
            : `${HERO_PERKS[c.id]?.text ?? ""}${skill ? `. Умение «${skill.name}»: ${skill.text.toLowerCase()} (раз за забег)` : ""}`;
        const trial = this.p.trialHero() === c.id ? Math.ceil((this.p.data.trial.until - Date.now()) / 36e5) : 0;
        box.innerHTML = `<p class="label">${trial ? `На пробу · ещё ${trial} ч` : on ? "В забеге" : st === "play" ? "В команде" : st === "buy" ? "Открывается действием" : st === "locked" ? "На связи" : "Скоро"}</p>
            <h3>${c.name}</h3><p class="perk">${text}</p>
            ${st === "buy" && u ? `<div class="lock-row"><span>${u.text}</span>${u.act === "boss" ? `<b>${Math.min(this.p.data.beaten || 0, u.chapter)}/${u.chapter}</b>` : ""}</div>` : ""}`;
        const b = document.createElement("button");
        b.className = "btn btn-main";
        if (st === "play") {
            b.textContent = on ? "Выбран" : "Выбрать";
            b.disabled = on;
            b.onclick = () => { this.game.selectHero(c.id); this.render(); };
        } else if (st === "buy" && u) { // открыть действием (shop_v6): подписка, приглашение, разбор; босс — в забеге
            b.textContent = u.btn;
            b.disabled = u.act === "boss";
            b.onclick = () => {
                if (u.act === "subscribe") { this.task("store"); tg.open(NS_STORE_URL); }
                else if (u.act === "invite") { this.task("invite"); tg.share("Бегу «Воронку» — залетай!", LINKS.bot); }
                else if (u.act === "razbor") this.razbor();
                // проверить подписку и приглашение из мини-аппа нельзя — открываем после действия
                setTimeout(() => {
                    if (!this.p.unlockHero(c.id)) return;
                    this.game.audio.play("buy");
                    this.toast(`${c.name} в команде!`);
                    this.game.selectHero(c.id);
                    this.render();
                }, 800);
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
        // предупреждение: в магазине всё игровое, настоящее — только через кнопку заказа в @Nesuschiystore
        const warn = (t, p) => {
            const n = document.createElement("div");
            n.className = "card card-note card-warn";
            n.innerHTML = `<span class="warn-ico">!</span><div class="card-main"><span class="card-tag">Важно</span><h3>${t}</h3><p>${p}</p></div>`;
            box.append(n);
        };
        if (this.seg === "boosts") {
            this.spinShelves();
            warn("Бусты — игровые", "Покупаются за игровую валюту и работают только в игре. Настоящие добавки можно купить в @Nesuschiystore — кнопка <b>«Заказать настоящие»</b>.");
            const head = (t, p) => {
                const n = document.createElement("div");
                n.className = "card card-note";
                n.innerHTML = `<div class="card-main"><h3>${t}</h3><p>${p}</p></div>`;
                box.append(n);
            };
            head("Горилла-кладовщик", `«Бегать на голодный организм — это к Мизулиной. Затарься.» Бусты — за монеты. В забеге они справа кнопками: нажал — сработал, до ${BOOST_LIMIT} за забег.`);
            for (const it of BOOSTS) {
                const have = this.p.data.next[it.id] || 0;
                box.append(this.storeCard(it, have ? `На следующие забеги: ${have}` : "", this.priceButton({ coins: it.price }, () => {
                    this.p.addBoost(it.id);
                    this.toast("Взял! В забеге нажми на буст справа.");
                })));
            }
            // «За Карты» (economy_v7): редкая валюта с девушек у края дороги, срабатывает сама в следующем забеге
            head(`<img class="ico-card" src="img/card.svg?v=2" alt=""> За Карты · у тебя ${this.p.cards}`, this.p.cards ? "Покупка срабатывает сама в следующем забеге. Обмена на USDT нет."
                : "Карты выдают девушки на обочине. Пробегай рядом — и забирай");
            const perks = (this.p.data.cardPerks ||= {});
            for (const c of CARD_SHOP) {
                const b = document.createElement("button");
                b.className = "btn-small btn-card";
                b.innerHTML = `<img class="ico-card" src="img/card.svg?v=2" alt=""> ${c.cards}`;
                b.onclick = async () => {
                    if (this.p.cards < c.cards) return this.toast(`Нужно ещё ${c.cards - this.p.cards} Карт`);
                    if (b.disabled) return;
                    b.disabled = true;
                    const r = await prize.cardBuy(c.srv); // цену и баланс решает сервер; не ответил — покупка локально
                    b.disabled = false;
                    if (r?.status === 402) return this.toast(`Нужно ещё ${c.cards - (r.cards || 0)} Карт`);
                    if (r?.status === 200) { this.p.setCards(r.cards); this.p.data.cardPerksSrv = r.perks || {}; } // перк хранит сервер
                    else { this.p.payCards(c.cards); perks[c.id] = (perks[c.id] || 0) + 1; }
                    this.p.save();
                    this.game.audio.play("buy");
                    this.toast(`${c.name} — в следующем забеге`);
                    this.render();
                };
                const sc = this.storeCard({ name: c.name, text: c.text, art: "img/card_art.svg?v=2" }, (prize.online ? this.p.data.cardPerksSrv?.[c.srv] : perks[c.id]) ? `На следующие забеги: ${prize.online ? this.p.data.cardPerksSrv[c.srv] : perks[c.id]}` : "", b);
                sc.querySelector(".btn-real")?.remove(); // настоящих «Карт» в магазине нет
                box.append(sc);
            }
        } else if (this.seg === "sets") {
            warn("Наборы — игровые", "Только для игры: открываются за игровую валюту и действия в игре, а не за настоящие деньги. Настоящий набор можно купить в @Nesuschiystore — кнопка <b>«Заказать настоящий набор»</b>.");
            const n = document.createElement("div");
            n.className = "card card-note";
            n.innerHTML = `<div class="card-main"><h3>Как открыть</h3><p>Экзамен у Инакова, кодовое слово от менеджера, 7 дней входа подряд. Набор — бусты на ${SET_RUNS} забега.</p></div>`;
            box.append(n);
            for (const st of SETS) {
                const owned = this.p.hasSet(st.id);
                const card = this.storeCard({ ...st, text: `${st.text}. ${owned ? "Открыт" : st.how}` }, "", Object.assign(document.createElement("button"), { className: "btn-small" + (owned ? " is-on" : ""), textContent: owned ? "Есть" : "Закрыт", disabled: true }), "Заказать настоящий набор");
                if (!owned && st.unlock === "code") {
                    const row = document.createElement("div");
                    row.className = "set-code";
                    row.innerHTML = `<input placeholder="Кодовое слово" maxlength="32"><button class="btn-small">Ввести</button>`;
                    row.querySelector("button").onclick = () => {
                        const v = row.querySelector("input").value.trim().toUpperCase().replace(/Ё/g, "Е");
                        if (!(st.codes || []).includes(v)) return this.toast("Не то слово. Спроси у менеджера");
                        this.p.unlockSet(st.id);
                        this.game.audio.play("buy");
                        this.toast(`${st.name} — открыт!`);
                        this.render();
                    };
                    card.append(row);
                }
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
    storeCard(it, have, priceBtn, realText = "Заказать настоящие") {
        const card = document.createElement("div");
        card.className = "card card-store";
        card.innerHTML = `${it.art ? `<img class="store-art" src="${it.art}" alt="" loading="lazy">` : ""}<div class="card-main"><h3>${it.name}</h3><p>${it.text}</p>${it.line ? `<p class="store-line">${it.line}</p>` : ""}${have ? `<span class="have">${have}</span>` : ""}</div>`;
        const acts = document.createElement("div");
        acts.className = "store-acts";
        const real = document.createElement("button");
        real.className = "btn-small btn-real";
        real.textContent = realText;
        real.onclick = () => this.openStore();
        acts.append(priceBtn, real);
        card.append(acts);
        if (it.photos?.length) card.prepend(this.shelf(it.photos));
        return card;
    }

    // витрина настоящих банок: по кругу выезжает следующая, по нажатию — сразу
    shelf(photos) {
        const box = document.createElement("div");
        box.className = "shelf";
        box.innerHTML = photos.map(([f, name]) => `<img src="img/shop/bady/${f}.webp?v=3" alt="${name}" loading="lazy" draggable="false">`).join("") + '<span class="shelf-name"></span>';
        box.dataset.i = "0";
        box.onclick = () => this.turnShelf(box, 1);
        this.turnShelf(box, 0);
        return box;
    }

    turnShelf(box, step) {
        const imgs = box.querySelectorAll("img"), n = imgs.length;
        const i = (Number(box.dataset.i) + step + n) % n;
        box.dataset.i = String(i);
        imgs.forEach((img, k) => {
            let d = k - i;
            if (d > n / 2) d -= n;
            if (d < -n / 2) d += n;
            img.dataset.pos = Math.abs(d) > 1 ? "far" : String(d);
        });
        box.querySelector(".shelf-name").textContent = imgs[i].alt;
    }

    // пока открыт магазин — витрины крутятся сами (одна таймерная функция на все)
    spinShelves() {
        clearInterval(this.shelfTimer);
        this.shelfTimer = setInterval(() => {
            if (this.current !== "shop" || document.hidden) return;
            for (const b of document.querySelectorAll("#shop-list .shelf")) if (b.querySelectorAll("img").length > 1) this.turnShelf(b, 1);
        }, 2600);
    }

    openStore() {
        this.task("store");
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
        const b = document.createElement("button");
        b.className = "btn-small";
        b.innerHTML = `${ICON.usdt} ${fmt(price.usdt)}`;
        const enough = this.p.usdt >= price.usdt;
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
                    <span class="card-tag on">${c.free ? "Бесплатно" : "За USDT"}</span>
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
                btn = this.priceButton({ usdt: c.price }, () => this.open(c));
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

    // тип награды → иконка. USDT — по сумме: монета / стопка / мешок
    kind(d) {
        if (d.cards) return "cards";
        if (d.level) return d.maxed ? "usdt_m" : "level";
        if (d.all) return "all";
        if (d.boosts) return d.boost ? "boost:" + d.boost : "boost";
        const a = d.amount || (d.usdt ? d.usdt[1] : 0);
        return a >= USDT_TIERS.xl ? "usdt_xl" : a >= USDT_TIERS.l ? "usdt_l" : a >= USDT_TIERS.m ? "usdt_m" : "usdt_s";
    }

    itemIcon(k) {
        // картинки наград (img/cases/items) могут быть ещё не загружены — тогда монета-заглушка вместо битой иконки
        const img = (src, cls = "item-ico") => `<img class="${cls}" src="${src}" alt="" draggable="false" onerror="this.outerHTML='<span class=&quot;${cls} ico-fallback&quot;>₮</span>'">`;
        if (k === "all") { // монета + веер баночек (Тестобустер, Холин)
            const j = (id) => BOOSTS.find((b) => b.id === id)?.art;
            return `<span class="item-ico ico-all">${img(j("berserk"), "j j1")}${img(j("fokus"), "j j2")}${img(CASE_ITEM_ART.usdt_s, "c")}</span>`;
        }
        if (k === "cards") return img("img/card_art.svg?v=2");
        if (k.startsWith("boost")) {
            const b = BOOSTS.find((x) => x.id === k.split(":")[1]);
            return b ? img(b.art) : `<span class="item-ico ico-all ico-boosts">${img(BOOSTS[0].art, "j j1")}${img(BOOSTS[4].art, "j j2")}</span>`;
        }
        return img(CASE_ITEM_ART[k] || CASE_ITEM_ART.usdt_s);
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
        // одна добавка — выбираем сразу, чтобы в ленте была её картинка
        return { ...d, amount: d.usdt ? rnd(d.usdt[0], d.usdt[1]) : 0, cardsN: Array.isArray(d.cards) ? rnd(d.cards[0], d.cards[1]) : d.cards || 0,
            boost: d.boosts === 1 ? pick(BOOSTS).id : null, ...this.rollLevel(d) };
    }

    // уровень прокачки — тоже сразу: на максимуме в ленте «3 000 USDT / вместо уровня»
    rollLevel(d) {
        if (!d.level) return {};
        const id = pick(Object.keys(UPGRADES));
        return { up: id, maxed: this.p.level(id) >= UPGRADES[id].times.length };
    }

    // подписи — две строки (captions.md), тысячи через неразрывный пробел
    lines(d) {
        const n = (x) => `${String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0")}\u00a0USDT`;
        const sum = d.amount || (d.usdt ? d.usdt[1] : 0);
        if (d.cards) { const c = d.cardsN ?? (Array.isArray(d.cards) ? d.cards[1] : d.cards); return [`+${c} ${c === 1 ? "Карта" : "Карты"}`, "редкая валюта"]; }
        if (d.level) return d.maxed ? [n(3000), "вместо уровня"] : ["+1 уровень", "прокачки"];
        if (d.all) return [n(sum), "+ все бусты"];
        if (d.boosts) { const b = d.boost && BOOSTS.find((x) => x.id === d.boost); return b ? [b.name, "добавка"] : [`${d.boosts} добавки`, "случайные"]; }
        return [n(sum), d.sub || ""];
    }

    label(d, html = false) {
        const [a, b] = this.lines(d);
        return html ? (b ? `${a}<br><small>${b}</small>` : a) : [a, b].filter(Boolean).join(" ");
    }

    cellHtml(d) {
        return `<div class="cell" style="--rc:${RARITY[d.r].color}">${this.itemIcon(this.kind(d))}<span>${this.label(d, true)}</span></div>`;
    }

    // Открытие: кейс трясётся (1.2 с) → вспышка → лента крутится 4.2 с → выигрыш подсвечивается, всплывает приз
    open(c) {
        const WIN = 34, CELL = 132, W = 120; // ширина ячейки + промежуток, ширина ячейки
        const items = Array.from({ length: WIN + 6 }, () => this.roll(c));
        const win = items[WIN];
        // приз — сразу в кошелёк: закрыли приложение посреди анимации — он уже начислен
        const text = this.give(win, c);
        const co = $("co");
        co.style.setProperty("--cc", c.color);
        co.className = "co s-intro";
        co.dataset.case = c.id;
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
            $("case-label").textContent = RARITY_TITLE[win.r];
            $("co-prize").innerHTML = `<div class="prize">${this.itemIcon(this.kind(win))}<b>${this.label(win, true)}</b><span>${RARITY[win.r].name}</span>
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

    give(d, c) {
        if (d.amount) this.p.gift(d.amount);
        if (d.cardsN) { // карты из кейса — в Telegram начисляет сервер (openId один раз, лимит в сутки)
            if (prize.online) {
                const openId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
                prize.caseCard(c?.id, openId, d.cardsN).then((r) => { if (typeof r?.cards === "number") { this.p.setCards(r.cards); this.render?.(); } else if (r?.status !== 403) this.p.addCards(d.cardsN); });
            } else this.p.addCards(d.cardsN);
        }
        const got = [];
        if (d.boosts) for (let i = 0; i < d.boosts; i++) { const b = (d.boost && BOOSTS.find((x) => x.id === d.boost)) || pick(BOOSTS); this.p.addBoost(b.id); if (!d.boost) got.push(b.name); }
        if (d.all) for (const b of BOOSTS) this.p.addBoost(b.id);
        if (d.level) {
            const id = d.up || pick(Object.keys(UPGRADES));
            if (this.p.levelUp(id)) got.push(`${UPGRADES[id].name}: уровень ${this.p.level(id)}`);
            else { this.p.gift(3000); got.push("прокачка уже на максимуме — 3 000 USDT"); }
        }
        return [this.label(d), got.length ? `(${got.join(", ")})` : ""].join(" ");
    }
}
