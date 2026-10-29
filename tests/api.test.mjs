// node --test tests/ — юнит-тесты /api/prize (хранилище в памяти)
import test from "node:test";
import assert from "node:assert/strict";
import { handle } from "../api/_lib/prize.mjs";
import { memoryStore } from "../api/_lib/store.mjs";
import { signInitData, verifyInitData } from "../api/_lib/telegram.mjs";

const BOT = "123456:TEST-token";
const env = { BOT_TOKEN: BOT, PRIZE_MIN_STEP_SEC: "30", PRIZE_MIN_TOTAL_SEC: "120", PRIZE_TOTAL: "100", TEST_CARDS: "0" }; // тестовые +1000 Карт — в своём тесте
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
    assert.equal((await run(store, "reward", { initData: d, key: "sign:2.1" }, T0 + 60_000)).status, 403); // табличка главы, которую не начинал
    assert.equal((await run(store, "reward", { initData: d, key: "sign:1.4" }, T0 + 1_000)).status, 403); // сразу после старта — рано
    const s1 = await run(store, "reward", { initData: d, key: "sign:1.4" }, T0 + 10_000);
    assert.deepEqual([s1.json.amount, s1.json.granted], [250, true]);
    assert.equal((await run(store, "reward", { initData: d, key: "sign:1.4" }, T0 + 20_000)).json.granted, false);
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

test("эксклюзивный герой за 250 карт: покупка навсегда, второй раз не списывает, в забег не тратится", async () => {
    const store = memoryStore(), d = init(13);
    await store.caseCardGrant("13", "seed0002", 200, "d", 99);
    assert.equal((await run(store, "cardbuy", { initData: d, item: "hero_dima" }, T0)).status, 402); // 200 < 250
    await store.caseCardGrant("13", "seed0003", 100, "d", 99);
    const buy = await run(store, "cardbuy", { initData: d, item: "hero_dima" }, T0);
    assert.equal(buy.status, 200); assert.equal(buy.json.cards, 50);
    const again = await run(store, "cardbuy", { initData: d, item: "hero_dima" }, T0);
    assert.equal(again.json.owned, true); assert.equal(again.json.cards, 50); // повторно — бесплатно, не списано
    const r = (await run(store, "cardrun", { initData: d }, T0)).json;
    assert.deepEqual(r.perks, []); assert.deepEqual(r.heroes, ["dima"]); // герой не «расходуется» забегом
    assert.deepEqual((await run(store, "cards", { initData: d }, T0)).json.heroes, ["dima"]);
});

// ---- рейтинг ----
test("рейтинг: только забег — лучший результат, очки считает сервер, подозрительное не принимается", async () => {
    const store = memoryStore(), a = init(101), b = init(102);
    const rs = (who, runId, distance, usdt, t) => run(store, "runscore", { initData: who, runId, distance, usdt }, t);
    const ra = (await run(store, "cardrun", { initData: a }, T0)).json.runId;
    const ok = await rs(a, ra, 1200, 150, T0 + 60_000);
    assert.equal(ok.status, 200); assert.equal(ok.json.score, 2700); assert.equal(ok.json.best, 2700); // 150 × 10 + 1200
    assert.equal((await rs(a, ra, 500, 10, T0 + 70_000)).json.best, 2700); // хуже — лучший не меняется
    assert.equal((await rs(a, ra, 5000, 10, T0 + 61_000)).json.error, "implausible"); // за 61 с столько не пробежать
    assert.equal((await rs(a, ra, 1000, 5000, T0 + 60_000)).json.error, "implausible"); // столько USDT на 1000 м не собрать
    assert.equal((await rs(a, "zzzzzzzz", 100, 1, T0 + 60_000)).json.error, "no_run"); // чужой или выдуманный забег
    assert.equal((await rs(a, "x", 100, 1, T0 + 60_000)).status, 400);
    const ra2 = (await run(store, "cardrun", { initData: a }, T0 + 100_000)).json.runId;
    assert.equal((await rs(a, ra2, 50, 1, T0 + 105_000)).json.error, "too_fast"); // меньше 10 с — не считаем
    assert.equal((await rs(a, ra2, 150, 2, T0 + 112_000)).status, 200); // 12 с — уже считаем
    const rb = (await run(store, "cardrun", { initData: b }, T0)).json.runId;
    assert.equal((await rs(b, rb, 2000, 300, T0 + 80_000)).json.best, 5000);
    // карты, боссы, задания — в рейтинг не идут
    const rc = (await run(store, "cardrun", { initData: a }, T0 + 200_000)).json.runId;
    await run(store, "card", { initData: a, runId: rc }, T0 + 245_000);
    assert.equal((await run(store, "task", { initData: a, task: "anketa" }, T0)).json.points, 0);
    assert.equal((await run(store, "task", { initData: a, task: "usdt" }, T0)).status, 400);
    await run(store, "event", { initData: b, event: "run:1" }, T0);
    await run(store, "reward", { initData: b, key: "boss:1" }, T0 + 60_000);
    const r = (await run(store, "top", { initData: a }, T0 + 300_000)).json;
    assert.deepEqual(r.top.map((x) => [x.id, x.score]), [["102", 5000], ["101", 2700]]);
    assert.equal(r.me.rank, 2); assert.equal(r.me.score, 2700); assert.deepEqual(r.me.done, ["anketa"]);
    assert.equal(r.top[0].name, "Игрок");
    // новичок без забега — вне таблицы, место 0
    assert.equal((await run(store, "top", { initData: init(103) }, T0)).json.me.rank, 0);
});

// ---- заявка на разбор ----
test("заявка: уходит в чат менеджеров, очки только после доставки и один раз; разбор кнопкой — нельзя", async () => {
    const store = memoryStore(), d = init(201), sent = [];
    const tgOk = async (url, o) => { sent.push({ url, body: JSON.parse(o.body) }); return { json: async () => ({ ok: true }) }; };
    const tgFail = async () => ({ json: async () => ({ ok: false }) });
    const envL = { ...env, LEADS_CHAT_ID: "-100123", LEADS_COOLDOWN_SEC: "600" };
    const ap = (body, now, f) => handle("apply", { initData: d, ...body }, { store, env: envL, now, fetchImpl: f });
    assert.equal((await run(store, "task", { initData: d, task: "razbor" }, T0)).status, 400); // кнопкой очки не получить
    assert.equal((await handle("apply", { initData: d, contact: "@x" }, { store, env, now: T0, fetchImpl: tgOk })).status, 503); // чат не задан
    assert.equal((await ap({ contact: "" }, T0, tgOk)).status, 400);
    assert.equal((await ap({ contact: "@igrok" }, T0, tgFail)).status, 502); // не дошло — без очков
    const ok = await ap({ contact: "@igrok", note: "<b>вечером</b>", anketa: [["Доход", "до 50к"]], phrases: ["Законно"], code: "N1" }, T0 + 1000, tgOk);
    assert.equal(ok.status, 200); assert.equal(ok.json.points, 0); // заявка доходит, очков в рейтинг нет (рейтинг — забеги)
    assert.equal(sent[0].body.chat_id, "-100123");
    assert.match(sent[0].body.text, /@igrok/); assert.match(sent[0].body.text, /&lt;b&gt;вечером/); assert.match(sent[0].body.text, /Доход — до 50к/);
    assert.equal((await ap({ contact: "@igrok" }, T0 + 60_000, tgOk)).status, 429); // спам — не чаще раза в 10 мин
    const again = await ap({ contact: "@igrok" }, T0 + 700_000, tgOk);
    assert.equal(again.status, 200); assert.equal(again.json.points, 0); // вторая заявка тоже доходит
});

test("рейтинг: награды, выданные до рейтинга забегов, в таблицу не попадают", async () => {
    const store = memoryStore(), d = init(301);
    await store.grant("301", "boss:1", 3000, T0); await store.grant("301", "sign:1.2", 250, T0);
    const a = (await run(store, "top", { initData: d }, T0 + 1000)).json;
    assert.equal(a.me.score, 0); assert.equal(a.me.rank, 0);
});

// ---- проверка действий: подписка на канал и приглашения (verify.mjs) ----
const initRef = (id, ref, t = T0) => signInitData({ auth_date: String(Math.floor(t / 1000)), user: JSON.stringify({ id, first_name: "Друг" }), ...(ref ? { start_param: ref } : {}) }, BOT);

test("подписка: бот спрашивает Telegram; подписан — очки один раз, не подписан — нет, бот не админ — 503", async () => {
    const store = memoryStore(), d = init(401), asked = [];
    const tg = (status, ok = true) => async (url, o) => { asked.push({ url, body: JSON.parse(o.body) }); return { json: async () => (ok ? { ok: true, result: { status } } : { ok: false, description: "Bad Request: member list is inaccessible" }) }; };
    const sub = (f) => handle("subcheck", { initData: d }, { store, env, now: T0, fetchImpl: f });
    const no = await sub(tg("left"));
    assert.equal(no.status, 200); assert.equal(no.json.subscribed, false); assert.equal(no.json.points, 0);
    assert.match(asked[0].url, /\/getChatMember$/); assert.equal(asked[0].body.chat_id, "@Nesuschiystore"); assert.equal(asked[0].body.user_id, 401);
    assert.equal((await sub(tg("x", false))).status, 503); // бот не админ канала — проверить нельзя
    const yes = await sub(tg("member"));
    assert.equal(yes.json.subscribed, true); assert.equal(yes.json.points, 0); // подписка засчитана, очков в рейтинг нет
    assert.equal((await sub(tg("administrator"))).json.points, 0); // очки — один раз
    assert.equal((await run(store, "task", { initData: d, task: "store" }, T0)).status, 400); // кнопкой не засчитать
    assert.equal((await run(store, "task", { initData: d, task: "invite" }, T0)).status, 400);
});

test("приглашение: засчитывается, когда новичок открыл игру по ссылке; старый игрок, сам себя и повтор — нет", async () => {
    const store = memoryStore(), getMe = async () => ({ json: async () => ({ ok: true, result: { username: "p2p_game_bot" } }) });
    const refs = (id) => handle("refs", { initData: init(id) }, { store, env, now: T0, fetchImpl: getMe });
    const r0 = await refs(501);
    assert.equal(r0.json.invited, 0); assert.equal(r0.json.link, "https://t.me/p2p_game_bot?startapp=ref_501");
    await run(store, "event", { initData: initRef(502, "ref_501"), event: "run:1" }, T0); // новичок пришёл по ссылке
    await run(store, "rewards", { initData: initRef(502, "ref_501") }, T0 + 1000); // повторные запросы с той же ссылкой — не считаются
    await run(store, "event", { initData: init(503), event: "run:1" }, T0); // старый игрок…
    await run(store, "rewards", { initData: initRef(503, "ref_501") }, T0 + 5000); // …потом открыл по ссылке — не считается
    await run(store, "rewards", { initData: initRef(501, "ref_501") }, T0); // сам себя — нет
    await run(store, "rewards", { initData: initRef(504, "ref_999") }, T0); // другой друг
    await run(store, "rewards", { initData: initRef(504, "ref_501") }, T0 + 1000); // уже засчитан другому — не переходит
    const r1 = await refs(501);
    assert.equal(r1.json.invited, 1); assert.equal(r1.json.points, 0); // друг засчитан, очков в рейтинг нет
    assert.equal((await refs(501)).json.points, 0); // очки за «Позвать друга» — один раз
    assert.equal((await refs(999)).json.invited, 1);
    const own = await handle("refs", { initData: init(505) }, { store, env: { ...env, INVITE_LINK: "https://t.me/p2p_game_bot/play" }, now: T0, fetchImpl: getMe });
    assert.equal(own.json.link, "https://t.me/p2p_game_bot/play?startapp=ref_505");
});

test("рейтинг: фото профиля из Telegram — в таблице; не с доменов Telegram — без фото", async () => {
    const store = memoryStore();
    const withPhoto = (id, photo_url) => signInitData({ auth_date: String(Math.floor(T0 / 1000)), user: JSON.stringify({ id, first_name: "Фото", photo_url }) }, BOT);
    const a = withPhoto(601, "https://t.me/i/userpic/320/abc.jpg"), b = withPhoto(602, "javascript:alert(1)");
    for (const who of [a, b]) { // в таблицу — после забега
        const runId = (await run(store, "cardrun", { initData: who }, T0)).json.runId;
        await run(store, "runscore", { initData: who, runId, distance: 600, usdt: 20 }, T0 + 40_000);
    }
    const top = (await run(store, "top", { initData: a }, T0 + 41_000)).json.top;
    assert.equal(top.find((x) => x.id === "601").photo, "https://t.me/i/userpic/320/abc.jpg");
    assert.equal(top.find((x) => x.id === "602").photo, "");
});

test("тестовые Карты: каждому один раз при проверке баланса или старте забега", async () => {
    const store = memoryStore(), d = init(77);
    const t = { ...env, TEST_CARDS: "1000" };
    assert.equal((await handle("cards", { initData: d }, { store, env: t, now: T0 })).json.cards, 1000);
    assert.equal((await handle("cardrun", { initData: d }, { store, env: t, now: T0 + 1000 })).json.cards, 1000); // второй раз не даём
    assert.equal((await handle("cards", { initData: init(78) }, { store, env, now: T0 })).json.cards, 0); // TEST_CARDS=0 — выключено
});
