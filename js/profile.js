// Профиль игрока: кошелёк (USDT; старые TRX пересчитаны ×300 при загрузке), всё заработанное (по нему идут главы), купленные герои,
// добавки на следующий забег, прокачка, когда открывался бесплатный конверт. Хранится через tg.js.

import { CHAPTERS, HERO_UNLOCKS, SETS, BOOSTS, BOOST_LIMIT, UPGRADES, GRANTS, GORILLA_BONUS, BETA_ALL_HEROES } from "./config.js";
// TRX, выданные бесплатно прежними начислениями (строки из GRANTS уже убраны): при пересчёте TRX → USDT не считаем
const GIFT_TRX = { "test-2026-10-28": 10000 };
import { tg } from "./tg.js";

const EMPTY = () => ({
    usdt: 0, trx: 0, earned: 0, cards: 0, cardPerks: {}, // cards — «Карты» (js/cards.js); cardPerks — купленное за Карты на следующий забег
    heroes: [],                                   // выкупленные (бесплатные в список не пишутся)
    next: Object.fromEntries(BOOSTS.map((b) => [b.id, 0])), // добавки, купленные на следующие забеги
    up: Object.fromEntries(Object.keys(UPGRADES).map((k) => [k, 1])), // уровни прокачки
    freeAt: 0,                                    // когда последний раз открыт бесплатный кейс
    chests: 0,                                    // сундуки за боссов (бесплатное открытие кейса)
    story: 0,                                     // сколько сюжетов пройдено (бой 1 на 1)
    beaten: null,                                 // сколько боссов глав побеждено (null — старый профиль, см. load)
    sets: [],                                     // открытые наборы (действуют SET_RUNS забегов, выдаются один раз)
    daily: { day: 0, last: "" },                  // ежедневный вход: день серии, дата последней награды
    guideVersion: 0,                             // просмотрен или пропущен комикс Гориллы
    trial: null,                                  // герой на пробу: { id, until }
});

// В прежней версии было шесть глав; сюжетные победы уже хранились отдельно от их числа.
function migrateStory(d) {
    if (d.storyVersion === 2) return;
    const oldPhrases = ["ПЕРВЫЙ ШАГ", "ИНВЕСТИЦИЯ", "Я СМОГУ", "СЕЙЧАС", "СИСТЕМА", "ВОРОНКА ПРОЙДЕНА"];
    const count = Math.max(0, Math.min(6, Number(d.beaten) || 0));
    d.legacyPhrases = [...new Set([...(d.legacyPhrases || []), ...oldPhrases.slice(0, count)])];
    const won = Math.min(3, Math.max(0, Number(d.story) || 0, d.mizBeaten ? 1 : 0, d.exam ? 3 : 0));
    d.story = won;
    d.beaten = won;
    d.storyVersion = 2;
}

export class Profile {
    constructor() {
        this.data = EMPTY();
        this.load(tg.localProfile());
        // Пока облачная копия не прочитана, сохраняем только в телефон. Облако свежее того, с чем мы стартовали, —
        // берём его, но то, что игрок успел заработать и купить за это время, переносим поверх.
        this.synced = false;
        const start = JSON.parse(JSON.stringify(this.data)); // не structuredClone: его нет в старых WebView iOS
        this.ready = tg.cloudProfile().then((cloud) => {
            this.synced = true;
            if ((cloud?.t || 0) > (start.t || 0)) {
                const mine = this.data;
                this.load(cloud);
                this.carry(start, mine);
            }
            if (this.data.t !== cloud?.t) this.save();
            // разовые начисления — только после облака: отметка о выданном могла прийти оттуда (другой телефон)
            this.granted = this.applyGrants();
        });
    }

    // разовые начисления из GRANTS, которых этот аккаунт ещё не получал; возвращает выданные. Валюта одна — USDT
    // (trx и gems у старых начислений — только для истории, см. load)
    applyGrants() {
        const got = (this.data.grants ||= []);
        const fresh = GRANTS.filter((g) => !got.includes(g.id));
        for (const g of fresh) {
            this.data.usdt += g.usdt || 0;
            got.push(g.id);
        }
        if (fresh.length) this.save();
        return fresh;
    }

    load(saved) { // пересчёт TRX → USDT разовый: после него trx = 0 и уходит в облако
        if (saved) this.data = { ...EMPTY(), ...saved, next: { ...EMPTY().next, ...saved.next }, up: { ...EMPTY().up, ...saved.up } };
        // TRX больше нет — остаток в USDT по ×300. Подарочные TRX тестового начисления (GIFT_TRX) не считаем:
        // иначе 10 000 тестовых TRX превратились бы ещё в 3 000 000 USDT
        if (this.data.trx > 0) {
            const gifted = (this.data.grants || []).reduce((s, id) => s + (GIFT_TRX[id] || 0), 0);
            this.data.usdt += Math.max(0, this.data.trx - gifted) * 300;
            this.data.trx = 0;
        }
        migrateStory(this.data);
    }

    // Переносим локальные изменения поверх более свежего облачного профиля.
    // Не теряем сюжет, анкету, ежедневную награду и проверки действий при слиянии.
    carry(was, now) {
        if (now.t === was.t) return;
        migrateStory(now);
        const d = this.data;
        d.beaten = Math.max(d.beaten || 0, now.beaten || 0);
        d.story = Math.max(d.story || 0, now.story || 0);
        d.exam = !!(d.exam || now.exam);
        d.guideVersion = Math.max(d.guideVersion || 0, now.guideVersion || 0);
        d.sets = [...new Set([...(d.sets || []), ...(now.sets || [])])];
        d.grants = [...new Set([...(d.grants || []), ...(now.grants || [])])];
        d.legacyPhrases = [...new Set([...(d.legacyPhrases || []), ...(now.legacyPhrases || [])])];
        d.storyIntros = { ...(d.storyIntros || {}), ...(now.storyIntros || {}) };
        for (const k of ["usdt", "earned", "chests", "cards", "x2runs"]) {
            d[k] = Math.max(0, (d[k] || 0) + (now[k] || 0) - (was[k] || 0));
        }
        for (const id of Object.keys(d.next)) {
            d.next[id] = Math.max(0, (d.next[id] || 0) + (now.next?.[id] || 0) - (was.next?.[id] || 0));
        }
        for (const id of Object.keys(d.up)) d.up[id] = Math.max(d.up[id] || 1, now.up?.[id] || 1);
        d.heroes = [...new Set([...(d.heroes || []), ...(now.heroes || [])])];
        d.freeAt = Math.max(d.freeAt || 0, now.freeAt || 0);
        for (const k of ["tasksDone", "checked", "tried"]) {
            d[k] = { ...(d[k] || {}) };
            for (const [id, value] of Object.entries(now[k] || {})) if (value) d[k][id] = value;
        }
        d.anketa = { ...(d.anketa || {}) };
        for (const [key, value] of Object.entries(now.anketa || {})) {
            // Не перезаписываем более свежий ответ из облака значением, которое уже было в локальном снимке.
            if (JSON.stringify(value) !== JSON.stringify(was.anketa?.[key])) d.anketa[key] = value;
        }
        d.walls = { ...(d.walls || {}) };
        for (const [type, stats] of Object.entries(now.walls || {})) {
            const before = was.walls?.[type] || { ok: 0, fail: 0 };
            const target = (d.walls[type] ||= { ok: 0, fail: 0 });
            target.ok = Math.max(0, target.ok || 0) + Math.max(0, (stats.ok || 0) - (before.ok || 0));
            target.fail = Math.max(0, target.fail || 0) + Math.max(0, (stats.fail || 0) - (before.fail || 0));
        }
        const nowDay = Date.parse(now.daily?.last || "");
        const cloudDay = Date.parse(d.daily?.last || "");
        if (Number.isFinite(nowDay) && (!Number.isFinite(cloudDay) || nowDay > cloudDay)) {
            d.daily = { ...now.daily };
        } else if (Number.isFinite(nowDay) && nowDay === cloudDay) {
            d.daily = { ...d.daily, day: Math.max(d.daily?.day || 0, now.daily?.day || 0) };
        }
        if (now.trial?.until > (d.trial?.until || 0)) d.trial = { ...now.trial };
        if (now.leadContact && now.leadContact !== was.leadContact) d.leadContact = now.leadContact;
    }

    save() {
        this.data.t = Date.now();
        tg.saveProfile(this.data, { cloud: this.synced });
    }

    get usdt() { return this.data.usdt; }
    get cards() { return this.data.cards || 0; }
    addCards(n) { this.data.cards = Math.max(0, (this.data.cards || 0) + n); this.save(); }
    setCards(n) { this.data.cards = Math.max(0, n | 0); this.save(); }
    payCards(n) { if (this.cards < n) return false; this.data.cards -= n; this.save(); return true; }

    // открыть набор: кладём его бусты в запас (SET_RUNS забегов) — один раз на профиль
    unlockSet(id) {
        const st = SETS.find((x) => x.id === id);
        if (!st || (this.data.sets ||= []).includes(id)) return false;
        this.data.sets.push(id);
        for (const [b, n] of Object.entries(st.give || {})) this.data.next[b] = (this.data.next[b] || 0) + n;
        if (st.x2runs) this.data.x2runs = (this.data.x2runs || 0) + st.x2runs;
        this.save();
        return true;
    }
    hasSet(id) { return (this.data.sets || []).includes(id); }

    // победа над боссом текущей главы: глава засчитана
    beatBoss() {
        const i = this.chapter().index;
        if (i >= CHAPTERS.length) return null;
        this.data.beaten = i + 1;
        this.data.chests = (this.data.chests || 0) + 1;
        if (CHAPTERS[i].final) this.unlockSet("gberserk");
        for (const [id, u] of Object.entries(HERO_UNLOCKS)) if (u.act === "boss" && this.data.beaten >= u.chapter && !this.data.heroes.includes(id)) this.data.heroes.push(id);
        this.save();
        return i + 1;
    }
    // босс главы ждёт: цель главы набрана, а босс не побеждён
    bossReady() {
        const ch = this.chapter();
        return !ch.done && this.data.earned >= ch.goal;
    }

    // ежедневный вход: какой сегодня день серии и забрана ли награда
    dailyState() {
        const today = new Date().toDateString();
        const d = this.data.daily || { day: 0, last: "" };
        const yesterday = new Date(Date.now() - 864e5).toDateString();
        const day = d.last === today ? d.day : d.last === yesterday ? d.day % 7 + 1 : 1;
        return { day, claimed: d.last === today };
    }

    claimDaily() {
        const st = this.dailyState();
        if (st.claimed) return null;
        this.data.daily = { day: st.day, last: new Date().toDateString() };
        this.save();
        return st.day;
    }

    // герой на пробу (7-й день входа): считается выкупленным до until
    trialHero() {
        const t = this.data.trial;
        return t && t.until > Date.now() ? t.id : null;
    }

    // доход: в кошелёк и в «заработано за всё время». Глава засчитывается по цели (beatBoss).
    earn(usdt) {
        this.data.usdt += usdt;
        this.data.earned += usdt;
        // боссов глав больше нет: глава засчитывается, как только набрана её цель (финал — победой в сюжете)
        let ch = this.chapter(), done = null;
        // глава с боссом (CHAPTERS[].boss) засчитывается только победой в бою — сумма её не закрывает
        while (!ch.done && !CHAPTERS[ch.index].final && !CHAPTERS[ch.index].boss && this.data.earned >= ch.goal) { done = this.beatBoss(); ch = this.chapter(); }
        this.save();
        return done;
    }

    // стены-возражения: верные и неверные ответы по типам клиентов за всё время
    addWallStats(run) {
        const all = (this.data.walls ||= {});
        for (const [type, s] of Object.entries(run)) {
            const t = (all[type] ||= { ok: 0, fail: 0 });
            t.ok += s.ok;
            t.fail += s.fail;
        }
        if (Object.keys(run).length) this.save();
    }

    // тип клиента, на чьих стенах игрок ошибается чаще всего (доля ошибок); null — ошибок нет
    weakType() {
        let best = null, worst = 0;
        for (const [type, s] of Object.entries(this.data.walls || {})) {
            if (type === "common" || !s.fail) continue;
            const k = s.fail / (s.ok + s.fail);
            if (k > worst) { worst = k; best = type; }
        }
        return best;
    }

    // кодовые фразы пройденных глав
    phrases() {
        const list = [...new Set([...(this.data.legacyPhrases || []), ...CHAPTERS.slice(0, this.chapter().index).map((c) => c.phrase).filter(Boolean)])];
        // старый экзамен (до боссов глав) сдан — его кодовое слово то же, что у финала
        const exam = CHAPTERS.find((c) => c.final)?.phrase;
        if (this.data.exam && exam && !list.includes(exam)) list.push(exam);
        return list;
    }

    // награда из кейса: в кошелёк, но не в «заработано» — главы двигают только забеги
    gift(usdt = 0) {
        this.data.usdt += usdt;
        this.save();
    }

    // списать цену; false — не хватает
    pay({ usdt = 0 }) {
        if (this.data.usdt < usdt) return false;
        this.data.usdt -= usdt;
        this.save();
        return true;
    }

    // текущая глава: index (0…), прогресс до её цели; после последней — финал
    chapter() {
        const e = this.data.earned;
        const index = Math.min(CHAPTERS.length, this.data.beaten || 0);
        const goal = CHAPTERS[Math.min(index, CHAPTERS.length - 1)].goal;
        return { index, name: CHAPTERS[Math.min(index, CHAPTERS.length - 1)].name, earned: e, goal, done: index >= CHAPTERS.length };
    }

    owns(heroId) {
        if ((BETA_ALL_HEROES && !HERO_UNLOCKS[heroId]?.exclusive) || this.trialHero() === heroId) return true; // эксклюзивы — только покупкой
        return !(heroId in HERO_UNLOCKS) || this.data.heroes.includes(heroId);
    }

    // открыть героя действием (подписка, приглашение, разбор); за босса — сам в beatBoss
    unlockHero(heroId) {
        const u = HERO_UNLOCKS[heroId];
        if (!u || this.data.heroes.includes(heroId) || u.act === "boss" || u.act === "all") return false;
        this.data.heroes.push(heroId);
        this.save();
        return true;
    }

    // бонусный герой Горилла: что из списка уже сделано (подписку и друга засчитывает сервер — data.checked)
    bonusSteps() {
        const d = this.data, t = d.tasksDone || {}, c = d.checked || {};
        const done = { story: !!d.exam, razbor: !!t.razbor, anketa: !!t.anketa, store: !!c.store, invite: !!c.invite };
        return GORILLA_BONUS.map((x) => ({ ...x, done: done[x.id] }));
    }

    // всё сделано — Горилла в команде. true — только что открыт (показать тост)
    bonusCheck() {
        if (this.data.heroes.includes("gorilla") || !this.bonusSteps().every((x) => x.done)) return false;
        this.data.heroes.push("gorilla");
        this.save();
        return true;
    }

    // забрать добавки на этот забег: по одной каждой купленной
    takeBoosts() {
        const taken = [];
        for (const b of BOOSTS) if (taken.length < BOOST_LIMIT && this.data.next[b.id] > 0) { this.data.next[b.id]--; taken.push(b); }
        if (taken.length) this.save();
        return taken;
    }

    addBoost(id, n = 1) {
        this.data.next[id] = (this.data.next[id] || 0) + n;
        this.save();
    }

    level(id) { return this.data.up[id] || 1; }

    levelUp(id) {
        const u = UPGRADES[id], lvl = this.level(id);
        if (lvl >= u.times.length) return false;
        this.data.up[id] = lvl + 1;
        this.save();
        return true;
    }
}
