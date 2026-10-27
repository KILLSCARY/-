// Профиль игрока: кошелёк (USDT, TRX), всё заработанное (по нему идут главы), купленные герои,
// добавки на следующий забег, прокачка, когда открывался бесплатный конверт. Хранится через tg.js.

import { CHAPTERS, HERO_PRICES, HERO_GEM_PRICES, BOOSTS, BOOST_LIMIT, UPGRADES, BOSS, GRANTS } from "./config.js";
import { tg } from "./tg.js";

const EMPTY = () => ({
    usdt: 0, trx: 0, earned: 0,
    heroes: [],                                   // выкупленные (бесплатные в список не пишутся)
    next: Object.fromEntries(BOOSTS.map((b) => [b.id, 0])), // добавки, купленные на следующие забеги
    up: Object.fromEntries(Object.keys(UPGRADES).map((k) => [k, 1])), // уровни прокачки
    freeAt: 0,                                    // когда последний раз открыт бесплатный кейс
    gems: 0,                                      // кристаллы
    chests: 0,                                    // сундуки Инакова (бесплатное открытие кейса)
    packs: [],                                    // купленные разовые паки кристаллов
    daily: { day: 0, last: "" },                  // ежедневный вход: день серии, дата последней награды
    trial: null,                                  // герой на пробу: { id, until }
});

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

    // разовые начисления из GRANTS, которых этот аккаунт ещё не получал; возвращает выданные
    applyGrants() {
        const got = (this.data.grants ||= []);
        const fresh = GRANTS.filter((g) => !got.includes(g.id));
        for (const g of fresh) {
            this.data.usdt += g.usdt || 0;
            this.data.trx += g.trx || 0;
            this.data.gems = this.gems + (g.gems || 0);
            got.push(g.id);
        }
        if (fresh.length) this.save();
        return fresh;
    }

    load(saved) {
        if (saved) this.data = { ...EMPTY(), ...saved, next: { ...EMPTY().next, ...saved.next }, up: { ...EMPTY().up, ...saved.up } };
    }

    // перенести изменения этой сессии (было → стало) на профиль из облака
    carry(was, now) {
        if (now.t === was.t) return;
        const d = this.data;
        for (const k of ["usdt", "trx", "earned", "gems", "chests"]) d[k] = Math.max(0, (d[k] || 0) + (now[k] || 0) - (was[k] || 0));
        for (const id of Object.keys(d.next)) d.next[id] = Math.max(0, d.next[id] + (now.next[id] || 0) - (was.next[id] || 0));
        for (const id of Object.keys(d.up)) d.up[id] = Math.max(d.up[id], now.up[id] || 1);
        d.heroes = [...new Set([...d.heroes, ...now.heroes])];
        d.freeAt = Math.max(d.freeAt || 0, now.freeAt || 0);
    }

    save() {
        this.data.t = Date.now();
        tg.saveProfile(this.data, { cloud: this.synced });
    }

    get usdt() { return this.data.usdt; }
    get trx() { return this.data.trx; }
    get gems() { return this.data.gems || 0; }

    addGems(n) {
        this.data.gems = this.gems + n;
        this.save();
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

    // доход: в кошелёк и в «заработано за всё время»; возвращает номер главы, если открылась новая
    earn(usdt, trx = 0) {
        const before = this.chapter().index;
        this.data.usdt += usdt;
        this.data.earned += usdt;
        this.data.trx += trx;
        this.save();
        const after = this.chapter().index;
        return after > before ? after : null;
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
        const list = CHAPTERS.slice(0, this.chapter().index).map((c) => c.phrase).filter(Boolean);
        if (this.data.exam) list.push(BOSS.phrase);
        return list;
    }

    // награда из кейса: в кошелёк, но не в «заработано» — главы двигают только забеги
    gift(usdt = 0, trx = 0) {
        this.data.usdt += usdt;
        this.data.trx += trx;
        this.save();
    }

    // списать цену; false — не хватает
    pay({ usdt = 0, trx = 0, gems = 0 }) {
        if (this.data.usdt < usdt || this.data.trx < trx || this.gems < gems) return false;
        this.data.usdt -= usdt;
        this.data.trx -= trx;
        this.data.gems = this.gems - gems;
        this.save();
        return true;
    }

    // текущая глава: index (0…), прогресс до её цели; после последней — финал
    chapter() {
        const e = this.data.earned;
        let index = CHAPTERS.findIndex((c) => e < c.goal);
        if (index < 0) index = CHAPTERS.length;
        const goal = CHAPTERS[Math.min(index, CHAPTERS.length - 1)].goal;
        return { index, name: CHAPTERS[Math.min(index, CHAPTERS.length - 1)].name, earned: e, goal, done: index >= CHAPTERS.length };
    }

    owns(heroId) {
        if (this.trialHero() === heroId) return true;
        return !(heroId in HERO_PRICES) || this.data.heroes.includes(heroId);
    }

    // выкуп за USDT или за кристаллы (gems: true — цена из HERO_GEM_PRICES)
    buyHero(heroId, gems = false) {
        if (this.data.heroes.includes(heroId) || !(heroId in HERO_PRICES)) return false;
        if (!this.pay(gems ? { gems: HERO_GEM_PRICES[heroId] } : { usdt: HERO_PRICES[heroId] })) return false;
        this.data.heroes.push(heroId);
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
