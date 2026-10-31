// Сервер наград и «первой сотни» (/api/prize). В Telegram флаги боссов и табличек ведёт сервер: клиент только
// просит награду по ключу, сумму и «уже выдано» решает сервер. Вне Telegram (локальная разработка) — локально.
import { tg } from "./tg.js";

const API = "/api/prize";
const post = (body) => fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, initData: tg.initData }) })
    .then((r) => r.json().then((j) => ({ status: r.status, ...j }))).catch(() => ({ status: 0, error: "network" }));

export const prize = {
    get online() { return Boolean(tg.initData); },
    event(event) { if (tg.initData) post({ action: "event", event }); },
    // { status, amount, granted } — granted:false значит уже выдано раньше
    reward(key) { return tg.initData ? post({ action: "reward", key }) : Promise.resolve({ status: 0, error: "no_telegram" }); },
    rewards() { return tg.initData ? post({ action: "rewards" }) : Promise.resolve(null); },
    async counter() {
        try { const r = await fetch(`${API}?initData=${encodeURIComponent(tg.initData || "")}`); return r.ok ? await r.json() : null; } catch { return null; }
    },
    // «Карта»: баланс и выдачу проверяет сервер. cardRun — старт забега (runId), card — +1 за девушку, cardBuy — покупка
    cardRun() { return tg.initData ? post({ action: "cardrun" }) : Promise.resolve(null); },
    card(runId) { return tg.initData ? post({ action: "card", runId }) : Promise.resolve(null); },
    cardBuy(item) { return tg.initData ? post({ action: "cardbuy", item }) : Promise.resolve(null); },
    cards() { return tg.initData ? post({ action: "cards" }) : Promise.resolve(null); }, // баланс и купленные эксклюзивные герои
    // карты из кейса: openId — один раз, сколько и как часто — проверяет сервер
    caseCard(caseId, openId, n) { return tg.initData ? post({ action: "casecard", caseId, openId, n }) : Promise.resolve(null); },
    // кейсы, NSS и «Ночная смена» (api/_lib/meta.mjs): приз, шкалу удачи и баланс NSS решает сервер
    meta() { return tg.initData ? post({ action: "meta" }) : Promise.resolve(null); },
    caseOpen(caseId, openId) { return tg.initData ? post({ action: "caseopen", caseId, openId }) : Promise.resolve(null); },
    promoBuy(promo) { return tg.initData ? post({ action: "promobuy", promo }) : Promise.resolve(null); },
    shift() { return tg.initData ? post({ action: "shift" }) : Promise.resolve(null); },
    bossWin(runId) { return tg.initData && runId ? post({ action: "bosswin", runId }) : Promise.resolve(null); },
    shiftUp() { return tg.initData ? post({ action: "shiftup" }) : Promise.resolve(null); },
    shiftNotify(on) { return tg.initData ? post({ action: "shiftnotify", on }) : Promise.resolve(null); },
    // рейтинг: таблица и место игрока; разовые задания (очки за них даёт сервер один раз)
    top(n = 50) { return tg.initData ? post({ action: "top", n }) : Promise.resolve({ status: 0, error: "no_telegram" }); },
    task(id) { return tg.initData ? post({ action: "task", task: id }) : Promise.resolve(null); },
    // результат забега в рейтинг: runId — от cardRun (сервер засёк старт), метры и USDT; очки и проверку считает сервер
    runScore(runId, distance, usdt) { return tg.initData && runId ? post({ action: "runscore", runId, distance: Math.floor(distance), usdt: Math.floor(usdt) }) : Promise.resolve(null); },
    // заявка на разбор: сервер отправляет её менеджерам; очки за «разбор» — только после доставки
    apply(lead) { return tg.initData ? post({ action: "apply", ...lead }) : Promise.resolve({ status: 0, error: "no_telegram" }); },
    claim() { return tg.initData ? post({ action: "claim" }) : Promise.resolve({ status: 401, error: "no_telegram" }); },
    // проверка действий: подписан ли на канал (спрашивает бот) и сколько друзей пришло по личной ссылке (+ сама ссылка)
    subcheck() { return tg.initData ? post({ action: "subcheck" }) : Promise.resolve({ status: 0, error: "no_telegram" }); },
    refs() { return tg.initData ? post({ action: "refs" }) : Promise.resolve({ status: 0, error: "no_telegram" }); },
};
