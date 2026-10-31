// Кейсы, NSS и «Ночная смена» на сервере. Правила — js/meta-rules.mjs, здесь только хранение: состояние игрока —
// один JSON (p2p:meta:<id>), запись — «сравни и замени», поэтому две вкладки или двойной тап не выдадут награду дважды.
// USDT по-прежнему в кошельке клиента: сервер решает приз и шкалу удачи, но не видит, заплачено ли (см. META.paidDaily).
// env: SHIFT_NOTIFY=1 — включить сообщения бота (иначе cron ничего не шлёт), CRON_SECRET — защита api/cron-shift.
import { emptyMeta, metaView as view, openCase, collectShift, upgradeShift, nextShift, runReward, bossReward, buyPromo, racePromo, awardOnce, awardFriend, weekOf, weekEnd, META } from "../../js/meta-rules.mjs";
import { cardsConfig } from "./cards.mjs";
import { nameOf, photoOf, visibleRows, HIDDEN_NAMES } from "./rating.mjs";

export const META_ACTIONS = ["meta", "caseopen", "shift", "shiftup", "shiftnotify", "promobuy", "bosswin"];
const ID_RE = /^[a-z0-9]{6,24}$/;

// изменение состояния: читаем, считаем, пишем, если за это время никто не успел записать раньше
export async function changeMeta(store, id, fn) {
    for (let i = 0; i < 5; i++) {
        const raw = await store.metaGet(id);
        const state = raw ? { ...emptyMeta(), ...JSON.parse(raw) } : emptyMeta();
        const out = fn(state);
        if (!out.ok) return { out, state };
        if (await store.metaCas(id, raw, JSON.stringify(state))) return { out, state };
    }
    return { out: { ok: false, status: 409, error: "busy" }, state: null };
}

// новый промокод — в чат менеджеров, чтобы они могли его сверить. Сбой не мешает выдаче: код остаётся у игрока
async function tellManagers(p, who, { env, fetchImpl }) {
    const token = env.LEADS_BOT_TOKEN || env.BOT_TOKEN, chat = env.LEADS_CHAT_ID;
    if (!token || !chat) return;
    try {
        await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chat, text: `Промокод ${p.code}: скидка ${p.off}%, действует до ${new Date(p.until).toISOString().slice(0, 10)}. Игрок ${who.id}` }),
        });
    } catch {}
}

// NSS за проверенный сервером забег
export async function runNss(who, distance, runId, { store, now = Date.now() }) {
    const { out, state } = await changeMeta(store, who.id, (s) => runReward(s, { runId, distance, now }));
    if (!out.ok) return {};
    await raceAdd(store, who, out.result.nss, now);
    if (distance >= META.bonus.friendRunM) await friendRan(store, who.id);
    return { nss: out.result.nss, meta: view(state, now) };
}

// в гонку идут только NSS из забегов и смены: бонусы и кейсы места в ней не дают
async function raceAdd(store, who, n, now) {
    if (n > 0) await store.raceAdd(weekOf(now), who.id, n, nameOf(who.user), photoOf(who.user));
}

// друг пробежал дистанцию — бонус тому, кто позвал (один раз на друга)
async function friendRan(store, id) {
    const inviter = await store.refOf(id);
    if (!inviter || inviter === "0") return;
    if (!(await store.rewards(id))["boss:1"]) return; // друг считается, когда прошёл первую главу: иначе фермы из пустых аккаунтов
    await changeMeta(store, inviter, (s) => awardFriend(s, id));
}

// сюжет пройден (сервер выдал награду за финального босса): NSS один раз
export async function storyNss(who, { store, now = Date.now() }) {
    const { out, state } = await changeMeta(store, who.id, (s) => awardOnce(s, "story", META.bonus.story));
    return out.ok ? { nss: out.result.nss, meta: view(state, now) } : {};
}

// заявка на разбор дошла до менеджеров
export async function leadNss(who, { store }) {
    await changeMeta(store, who.id, (s) => awardOnce(s, "lead", META.bonus.lead));
}

// данные гонки для таблицы рейтинга
export async function raceData(who, rows, { store, now }) {
    const w = weekOf(now), ids = rows.map((x) => String(x.id));
    const [nss, top, me] = await Promise.all([store.raceScores(w, ids), store.raceTop(w, 50 + HIDDEN_NAMES.length), store.raceMe(w, who.id)]);
    rows.forEach((x, i) => { x.nss = nss[i]; });
    return { end: weekEnd(w), prizes: META.race.top, off: META.race.off, top: visibleRows(top, 50), me };
}

// итоги прошлой недели: первым в гонке — код на БАДы. Один раз, запускает cron
export async function settleRace({ store, env = process.env, now = Date.now(), rng = Math.random, fetchImpl = fetch }) {
    const w = weekOf(now) - 1;
    if (!(await store.once(`race:${w}`, 90 * 86400))) return { settled: 0 };
    const top = visibleRows(await store.raceTop(w, META.race.top + HIDDEN_NAMES.length), META.race.top);
    const token = env.LEADS_BOT_TOKEN || env.BOT_TOKEN, send = async (chat_id, text) => {
        if (!token || !chat_id) return;
        await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id, text }) }).catch(() => {});
    };
    for (const [i, x] of top.entries()) {
        const { out } = await changeMeta(store, x.id, (s) => racePromo(s, { now, rng, place: i + 1 }));
        if (!out.ok) continue;
        await store.promoIndex(out.result.promo.code, x.id);
        await send(env.LEADS_CHAT_ID, `Гонка недели, ${i + 1} место: код ${out.result.promo.code}, скидка ${META.race.off}% на БАДы. Игрок ${x.id}`);
        if (env.SHIFT_NOTIFY === "1") await send(Number(x.id), `Гонка недели: ${i + 1} место! Твой приз — скидка ${META.race.off}% на БАДы в NS Store.`);
    }
    return { settled: top.length };
}

export async function handleMeta(action, body, who, { store, env = process.env, now = Date.now(), rng = Math.random, fetchImpl = fetch }) {
    const fail = (o) => ({ status: o.status, json: { error: o.error, ...(o.at ? { at: o.at } : {}) } });
    if (action === "meta") {
        if ((await store.rewards(who.id))["boss:3"]) await storyNss(who, { store, now }); // прошёл сюжет раньше, чем появилась награда
        const raw = await store.metaGet(who.id);
        return { status: 200, json: view(raw ? { ...emptyMeta(), ...JSON.parse(raw) } : emptyMeta(), now) };
    }
    if (action === "caseopen") {
        const openId = String(body.openId || "");
        if (!ID_RE.test(openId)) return { status: 400, json: { error: "bad_open" } };
        const { out, state } = await changeMeta(store, who.id, (s) => openCase(s, { caseId: String(body.caseId || ""), openId, now, rng }));
        if (!out.ok) return fail(out);
        const json = { ...out.result, meta: view(state, now) };
        if (out.result.cardsN) { // Карты ведёт отдельный баланс — со своим лимитом и защитой от повтора по openId
            const cfg = cardsConfig(env), c = await store.caseCardGrant(who.id, openId, out.result.cardsN, new Date(now).toISOString().slice(0, 10), cfg.caseDaily, cfg.runTtlSec);
            json.cards = c.cards;
        }
        return { status: 200, json };
    }
    if (action === "shift") {
        const { out, state } = await changeMeta(store, who.id, (s) => collectShift(s, now));
        if (!out.ok) return fail(out);
        await store.shiftDue(who.id, now + META.shift.fullMs);
        await raceAdd(store, who, out.result.nss, now);
        return { status: 200, json: { ...out.result, meta: view(state, now) } };
    }
    if (action === "shiftup") {
        const raw = await store.metaGet(who.id), next = nextShift(raw ? { ...emptyMeta(), ...JSON.parse(raw) } : emptyMeta());
        if (!next) return { status: 409, json: { error: "max" } };
        const paid = await store.cardSpend(who.id, next.price, "");
        if (!paid.ok) return { status: 402, json: { error: "not_enough", cards: paid.cards } };
        const { out, state } = await changeMeta(store, who.id, (s) => upgradeShift(s));
        return out.ok ? { status: 200, json: { ...out.result, cards: paid.cards, meta: view(state, now) } } : fail(out);
    }
    if (action === "promobuy") {
        const { out, state } = await changeMeta(store, who.id, (s) => buyPromo(s, { promoId: String(body.promo || ""), now, rng }));
        if (!out.ok) return fail(out);
        await store.promoIndex(out.result.promo.code, who.id);
        await tellManagers(out.result.promo, who, { env, fetchImpl });
        return { status: 200, json: { ...out.result, meta: view(state, now) } };
    }
    if (action === "bosswin") { // исход боя решает клиент, поэтому проверяем настоящий забег; потолок — bossReward
        const runId = String(body.runId || "");
        if (!/^[a-z0-9]{6,24}$/.test(runId)) return { status: 400, json: { error: "bad_run" } };
        const start = await store.runStart(who.id, runId);
        if (!start || (now - start) / 1000 < META.freeBoss.minSec) return { status: 403, json: { error: "no_run" } };
        const { out, state } = await changeMeta(store, who.id, (s) => bossReward(s, { runId, now }));
        return { status: 200, json: { ...out.result, meta: view(state, now) } };
    }
    if (action === "shiftnotify") {
        const on = !!body.on;
        const { state } = await changeMeta(store, who.id, (s) => { s.notify = on; return { ok: true }; });
        return { status: 200, json: { meta: view(state, now) } };
    }
    return null;
}

// Сообщение бота, когда копилка полная: каждому один раз за смену (следующее — только после нового сбора).
// Запускает cron раз в сутки. Не дошло, потому что игрок не запускал бота или заблокировал его, — больше не пробуем.
export async function notifyShifts({ store, env = process.env, now = Date.now(), fetchImpl = fetch, limit = 150 }) {
    if (env.SHIFT_NOTIFY !== "1" || !env.BOT_TOKEN) return { off: true, sent: 0 };
    let sent = 0;
    const link = env.INVITE_LINK;
    for (const id of await store.shiftDueList(now, limit)) {
        const raw = await store.metaGet(id);
        if (raw && JSON.parse(raw).notify !== false) {
            try {
                const r = await fetchImpl(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ chat_id: Number(id), text: "Никита нашёл кое-что в баке. Копилка полная — забери, пока Мизулина не приехала.", ...(link ? { reply_markup: { inline_keyboard: [[{ text: "Забрать", url: link }]] } } : {}) }),
                });
                if ((await r.json())?.ok) sent++;
            } catch { continue; } // сбой сети — попробуем в следующий запуск
        }
        await store.shiftDueDel(id);
    }
    return { off: false, sent };
}
