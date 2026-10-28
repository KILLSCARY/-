// «Карта» — редкая валюта, баланс ведёт сервер (Telegram ID из подписанного initData).
// Забег: cardrun → сервер выдаёт runId и сам засекает старт. card {runId} — +1, только если: забег этого игрока,
// не больше CARDS_SRV.perRun за забег, с начала забега прошло ≥ firstSec (первая девушка — после 1000 м),
// между картами ≥ gapSec. cardbuy {item} — цена берётся только из CARD_PRICES сервера. Обмена карт на USDT нет.
const num = (v, d) => (v != null && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : d);
export const cardsConfig = (env = process.env) => ({
    perRun: num(env.CARDS_PER_RUN, 2),
    firstSec: num(env.CARDS_FIRST_SEC, 40),  // 1000 м на стартовой скорости — больше 40 с
    gapSec: num(env.CARDS_GAP_SEC, 25),      // вторая — через 700+ м
    runTtlSec: num(env.CARDS_RUN_TTL_SEC, 3 * 3600),
});
// цены в картах — должны совпадать с CARD_SHOP в js/config.js (клиент только показывает)
export const CARD_PRICES = { x2run: 5, mizlate: 8, magnetrun: 12, dash: 15 };

export async function handleCards(action, body, who, { store, env = process.env, now = Date.now() }) {
    const cfg = cardsConfig(env);
    if (action === "cards") return { status: 200, json: { cards: await store.cardBalance(who.id) } };
    if (action === "cardrun") {
        const runId = `${now.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
        await store.cardRunStart(who.id, runId, now, cfg.runTtlSec);
        return { status: 200, json: { runId, cards: await store.cardBalance(who.id) } };
    }
    if (action === "card") {
        const runId = String(body.runId || "");
        if (!/^[a-z0-9]{6,24}$/.test(runId)) return { status: 400, json: { error: "bad_run" } };
        const r = await store.cardGrant(who.id, runId, now, cfg);
        if (!r.ok) return { status: 403, json: { error: r.reason, cards: r.cards } };
        return { status: 200, json: { ok: true, cards: r.cards, inRun: r.count } };
    }
    if (action === "cardbuy") {
        const price = CARD_PRICES[String(body.item || "")];
        if (!price) return { status: 400, json: { error: "bad_item" } };
        const r = await store.cardSpend(who.id, price);
        if (!r.ok) return { status: 402, json: { error: "not_enough", cards: r.cards } };
        return { status: 200, json: { ok: true, item: body.item, price, cards: r.cards } };
    }
    return null;
}
