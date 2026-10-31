// Правила кейсов, NSS и «Ночной смены». Один файл на клиент и сервер (.mjs — чтобы Node читал его
// как модуль на Vercel): клиент показывает, решает сервер (api/_lib/meta.mjs). Функции чистые, случайность передаётся снаружи.
// NSS — закрытая игровая валюта: зарабатывается игрой, тратится только на промокоды NS Store. Без вывода, обмена и продажи.

export const CASE_DROPS = {
    weekly: [
        { r: "common", w: 55, usdt: [1500, 3000] },
        { r: "rare", w: 30, nss: [5, 15] },
        { r: "epic", w: 10, usdt: [1500, 1500], all: true },
        { r: "legend", w: 5, nss: [50, 50], sub: "NSS недели" }],
    merchant: [
        { r: "common", w: 35, usdt: [800, 1500] },
        { r: "common", w: 25, boosts: 2 },
        { r: "rare", w: 18, usdt: [3000, 3000] },
        { r: "rare", w: 10, level: 1 },
        { r: "epic", w: 10, usdt: [1500, 1500], all: true },
        { r: "rare", w: 4, cards: 1 }, // редко — Карта (economy_v7)
        { r: "legend", w: 2, usdt: [13000, 13000], sub: "джекпот" }],
    conqueror: [
        { r: "rare", w: 35, usdt: [4000, 6000] },
        { r: "epic", w: 8, cards: [2, 3] }, // 2–3 Карты (economy_v7)
        { r: "rare", w: 20, level: 1 },
        { r: "epic", w: 35, usdt: [2400, 2400], all: true },
        { r: "legend", w: 10, usdt: [24500, 24500], sub: "сейф покорителя" }],
};

export const META = {
    bonus: { story: 2500, lead: 100, friendRun: 50, friendRunM: 1000, friendMax: 20 }, // заявка — один раз; за друга — один раз на друга и не больше friendMax друзей
    race: { top: 10, off: 10 },  // гонка недели: первые 10 по NSS из забегов и смены получают код на 10% на БАДы
    weeklyLimit: 3,              // Кейс недели — столько раз в неделю: в нём NSS, а цену в USDT сервер не видит
    paidDaily: 30,             // платных открытий в сутки: цену в USDT сервер не видит (кошелёк на клиенте), это его предел
    pity: { epic: 10, legend: 30 }, // шкала удачи: эпическое и лучше — на 10-м открытии без него, легендарное — на 30-м
    runNss: { perM: 200, run: 20 }, // за забег: 1 NSS за 200 м, не больше 20 за забег
    freeBoss: { win: 40, perDay: 3, minSec: 30 }, // свободный забег: NSS за победу над боссом, наград в сутки; бой не раньше minSec от старта забега
    dayNss: 200, // всего за сутки: забеги, смена и Кейс недели вместе (разовые бонусы — сверх)
    promos: [{ id: "p5", off: 5, nss: 3000 }, { id: "p10", off: 10, nss: 6000 }, { id: "p15", off: 15, nss: 10000 }], // скидка в NS Store, %
    promosOpen: false, // пока false: цены видны, покупки в игре нет, коды скрыты звёздочками («Скоро недельные промокоды»)
    promoEveryMs: 7 * 864e5, promoMs: 72 * 3600 * 1000, // один код в неделю, действует 72 часа
    shift: { fullMs: 12 * 3600 * 1000, minMs: 30 * 60 * 1000, usdt: 1500, nss: 20, // копилка заполняется за 12 ч и дальше стоит
        levels: [{ name: "Зима", mult: 1, price: 0 }, { name: "Дубай", mult: 1.5, price: 50, art: "img/shift-dubai.webp?v=1" }, { name: "Вьетнам", mult: 2, price: 150 }] }, // баки: покупаются за Карты
};

export const emptyMeta = () => ({ pity: {}, nss: 0, day: { d: "", n: 0 }, shift: { at: 0, lvl: 0 }, notify: true, last: null, promos: [], earnDay: { d: "", n: 0 }, bossDay: { d: "", n: 0, run: "" }, lastRun: { id: "", n: 0 }, once: {}, weekly: { w: -1, n: 0 } });

// что видит клиент
export const metaView = (s, now) => ({ nss: s.nss, pity: s.pity, notify: s.notify, promos: s.promos.map((p) => (p.race || !META.promosOpen ? { ...p, code: "NSS-******" } : p)) /* скрытый код в телефон не уходит */, weekly: s.weekly.w === weekOf(now) ? s.weekly.n : 0, shift: { at: s.shift.at, lvl: s.shift.lvl || 0, fill: shiftFill(s, now) } });
export const shiftLevel = (lvl) => META.shift.levels[lvl || 0];
// неделя гонки и Кейса недели: с понедельника по воскресенье по Москве
const MSK = 3 * 3600 * 1000, WEEK = 7 * 864e5;
export const weekOf = (now) => Math.floor((now + MSK + 3 * 864e5) / WEEK);
export const weekEnd = (w) => (w + 1) * WEEK - 3 * 864e5 - MSK;

const weighted = (list, weight, rng) => {
    let x = rng() * list.reduce((s, v) => s + weight(v), 0);
    return list.find((v) => (x -= weight(v)) < 0) || list[list.length - 1];
};
const between = ([a, b], rng) => a + Math.floor(rng() * (b - a + 1));

// какой приз: шкала удачи сужает выбор до нужной редкости. Счётчики — по кейсу
export function rollDrop(caseId, state, rng) {
    const drops = CASE_DROPS[caseId];
    const p = (state.pity[caseId] ||= { epic: 0, legend: 0 });
    let pool = drops;
    if (p.legend + 1 >= META.pity.legend) pool = drops.filter((d) => d.r === "legend");
    else if (p.epic + 1 >= META.pity.epic) pool = drops.filter((d) => d.r === "epic" || d.r === "legend");
    const d = weighted(pool, (x) => x.w, rng);
    p.legend = d.r === "legend" ? 0 : p.legend + 1;
    p.epic = d.r === "legend" || d.r === "epic" ? 0 : p.epic + 1;
    return { index: drops.indexOf(d), r: d.r, amount: d.usdt ? between(d.usdt, rng) : 0, nssN: d.nss ? between(d.nss, rng) : 0, cardsN: Array.isArray(d.cards) ? between(d.cards, rng) : d.cards || 0 };
}

const dayOf = (now) => new Date(now).toISOString().slice(0, 10);

// начислить NSS в пределах суточного лимита; возвращает, сколько реально начислено
function earn(state, n, now) {
    if (state.earnDay.d !== dayOf(now)) state.earnDay = { d: dayOf(now), n: 0 };
    const got = Math.max(0, Math.min(n, META.dayNss - state.earnDay.n));
    state.earnDay.n += got;
    state.nss += got;
    return got;
}

// Открытие. Повтор с тем же openId (не дошёл ответ) вернёт тот же результат и ничего не спишет
export function openCase(state, { caseId, openId, now, rng }) {
    if (!Object.hasOwn(CASE_DROPS, caseId)) return { ok: false, status: 400, error: "bad_case" };
    if (state.last?.openId === openId) return { ok: true, result: state.last.result };
    if (caseId === "weekly") {
        if (state.weekly.w !== weekOf(now)) state.weekly = { w: weekOf(now), n: 0 };
        if (state.weekly.n >= META.weeklyLimit) return { ok: false, status: 429, error: "week_limit" };
    }
    if (state.day.d !== dayOf(now)) state.day = { d: dayOf(now), n: 0 };
    if (state.day.n >= META.paidDaily) return { ok: false, status: 429, error: "day_limit" };
    state.day.n++;
    if (caseId === "weekly") state.weekly.n++;
    const result = rollDrop(caseId, state, rng);
    result.nssN = earn(state, result.nssN, now);
    state.last = { openId, result };
    return { ok: true, result };
}

export const shiftFill = (state, now) => (state.shift.at ? Math.min(1, (now - state.shift.at) / META.shift.fullMs) : 0);

// Ночная смена: первый вызов — Никита вышел на смену; дальше — забрать накопленное и начать заново
export function collectShift(state, now) {
    if (!state.shift.at) { state.shift.at = now; return { ok: true, result: { started: true, usdt: 0, nss: 0 } }; }
    if (now - state.shift.at < META.shift.minMs) return { ok: false, status: 403, error: "too_early", at: state.shift.at + META.shift.minMs };
    const k = shiftFill(state, now) * shiftLevel(state.shift.lvl).mult, usdt = Math.floor(META.shift.usdt * k), nss = earn(state, Math.floor(META.shift.nss * k), now);
    state.shift.at = now;
    return { ok: true, result: { started: false, usdt, nss } };
}

// новый бак: копилка больше, сразу и навсегда. Карты списывает вызывающий (у них свой баланс)
export const nextShift = (state) => META.shift.levels[(state.shift.lvl || 0) + 1] || null;
export function upgradeShift(state) {
    if (!nextShift(state)) return { ok: false, status: 409, error: "max" };
    state.shift.lvl = (state.shift.lvl || 0) + 1;
    return { ok: true, result: { lvl: state.shift.lvl } };
}

// NSS за забег. Один забег присылается не раз (апелляция) — начисляем только прибавку
export function runReward(state, { runId, distance, now }) {
    const R = META.runNss;
    const earned = Math.min(R.run, Math.floor(distance / R.perM));
    const before = state.lastRun.id === runId ? state.lastRun.n : 0;
    const nss = earn(state, earned - before, now);
    state.lastRun = { id: runId, n: before + nss };
    return { ok: true, result: { nss } };
}

// NSS за победу над боссом в свободном забеге: одна на забег, в пределах лимита боёв и суточного лимита NSS
export function bossReward(state, { runId, now }) {
    const d = dayOf(now);
    if (state.bossDay.d !== d) state.bossDay = { d, n: 0, run: "" };
    if (state.bossDay.run === runId || state.bossDay.n >= META.freeBoss.perDay) return { ok: true, result: { nss: 0 } };
    state.bossDay.n++;
    state.bossDay.run = runId;
    return { ok: true, result: { nss: earn(state, META.freeBoss.win, now) } };
}

const newCode = (rng) => {
    const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    return `NSS-${Array.from({ length: 6 }, () => letters[Math.floor(rng() * letters.length)]).join("")}`;
};

// Промокод за NSS. Уникальный код, один в неделю
export function buyPromo(state, { promoId, now, rng }) {
    const p = META.promos.find((x) => x.id === promoId);
    if (!p) return { ok: false, status: 400, error: "bad_promo" };
    const last = state.promos.filter((x) => !x.race).pop(); // приз гонки неделю не занимает
    if (last && now - last.at < META.promoEveryMs) return { ok: false, status: 403, error: "wait", at: last.at + META.promoEveryMs };
    if (state.nss < p.nss) return { ok: false, status: 402, error: "not_enough" };
    state.nss -= p.nss;
    const promo = { code: newCode(rng), off: p.off, at: now, until: now + META.promoMs };
    state.promos.push(promo);
    return { ok: true, result: { promo } };
}

// приз гонки недели: бесплатный код на БАДы
export function racePromo(state, { now, rng, place }) {
    const promo = { code: newCode(rng), off: META.race.off, at: now, until: now + META.promoMs, race: true, place };
    state.promos.push(promo);
    return { ok: true, result: { promo } };
}

// бонус за шаг, один раз на ключ
export function awardOnce(state, key, n) {
    if (state.once[key]) return { ok: true, result: { nss: 0 } };
    state.once[key] = 1;
    state.nss += n;
    return { ok: true, result: { nss: n } };
}

// бонус за приглашённого друга: один раз на друга и не больше friendMax, чтобы не фармили фейковыми аккаунтами
export function awardFriend(state, friendId) {
    const n = Object.keys(state.once).filter((k) => k.startsWith("friendRun:")).length;
    if (n >= META.bonus.friendMax) return { ok: true, result: { nss: 0 } };
    return awardOnce(state, `friendRun:${friendId}`, META.bonus.friendRun);
}
