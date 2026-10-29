// Логика приза без HTTP — чтобы тестировать напрямую. Клиенту не доверяем: только подписанный initData и события,
// которые сервер сам записал по ходу игры со своими метками времени.
import { verifyInitData } from "./telegram.mjs";
import { prizeConfig, EVENT_RE, BOSS_MIN_RUN_SEC } from "./config.mjs";
import { rewardAmount } from "./rewards.mjs";
import { handleCards } from "./cards.mjs";
import { handleRating, score, rewardPoints, RATING, backfill } from "./rating.mjs";
import { handleLead } from "./leads.mjs";
import { checkSub, refStatus, trackRef } from "./verify.mjs";

export function checkChain(events, cfg) {
    let prev = null, first = null;
    for (const e of cfg.chain) {
        const t = events[e];
        if (!t) return { ok: false, reason: `missing:${e}` };
        if (prev != null && t - prev < cfg.minStepSec * 1000) return { ok: false, reason: `too_fast:${e}` };
        if (first == null) first = t;
        prev = t;
    }
    if (prev - first < cfg.minTotalSec * 1000) return { ok: false, reason: "too_fast:total" };
    return { ok: true };
}

export async function handle(action, body, { store, env = process.env, now = Date.now(), fetchImpl = fetch }) {
    const cfg = prizeConfig(env);
    const counter = async () => { const taken = Math.min(cfg.total, await store.taken()); return { total: cfg.total, taken, left: cfg.total - taken }; };
    if (action === "counter") {
        const out = await counter();
        const who = body?.initData ? verifyInitData(body.initData, env.BOT_TOKEN, cfg.initDataMaxAgeSec, now) : null;
        if (who) out.place = await store.place(who.id);
        return { status: 200, json: out };
    }
    const who = verifyInitData(body?.initData, env.BOT_TOKEN, cfg.initDataMaxAgeSec, now);
    if (!who) return { status: 401, json: { error: "bad_init_data" } };
    await trackRef(who, { store, now }); // пришёл по ссылке друга — засчитать другу (до любых записей: новичок ещё «чистый»)
    await backfill(store, who, now); // первый запрос игрока — прошлые награды в рейтинг (до новых начислений, без двойного счёта)
    if (action === "subcheck") return checkSub(who, { store, env, now, fetchImpl });
    if (action === "refs") return refStatus(who, { store, env, now, fetchImpl });
    if (action === "event") {
        const ev = String(body.event || "");
        if (!EVENT_RE.test(ev)) return { status: 400, json: { error: "bad_event" } };
        await store.addEvent(who.id, ev, now);
        return { status: 200, json: { ok: true } };
    }
    // награда босса/таблички: выдаётся один раз (HSETNX), повтор — granted:false и та же сумма не начисляется
    if (action === "reward") {
        const key = String(body.key || "");
        const amount = rewardAmount(key);
        if (!amount) return { status: 400, json: { error: "bad_key" } };
        if (key.startsWith("boss:")) {
            const ch = key.slice(5), started = (await store.events(who.id))[`run:${ch}`];
            if (!started || now - started < BOSS_MIN_RUN_SEC(env) * 1000) return { status: 403, json: { error: "chain", reason: `missing:run:${ch}` } };
        }
        const fresh = await store.grant(who.id, key, amount, now);
        if (fresh) { const r = rewardPoints(key); await score(store, who, r.pts, r.stat); } // рейтинг — только за первую выдачу
        return { status: 200, json: { key, amount, granted: fresh, rewards: await store.rewards(who.id) } };
    }
    if (["cards", "cardrun", "card", "cardbuy", "casecard"].includes(action)) return handleCards(action, body, who, { store, env, now });
    if (action === "apply") return handleLead(body, who, { store, env, now, fetchImpl });
    if (action === "task" || action === "top" || action === "runscore") return handleRating(action, body, who, { store, now });
    if (action === "rewards") return { status: 200, json: { rewards: await store.rewards(who.id) } };
    if (action === "claim") {
        const had = await store.place(who.id);
        if (!had) {
            const chk = checkChain(await store.events(who.id), cfg);
            if (!chk.ok) return { status: 403, json: { error: "chain", reason: chk.reason } };
        }
        const { place, fresh } = await store.claim(who.id, cfg.total);
        if (fresh) await score(store, who, RATING.top100, "tasks");
        const c = await counter();
        if (!place) return { status: 200, json: { ...c, place: 0, soldOut: true } };
        return { status: 200, json: { ...c, place, left: cfg.total - place } };
    }
    return { status: 404, json: { error: "unknown" } };
}
