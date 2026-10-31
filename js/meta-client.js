// Кейсы, NSS и смена со стороны клиента: в Telegram всё решает сервер, вне его (разработка) — те же правила
// на месте, состояние в localStorage. Ответ одинаковой формы: { status, ...результат, meta }.
import { prize } from "./prize.js";
import { emptyMeta, metaView, openCase, collectShift, upgradeShift, runReward, buyPromo, awardOnce, META } from "./meta-rules.mjs";

const KEY = "p2p_meta_local";
const load = () => { try { return { ...emptyMeta(), ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return emptyMeta(); } };
const local = (fn) => {
    const s = load(), out = fn(s), now = Date.now();
    if (!out.ok) return { status: out.status, error: out.error };
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
    return { status: 200, ...out.result, meta: metaView(s, now) };
};

export const metaApi = {
    state() { return prize.online ? prize.meta() : Promise.resolve({ status: 200, ...metaView(load(), Date.now()) }); },
    caseOpen(caseId, openId) { return prize.online ? prize.caseOpen(caseId, openId) : Promise.resolve(local((s) => openCase(s, { caseId, openId, now: Date.now(), rng: Math.random }))); },
    promo(id) { return prize.online ? prize.promoBuy(id) : Promise.resolve(local((s) => buyPromo(s, { promoId: id, now: Date.now(), rng: Math.random }))); },
    // вне Telegram: в сети NSS за забег начисляет сервер при проверке результата (prize.runScore)
    localStory() { return local((s) => awardOnce(s, "story", META.bonus.story)); },
    localRun(runId, distance) { return local((s) => runReward(s, { runId, distance, now: Date.now() })); },
    shift() { return prize.online ? prize.shift() : Promise.resolve(local((s) => collectShift(s, Date.now()))); },
    shiftUp() { return prize.online ? prize.shiftUp() : Promise.resolve(local((s) => upgradeShift(s))); }, // вне Telegram Карты списывает city.js
};
