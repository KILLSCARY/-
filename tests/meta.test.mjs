import test from "node:test";
import assert from "node:assert/strict";
import { handle } from "../api/_lib/prize.mjs";
import { notifyShifts, settleRace, changeMeta } from "../api/_lib/meta.mjs";
import { memoryStore } from "../api/_lib/store.mjs";
import { signInitData } from "../api/_lib/telegram.mjs";
import { META, CASE_DROPS, emptyMeta, rollDrop, openCase, collectShift, upgradeShift, runReward, buyPromo, awardFriend, weekOf, weekEnd } from "../js/meta-rules.mjs";

const env = { BOT_TOKEN: "t" };
const T0 = 1800000000000;
const call = (store, action, body = {}, now = T0) => handle(action, { ...body, initData: signInitData({ user: JSON.stringify({ id: 7, first_name: "A" }), auth_date: String(Math.floor(now / 1000)) }, "t"), action }, { store, env, now });
const low = () => 0.5;

test("шкала удачи: эпическое на 10-м, легендарное на 30-м открытии, даже при худшем везении", () => {
    const s = emptyMeta(), common = () => 0; // первый приз списка всегда — самый обычный
    const got = Array.from({ length: 30 }, () => rollDrop("merchant", s, common).r);
    assert.ok(got.slice(0, 9).every((r) => r === "common" || r === "rare"));
    assert.equal(got[9], "epic");
    assert.equal(got[19], "epic");
    assert.equal(got[29], "legend");
    assert.deepEqual(s.pity.merchant, { epic: 0, legend: 0 });
});

test("повтор с тем же openId возвращает тот же приз; лимит платных открытий; NSS на кейсы не тратятся", () => {
    const s = emptyMeta(); s.nss = 1000;
    const a = openCase(s, { caseId: "merchant", openId: "aaaaaa", pay: "nss", now: T0, rng: Math.random });
    assert.deepEqual(openCase(s, { caseId: "merchant", openId: "aaaaaa", now: T0, rng: Math.random }).result, a.result);
    assert.equal(s.nss, 1000);
    s.day.n = META.paidDaily;
    assert.equal(openCase(s, { caseId: "merchant", openId: "bbbbbb", now: T0, rng: low }).status, 429);
});

test("смена: копилка растёт 12 часов и дальше стоит, слишком рано забрать нельзя", () => {
    const s = emptyMeta();
    assert.equal(collectShift(s, T0).result.started, true);
    assert.equal(collectShift(s, T0 + 60000).error, "too_early");
    assert.equal(collectShift(s, T0 + META.shift.fullMs / 2).result.usdt, META.shift.usdt / 2);
    const full = collectShift(s, T0 + META.shift.fullMs * 10).result;
    assert.equal(full.usdt, META.shift.usdt);
    assert.equal(full.nss, META.shift.nss);
});

test("API: кейс, плохие данные, состояние переживает запросы", async () => {
    const store = memoryStore();
    assert.equal((await call(store, "caseopen", { caseId: "nope", openId: "aaaaaa" })).status, 400);
    assert.equal((await call(store, "caseopen", { caseId: "merchant", openId: "!" })).status, 400);
    const r = await call(store, "caseopen", { caseId: "merchant", openId: "aaaaaa" });
    assert.equal(r.status, 200);
    assert.ok(CASE_DROPS.merchant[r.json.index]);
    assert.equal((await call(store, "meta")).json.pity.merchant.legend, 1);
});

test("сообщения бота: выключены без SHIFT_NOTIFY, каждому один раз, можно отказаться", async () => {
    const store = memoryStore(), sent = [];
    await call(store, "shift");
    const fetchImpl = async (u, o) => { sent.push(JSON.parse(o.body).chat_id); return { json: async () => ({ ok: true }) }; };
    const late = T0 + META.shift.fullMs + 1;
    assert.equal((await notifyShifts({ store, env, now: late, fetchImpl })).off, true);
    const on = { ...env, SHIFT_NOTIFY: "1" };
    assert.equal((await notifyShifts({ store, env: on, now: T0, fetchImpl })).sent, 0); // ещё не полная
    assert.equal((await notifyShifts({ store, env: on, now: late, fetchImpl })).sent, 1);
    assert.equal((await notifyShifts({ store, env: on, now: late, fetchImpl })).sent, 0);
    await call(store, "shift", {}, late);
    await call(store, "shiftnotify", { on: false }, late);
    assert.equal((await notifyShifts({ store, env: on, now: late + META.shift.fullMs + 1, fetchImpl })).sent, 0);
    assert.deepEqual(sent, [7]);
});

test("новый бак: копилка больше, дальше максимума нельзя", () => {
    const s = emptyMeta();
    assert.equal(upgradeShift(s).ok, true);
    collectShift(s, T0);
    assert.equal(collectShift(s, T0 + META.shift.fullMs).result.usdt, META.shift.usdt * 1.5);
    assert.equal(upgradeShift(s).ok, true);
    assert.equal(upgradeShift(s).error, "max");
});

test("API: бак стоит Карты, без Карт не покупается", async () => {
    const store = memoryStore();
    assert.equal((await call(store, "shiftup")).status, 402);
    await store.cardTestOnce("7", 60);
    const r = await call(store, "shiftup");
    assert.equal(r.status, 200);
    assert.equal(r.json.cards, 10);
    assert.equal(r.json.meta.shift.lvl, 1);
});

test("NSS за забег: прибавка при повторе, лимиты забега и суток", () => {
    const s = emptyMeta(), run = (runId, distance, now = T0) => runReward(s, { runId, distance, now }).result.nss;
    assert.equal(run("a", 1000), 5);
    assert.equal(run("a", 1000), 0);
    assert.equal(run("a", 1400), 2);
    assert.equal(run("a", 99999), 13); // не больше 20 за забег
    for (let i = 0; i < 9; i++) assert.equal(run(`r${i}`, 99999), 20); // 10 полных забегов — 200 NSS
    assert.equal(s.nss, META.dayNss);
    assert.equal(run("e", 99999), 0);
    assert.equal(run("f", 99999, T0 + 864e5), 20);
});

test("промокод: цены 3000/6000/10000, 72 часа, один в неделю, повтор ничего не списывает", () => {
    assert.deepEqual(META.promos.map((p) => [p.off, p.nss]), [[5, 3000], [10, 6000], [15, 10000]]);
    const s = emptyMeta(), buy = (now) => buyPromo(s, { promoId: "p5", now, rng: Math.random });
    assert.equal(buy(T0).error, "not_enough");
    s.nss = 7000;
    const a = buy(T0);
    assert.match(a.result.promo.code, /^NSS-[A-Z2-9]{6}$/);
    assert.equal(a.result.promo.until - T0, 72 * 3600 * 1000);
    assert.equal(s.nss, 4000);
    assert.equal(buy(T0 + 864e5).error, "wait");
    assert.equal(s.nss, 4000);
    assert.equal(buy(T0 + META.promoEveryMs).ok, true);
    assert.equal(buyPromo(s, { promoId: "nope", now: T0, rng: low }).status, 400);
});

test("две покупки кода одновременно: второй отказ, NSS списаны один раз", async () => {
    const store = memoryStore();
    await store.metaCas("7", null, JSON.stringify({ ...emptyMeta(), nss: 7000 }));
    const [a, b] = await Promise.all([call(store, "promobuy", { promo: "p5" }), call(store, "promobuy", { promo: "p5" })]);
    assert.deepEqual([a.status, b.status].sort(), [200, 403]);
    assert.equal((await call(store, "meta")).json.nss, 4000);
    assert.equal((await call(store, "meta")).json.promos.length, 1);
    const code = (a.status === 200 ? a : b).json.promo.code;
    assert.equal(await store.promoOwner(code), "7");
});

test("бонус за друга: один раз на друга и не больше предела", () => {
    const s = emptyMeta();
    assert.equal(awardFriend(s, "a").result.nss, META.bonus.friendRun);
    assert.equal(awardFriend(s, "a").result.nss, 0);
    for (let i = 0; i < 50; i++) awardFriend(s, `f${i}`);
    assert.equal(s.nss, META.bonus.friendMax * META.bonus.friendRun);
});

test("API: код уходит менеджерам, забег начисляет NSS", async () => {
    const store = memoryStore(), sent = [];
    await store.metaCas(7, null, JSON.stringify({ ...emptyMeta(), nss: 3000 }));
    const fetchImpl = async (u, o) => { sent.push(JSON.parse(o.body)); return { json: async () => ({ ok: true }) }; };
    const body = { action: "promobuy", promo: "p5", initData: signInitData({ user: JSON.stringify({ id: 7, first_name: "A" }), auth_date: String(Math.floor(T0 / 1000)) }, "t") };
    const r = await handle("promobuy", body, { store, env: { ...env, LEADS_CHAT_ID: "-1" }, now: T0, fetchImpl });
    assert.equal(r.status, 200);
    assert.ok(sent[0].text.includes(r.json.promo.code));
    assert.equal(r.json.meta.nss, 0);
});

test("неделя: граница — понедельник 00:00 по Москве", () => {
    const mon = Date.UTC(2026, 10, 1, 21, 0); // пн 2 ноября 00:00 МСК
    assert.equal(weekOf(mon - 1) + 1, weekOf(mon));
    assert.equal(weekEnd(weekOf(mon - 1)), mon);
});

test("кейс недели: 3 раза в неделю, NSS начисляются", () => {
    const s = emptyMeta();
    for (const id of ["aaaaaa", "bbbbbb", "cccccc"]) assert.equal(openCase(s, { caseId: "weekly", openId: id, now: T0, rng: () => 0.99 }).ok, true);
    assert.equal(s.nss, 150);
    assert.equal(openCase(s, { caseId: "weekly", openId: "dddddd", now: T0, rng: low }).error, "week_limit");
    assert.equal(openCase(s, { caseId: "weekly", openId: "eeeeee", now: T0 + 7 * 864e5, rng: low }).ok, true);
});

test("гонка: копится из смены, видна в рейтинге, призы выдаются один раз", async () => {
    const store = memoryStore(), sent = [];
    await call(store, "shift");
    await call(store, "shift", {}, T0 + META.shift.fullMs);
    const top = await call(store, "top", {}, T0 + META.shift.fullMs);
    assert.equal(top.json.race.me.nss, META.shift.nss);
    assert.equal(top.json.race.top[0].id, "7");
    const fetchImpl = async (u, o) => { sent.push(JSON.parse(o.body)); return {}; };
    const next = T0 + 7 * 864e5;
    assert.equal((await settleRace({ store, env: { ...env, LEADS_CHAT_ID: "-5" }, now: next, fetchImpl })).settled, 1);
    assert.equal((await settleRace({ store, env: { ...env, LEADS_CHAT_ID: "-5" }, now: next, fetchImpl })).settled, 0);
    const promos = JSON.parse(await store.metaGet("7")).promos;
    assert.equal(promos[0].off, META.race.off);
    assert.equal(promos[0].race, true);
    assert.equal(await store.promoOwner(promos[0].code), "7");
    assert.equal(sent.length, 1);
    assert.equal((await call(store, "meta", {}, next)).json.promos[0].code, "NSS-******"); // в телефон код гонки не уходит
});

test("заявка, дошедшая до менеджеров, даёт NSS один раз; друг пробежал — бонус", async () => {
    const store = memoryStore();
    await store.refAdd("9", "7");
    const fetchImpl = async () => ({ json: async () => ({ ok: true }) });
    const init = signInitData({ user: JSON.stringify({ id: 7, first_name: "A" }), auth_date: String(Math.floor(T0 / 1000)) }, "t");
    const ctx = { store, env: { ...env, LEADS_CHAT_ID: "-5", LEADS_COOLDOWN_SEC: "0" }, now: T0, fetchImpl };
    assert.equal((await handle("apply", { initData: init, contact: "@a" }, ctx)).status, 200);
    await handle("apply", { initData: init, contact: "@a" }, { ...ctx, now: T0 + 2000 });
    assert.equal(JSON.parse(await store.metaGet("7")).nss, META.bonus.lead);
    await handle("cardrun", { initData: init }, ctx);
    const { runNss } = await import("../api/_lib/meta.mjs");
    await runNss({ id: "7", user: {} }, 1200, "abcdef", { store, now: T0 });
    assert.equal(JSON.parse(await store.metaGet("9")).nss, META.bonus.friendRun);
});

test("пока промокоды закрыты, настоящий код в телефон не уходит", async () => {
    const store = memoryStore();
    await store.metaCas("7", null, JSON.stringify({ ...emptyMeta(), promos: [{ code: "NSS-REAL22", off: 5, at: T0, until: T0 + 1 }] }));
    assert.equal(META.promosOpen, false);
    assert.equal((await call(store, "meta")).json.promos[0].code, "NSS-******");
});

test("суточный лимит 200 NSS общий: забеги, смена и Кейс недели", () => {
    const s = emptyMeta(), noon = Date.UTC(2027, 0, 5, 12);
    for (let i = 0; i < 9; i++) runReward(s, { runId: `r${i}`, distance: 99999, now: noon });
    assert.equal(s.nss, 180);
    collectShift(s, noon - META.shift.fullMs);
    assert.equal(collectShift(s, noon).result.nss, 20);
    assert.equal(s.nss, 200);
    const c = openCase(s, { caseId: "weekly", openId: "aaaaaa", now: noon, rng: () => 0.99 });
    assert.equal(c.result.nssN, 0);
    assert.equal(s.nss, 200);
});

test("сюжет: 2500 NSS один раз за финального босса, вне суточного лимита; кто прошёл раньше — получит при входе", async () => {
    const store = memoryStore(), init = signInitData({ user: JSON.stringify({ id: 7, first_name: "A" }), auth_date: String(Math.floor(T0 / 1000)) }, "t");
    const ctx = { store, env, now: T0 };
    assert.equal((await handle("reward", { initData: init, key: "boss:3" }, ctx)).status, 403); // без забега главы не выдаётся
    await handle("event", { initData: init, event: "run:3" }, { ...ctx, now: T0 - 60000 });
    const r = await handle("reward", { initData: init, key: "boss:3" }, ctx);
    assert.equal(r.json.nss, META.bonus.story);
    assert.equal(r.json.meta.nss, 2500);
    assert.equal((await handle("reward", { initData: init, key: "boss:3" }, ctx)).json.nss, 0);
    assert.equal((await call(store, "meta")).json.nss, 2500);
    const old = memoryStore();
    await old.grant("7", "boss:3", 12000, T0 - 1);
    assert.equal((await call(old, "meta")).json.nss, 2500);
    assert.equal((await call(old, "meta")).json.nss, 2500);
});

test("скрытый участник: нет в таблице и гонке, места пересчитаны, приза нет", async () => {
    const store = memoryStore();
    await store.lbBest("1", 900, "Софочка К.");
    await store.lbBest("2", 500, "Аня");
    await store.raceAdd(weekOf(T0), "1", 90, "Софочка К.");
    await store.raceAdd(weekOf(T0), "2", 40, "Аня");
    const r = await call(store, "top");
    assert.deepEqual(r.json.top.map((x) => [x.name, x.rank]), [["Аня", 1]]);
    assert.deepEqual(r.json.race.top.map((x) => [x.name, x.rank]), [["Аня", 1]]);
    assert.equal((await settleRace({ store, env, now: T0 + 7 * 864e5, fetchImpl: async () => ({}) })).settled, 1);
    assert.equal(await store.metaGet("1"), null);
});
