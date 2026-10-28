import { score, RATING } from "./rating.mjs";
// «Карта» — редкая валюта, баланс ведёт сервер (Telegram ID из подписанного initData).
// Забег: cardrun → сервер выдаёт runId и сам засекает старт. card {runId} — +1, только если: забег этого игрока,
// не больше CARDS_SRV.perRun за забег, с начала забега прошло ≥ firstSec (первая девушка — около 300 м),
// между картами ≥ gapSec. cardbuy {item} — цена берётся только из CARD_PRICES сервера. Обмена карт на USDT нет.
const num = (v, d) => (v != null && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : d);
export const cardsConfig = (env = process.env) => ({
    perRun: num(env.CARDS_PER_RUN, 2),
    firstSec: num(env.CARDS_FIRST_SEC, 15),  // 300 м на стартовой скорости (13 м/с) — больше 20 с
    gapSec: num(env.CARDS_GAP_SEC, 12),      // вторая — через 500+ м
    caseDaily: num(env.CARDS_CASE_DAILY, 5), // сколько раз в сутки кейс может дать карты
    runTtlSec: num(env.CARDS_RUN_TTL_SEC, 3 * 3600),
});
// цены в картах — должны совпадать с CARD_SHOP в js/config.js (клиент только показывает)
export const CARD_PRICES = { x2run: 5, mizlate: 8, magnetrun: 12, dash: 15 };

// Карты из кейсов: Мерчант — 1, Покоритель — 2–3. openId — один раз (атомарно), не больше caseDaily за сутки.
export const CASE_CARDS = { merchant: [1, 1], conqueror: [2, 3] };
export async function handleCards(action, body, who, { store, env = process.env, now = Date.now() }) {
    const cfg = cardsConfig(env);
    if (action === "cards") return { status: 200, json: { cards: await store.cardBalance(who.id) } };
    if (action === "cardrun") {
        const runId = `${now.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
        await store.cardRunStart(who.id, runId, now, cfg.runTtlSec);
        const perks = await store.perkTake(who.id, Object.keys(CARD_PRICES)); // по одному каждого купленного — на этот забег
        return { status: 200, json: { runId, perks, cards: await store.cardBalance(who.id) } };
    }
    if (action === "card") {
        const runId = String(body.runId || "");
        if (!/^[a-z0-9]{6,24}$/.test(runId)) return { status: 400, json: { error: "bad_run" } };
        const r = await store.cardGrant(who.id, runId, now, cfg);
        if (!r.ok) return { status: 403, json: { error: r.reason, cards: r.cards } };
        await score(store, who, RATING.card, "cards");
        return { status: 200, json: { ok: true, cards: r.cards, inRun: r.count } };
    }
    if (action === "casecard") {
        const range = CASE_CARDS[String(body.caseId || "")];
        if (!range) return { status: 400, json: { error: "bad_case" } };
        const openId = String(body.openId || "");
        if (!/^[a-z0-9]{6,24}$/.test(openId)) return { status: 400, json: { error: "bad_open" } };
        const n = Math.min(range[1], Math.max(range[0], Math.floor(Number(body.n) || range[0])));
        const day = new Date(now).toISOString().slice(0, 10);
        const r = await store.caseCardGrant(who.id, openId, n, day, cfg.caseDaily, cfg.runTtlSec);
        if (!r.ok) return { status: 403, json: { error: r.reason, cards: r.cards } };
        await score(store, who, RATING.card * n, "cards", n);
        return { status: 200, json: { ok: true, n, cards: r.cards } };
    }
    if (action === "cardbuy") {
        const price = CARD_PRICES[String(body.item || "")];
        if (!price) return { status: 400, json: { error: "bad_item" } };
        const r = await store.cardSpend(who.id, price, String(body.item));
        if (!r.ok) return { status: 402, json: { error: "not_enough", cards: r.cards } };
        return { status: 200, json: { ok: true, item: body.item, price, cards: r.cards, perks: await store.perks(who.id) } };
    }
    return null;
}
