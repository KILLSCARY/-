// node --test tests/ — юнит-тесты /api/prize (хранилище в памяти)
import test from "node:test";
import assert from "node:assert/strict";
import { handle } from "../api/_lib/prize.mjs";
import { memoryStore } from "../api/_lib/store.mjs";
import { signInitData, verifyInitData } from "../api/_lib/telegram.mjs";

const BOT = "123456:TEST-token";
const env = { BOT_TOKEN: BOT, PRIZE_MIN_STEP_SEC: "30", PRIZE_MIN_TOTAL_SEC: "120", PRIZE_TOTAL: "100" };
const T0 = 1_800_000_000_000;
const init = (id, t = T0) => signInitData({ auth_date: String(Math.floor(t / 1000)), query_id: "q", user: JSON.stringify({ id, first_name: "Игрок" }) }, BOT);
const run = (store, action, body, now) => handle(action, body, { store, env, now });
async function finish(store, id, t = T0, gap = 200_000) {
    const d = init(id, t);
    await run(store, "event", { initData: d, event: "run:1" }, t);
    await run(store, "event", { initData: d, event: "boss:pavel" }, t + gap);
    return d;
}

test("подделанный initData отклоняется", async () => {
    const store = memoryStore();
    const good = init(42);
    const forged = good.replace(encodeURIComponent('"id":42'), encodeURIComponent('"id":43'));
    assert.notEqual(forged, good);
    assert.equal(verifyInitData(forged, BOT, 0), null);
    assert.equal(verifyInitData(signInitData({ auth_date: "1", user: '{"id":1}' }, "other:token"), BOT, 0), null);
    assert.equal(verifyInitData("user=%7B%22id%22%3A1%7D&auth_date=1", BOT, 0), null);
    for (const d of [forged, "", "hash=" + "0".repeat(64)]) {
        assert.equal((await run(store, "event", { initData: d, event: "run:1" }, T0)).status, 401);
        assert.equal((await run(store, "claim", { initData: d }, T0 + 300_000)).status, 401);
    }
    assert.equal((await run(store, "counter", {}, T0)).json.taken, 0);
});

test("просроченный initData отклоняется", async () => {
    const r = await run(memoryStore(), "event", { initData: init(1, T0), event: "run:1" }, T0 + 2 * 86400_000);
    assert.equal(r.status, 401);
});

test("повторная заявка — то же место, счётчик не растёт", async () => {
    const store = memoryStore();
    const a = await finish(store, 1), b = await finish(store, 2);
    const t = T0 + 300_000;
    const r1 = await run(store, "claim", { initData: a }, t);
    const r2 = await run(store, "claim", { initData: a }, t + 1000);
    const r3 = await run(store, "claim", { initData: b }, t + 2000);
    const r4 = await run(store, "claim", { initData: a }, t + 3000);
    assert.equal(r1.json.place, 1); assert.equal(r2.json.place, 1); assert.equal(r4.json.place, 1);
    assert.equal(r3.json.place, 2);
    assert.equal(r1.json.left, 99);
    const c = await run(store, "counter", { initData: a }, t);
    assert.deepEqual([c.json.taken, c.json.left, c.json.place], [2, 98, 1]);
});

test("неполная цепочка и слишком быстрое прохождение отклоняются", async () => {
    const store = memoryStore();
    const d = init(7);
    assert.equal((await run(store, "claim", { initData: d }, T0)).json.reason, "missing:run:1");
    await run(store, "event", { initData: d, event: "run:1" }, T0);
    let r = await run(store, "claim", { initData: d }, T0 + 500_000);
    assert.equal(r.status, 403); assert.equal(r.json.reason, "missing:boss:pavel");
    const fast = init(8);
    await run(store, "event", { initData: fast, event: "run:1" }, T0);
    await run(store, "event", { initData: fast, event: "boss:pavel" }, T0 + 40_000); // 40 с < 120 с
    r = await run(store, "claim", { initData: fast }, T0 + 50_000);
    assert.equal(r.status, 403); assert.equal(r.json.reason, "too_fast:total");
    // порядок: босс раньше старта — тоже нет
    const rev = init(9);
    await run(store, "event", { initData: rev, event: "boss:pavel" }, T0);
    await run(store, "event", { initData: rev, event: "run:1" }, T0 + 300_000);
    assert.equal((await run(store, "claim", { initData: rev }, T0 + 400_000)).status, 403);
    assert.equal((await run(store, "event", { initData: d, event: "storyOk=99" }, T0)).status, 400);
    assert.equal((await run(store, "counter", {}, T0)).json.taken, 0);
});

test("повтор события не сдвигает первую метку времени", async () => {
    const store = memoryStore();
    const d = await finish(store, 5, T0, 200_000);
    await run(store, "event", { initData: d, event: "run:1" }, T0 + 190_000); // попытка «перезапустить» старт
    assert.equal((await run(store, "claim", { initData: d }, T0 + 300_000)).json.place, 1);
});

test("сотня разобрана → soldOut без места", async () => {
    const store = memoryStore();
    const small = { ...env, PRIZE_TOTAL: "2" };
    for (const id of [1, 2, 3]) {
        const d = await finish(store, id);
        const r = await handle("claim", { initData: d }, { store, env: small, now: T0 + 300_000 });
        if (id < 3) assert.equal(r.json.place, id); else { assert.equal(r.json.place, 0); assert.equal(r.json.soldOut, true); assert.equal(r.json.left, 0); }
    }
});

test("награды босса и табличек — один раз, сумма с сервера", async () => {
    const store = memoryStore(), d = init(77);
    assert.equal((await run(store, "reward", { initData: d, key: "boss:1" }, T0)).status, 403); // без забега
    await run(store, "event", { initData: d, event: "run:1" }, T0);
    assert.equal((await run(store, "reward", { initData: d, key: "boss:1" }, T0 + 5_000)).status, 403); // слишком быстро
    const a = await run(store, "reward", { initData: d, key: "boss:1", amount: 999999 }, T0 + 60_000);
    assert.deepEqual([a.status, a.json.amount, a.json.granted], [200, 3000, true]);
    const b = await run(store, "reward", { initData: d, key: "boss:1" }, T0 + 70_000);
    assert.equal(b.json.granted, false);
    await run(store, "event", { initData: d, event: "run:3" }, T0);
    const c = await run(store, "reward", { initData: d, key: "boss:3" }, T0 + 60_000);
    assert.deepEqual([c.json.amount, c.json.granted], [12000, true]);
    assert.equal((await run(store, "reward", { initData: d, key: "boss:3" }, T0 + 90_000)).json.granted, false);
    const s1 = await run(store, "reward", { initData: d, key: "sign:1.4" }, T0);
    assert.deepEqual([s1.json.amount, s1.json.granted], [250, true]);
    assert.equal((await run(store, "reward", { initData: d, key: "sign:1.4" }, T0)).json.granted, false);
    assert.equal((await run(store, "reward", { initData: d, key: "boss:9" }, T0)).status, 400);
    assert.equal((await run(store, "reward", { initData: "x", key: "boss:1" }, T0)).status, 401);
    assert.deepEqual((await run(store, "rewards", { initData: d }, T0)).json.rewards, { "boss:1": 3000, "boss:3": 12000, "sign:1.4": 250 });
});

// ---- «Карта» ----
test("карты: не больше 2 за забег, только после старта и не быстрее лимитов", async () => {
    const store = memoryStore(), d = init(7);
    assert.equal((await run(store, "card", { initData: d, runId: "nosuchrun1" }, T0)).json.error, "no_run");
    const { runId } = (await run(store, "cardrun", { initData: d }, T0)).json;
    assert.equal((await run(store, "card", { initData: d, runId }, T0 + 10_000)).json.error, "too_fast");
    assert.equal((await run(store, "card", { initData: d, runId }, T0 + 45_000)).json.cards, 1);
    assert.equal((await run(store, "card", { initData: d, runId }, T0 + 50_000)).json.error, "too_fast");
    assert.equal((await run(store, "card", { initData: d, runId }, T0 + 80_000)).json.cards, 2);
    assert.equal((await run(store, "card", { initData: d, runId }, T0 + 200_000)).json.error, "run_limit");
    assert.equal((await run(store, "card", { initData: init(8), runId }, T0 + 200_000)).json.error, "no_run"); // чужой забег
    assert.equal((await run(store, "cards", { initData: d }, T0)).json.cards, 2);
});
test("карты: покупка по серверной цене, без ухода в минус", async () => {
    const store = memoryStore(), d = init(9);
    for (let i = 0; i < 3; i++) {
        const { runId } = (await run(store, "cardrun", { initData: d }, T0 + i * 1e6)).json;
        await run(store, "card", { initData: d, runId }, T0 + i * 1e6 + 45_000);
        await run(store, "card", { initData: d, runId }, T0 + i * 1e6 + 80_000);
    }
    assert.equal((await run(store, "cardbuy", { initData: d, item: "dash" }, T0)).status, 402);
    const r = await run(store, "cardbuy", { initData: d, item: "x2run", price: 0 }, T0);
    assert.equal(r.json.price, 5); assert.equal(r.json.cards, 1);
    assert.equal((await run(store, "cardbuy", { initData: d, item: "usdt" }, T0)).status, 400);
});

test("карты из кейсов: Мерчант 1, Покоритель 2–3, openId один раз, лимит в сутки", async () => {
    const store = memoryStore(), d = init(11);
    const a = await run(store, "casecard", { initData: d, caseId: "merchant", openId: "open0001", n: 9 }, T0);
    assert.deepEqual([a.json.n, a.json.cards], [1, 1]);
    assert.equal((await run(store, "casecard", { initData: d, caseId: "merchant", openId: "open0001" }, T0)).json.error, "dup");
    const b = await run(store, "casecard", { initData: d, caseId: "conqueror", openId: "open0002", n: 3 }, T0);
    assert.deepEqual([b.json.n, b.json.cards], [3, 4]);
    assert.equal((await run(store, "casecard", { initData: d, caseId: "conqueror", openId: "open0003", n: 0 }, T0)).json.n, 2);
    assert.equal((await run(store, "casecard", { initData: d, caseId: "envelope", openId: "open0004" }, T0)).status, 400);
    for (let i = 5; i < 7; i++) await run(store, "casecard", { initData: d, caseId: "merchant", openId: "open000" + i }, T0);
    assert.equal((await run(store, "casecard", { initData: d, caseId: "merchant", openId: "open0009" }, T0)).json.error, "day_limit");
    assert.equal((await run(store, "casecard", { initData: d, caseId: "merchant", openId: "open0010" }, T0 + 86_400_000)).json.ok, true);
});

test("перки за карты: cardbuy кладёт на сервер, cardrun списывает по одному", async () => {
    const store = memoryStore(), d = init(12);
    await store.caseCardGrant("12", "seed0001", 30, "d", 99);
    assert.equal((await run(store, "cardbuy", { initData: d, item: "dash" }, T0)).json.perks.dash, 1);
    await run(store, "cardbuy", { initData: d, item: "x2run" }, T0);
    await run(store, "cardbuy", { initData: d, item: "x2run" }, T0);
    const r1 = (await run(store, "cardrun", { initData: d }, T0)).json;
    assert.deepEqual(r1.perks.sort(), ["dash", "x2run"]);
    assert.deepEqual((await run(store, "cardrun", { initData: d }, T0 + 1000)).json.perks, ["x2run"]);
    assert.deepEqual((await run(store, "cardrun", { initData: d }, T0 + 2000)).json.perks, []);
});
