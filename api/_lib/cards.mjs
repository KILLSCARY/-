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
    // тест (30.10.2026): каждому игроку один раз +testCards Карт — при первой проверке баланса или старте забега.
    // Выключить — TEST_CARDS=0 в настройках Vercel (уже выданное остаётся)
    testCards: num(env.TEST_CARDS, 1000),
});
// цены в картах — должны совпадать с CARD_SHOP в js/config.js (клиент только показывает)
export const CARD_PRICES = { x2run: 5, mizlate: 8, magnetrun: 12, dash: 15, hero_dima: 250, hero_tovarus: 250 };
// эксклюзивные герои за карты (HERO_UNLOCKS act "cards" в js/config.js): покупка навсегда — лежит в перках игрока,
// в забег не списывается; повторно за того же героя не берём
const isHero = (item) => item.startsWith("hero_");
const RUN_PERKS = Object.keys(CARD_PRICES).filter((k) => !isHero(k));
const heroesOf = (perks) => Object.keys(perks || {}).filter((k) => isHero(k) && perks[k] > 0).map((k) => k.slice(5));

// Карты из кейсов: Мерчант — 1, Покоритель — 2–3. openId — один раз (атомарно), не больше caseDaily за сутки.
export const CASE_CARDS = { merchant: [1, 1], conqueror: [2, 3] };
export async function handleCards(action, body, who, { store, env = process.env, now = Date.now() }) {
    const cfg = cardsConfig(env);
    if ((action === "cards" || action === "cardrun") && cfg.testCards > 0) await store.cardTestOnce(who.id, cfg.testCards);
    if (action === "cards") return { status: 200, json: { cards: await store.cardBalance(who.id), heroes: heroesOf(await store.perks(who.id)) } };
    if (action === "cardrun") {
        const runId = `${now.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
        await store.cardRunStart(who.id, runId, now, cfg.runTtlSec);
        const perks = await store.perkTake(who.id, RUN_PERKS); // по одному каждого купленного — на этот забег (герои не списываются)
        return { status: 200, json: { runId, perks, cards: await store.cardBalance(who.id), heroes: heroesOf(await store.perks(who.id)) } };
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
        const item = String(body.item || ""), price = CARD_PRICES[item];
        if (!price) return { status: 400, json: { error: "bad_item" } };
        if (isHero(item) && (await store.perks(who.id))[item] > 0) // уже куплен — второй раз не списываем
            return { status: 200, json: { ok: true, item, price: 0, owned: true, cards: await store.cardBalance(who.id), perks: await store.perks(who.id) } };
        const r = await store.cardSpend(who.id, price, String(body.item));
        if (!r.ok) return { status: 402, json: { error: "not_enough", cards: r.cards } };
        return { status: 200, json: { ok: true, item: body.item, price, cards: r.cards, perks: await store.perks(who.id) } };
    }
    return null;
}
