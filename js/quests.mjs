// Ежедневные задания: три на день, одинаковые у всех (выбираются по дате), прогресс и награды — на устройстве, как ежедневный вход.
import { DAILY_QUESTS } from "./config.js";

const hash = (s) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);

// какие задания сегодня: перемешивание с зерном из даты
export function questsFor(day, cfg = DAILY_QUESTS) {
    let seed = hash(day);
    const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    const pool = [...cfg.pool];
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)), t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
    return pool.slice(0, cfg.count);
}

// состояние дня в профиле: с новым днём прогресс начинается заново
export function questState(data, day = new Date().toDateString()) {
    if (data.quests?.day !== day) data.quests = { day, got: {}, claimed: {}, bonus: false };
    return data.quests;
}

// mode "max" — лучший результат за один раз (метры), иначе сумма
export function questAdd(data, id, n = 1, mode = "sum", day) {
    const st = questState(data, day);
    const was = st.got[id] || 0, now = mode === "max" ? Math.max(was, n) : was + n;
    st.got[id] = now;
    return now !== was;
}

export function questList(data, day, cfg = DAILY_QUESTS) {
    const st = questState(data, day);
    return questsFor(st.day, cfg).map((q) => ({ ...q, got: Math.min(q.goal, Math.floor(st.got[q.id] || 0)), done: (st.got[q.id] || 0) >= q.goal, claimed: !!st.claimed[q.id] }));
}

// сколько наград можно забрать прямо сейчас — кружок в меню
export function questReady(data, day, cfg = DAILY_QUESTS) {
    const list = questList(data, day, cfg), st = data.quests;
    return list.filter((q) => q.done && !q.claimed).length + (list.every((q) => q.claimed) && !st.bonus ? 1 : 0);
}

// забрать награду: сумма USDT или 0, если забирать нечего. Повторно не выдаётся
export function questClaim(data, id, day, cfg = DAILY_QUESTS) {
    const q = questList(data, day, cfg).find((x) => x.id === id);
    if (!q || !q.done || q.claimed) return 0;
    data.quests.claimed[id] = true;
    return q.usdt;
}

export function questClaimBonus(data, day, cfg = DAILY_QUESTS) {
    const list = questList(data, day, cfg), st = data.quests;
    if (st.bonus || !list.every((q) => q.claimed)) return 0;
    st.bonus = true;
    return cfg.bonus;
}
