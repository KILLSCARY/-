// Профиль игрока: кошелёк (USDT, TRX), всё заработанное (по нему идут главы), купленные герои,
// добавки на следующий забег, прокачка, когда открывался бесплатный конверт. Хранится через tg.js.

import { CHAPTERS, HERO_PRICES, BOOSTS, UPGRADES } from "./config.js";
import { tg } from "./tg.js";

const EMPTY = () => ({
    usdt: 0, trx: 0, earned: 0,
    heroes: [],                                   // выкупленные (бесплатные в список не пишутся)
    next: Object.fromEntries(BOOSTS.map((b) => [b.id, 0])), // добавки, купленные на следующие забеги
    up: Object.fromEntries(Object.keys(UPGRADES).map((k) => [k, 1])), // уровни прокачки
    freeAt: 0,                                    // когда последний раз открыт бесплатный кейс
});

export class Profile {
    constructor() {
        this.data = EMPTY();
        this.load(tg.localProfile());
        this.ready = tg.cloudProfile().then((cloud) => {
            if ((cloud?.t || 0) > (this.data.t || 0)) this.load(cloud);
        });
    }

    load(saved) {
        if (saved) this.data = { ...EMPTY(), ...saved, next: { ...EMPTY().next, ...saved.next }, up: { ...EMPTY().up, ...saved.up } };
    }

    save() {
        this.data.t = Date.now();
        tg.saveProfile(this.data);
    }

    get usdt() { return this.data.usdt; }
    get trx() { return this.data.trx; }

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

    // награда из кейса: в кошелёк, но не в «заработано» — главы двигают только забеги
    gift(usdt = 0, trx = 0) {
        this.data.usdt += usdt;
        this.data.trx += trx;
        this.save();
    }

    // списать цену; false — не хватает
    pay({ usdt = 0, trx = 0 }) {
        if (this.data.usdt < usdt || this.data.trx < trx) return false;
        this.data.usdt -= usdt;
        this.data.trx -= trx;
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
        return !(heroId in HERO_PRICES) || this.data.heroes.includes(heroId);
    }

    buyHero(heroId) {
        if (this.owns(heroId) || !this.pay({ usdt: HERO_PRICES[heroId] })) return false;
        this.data.heroes.push(heroId);
        this.save();
        return true;
    }

    // забрать добавки на этот забег: по одной каждой купленной
    takeBoosts() {
        const taken = [];
        for (const b of BOOSTS) if (this.data.next[b.id] > 0) { this.data.next[b.id]--; taken.push(b); }
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
