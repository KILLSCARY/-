// Cloudflare Worker: /api/prize и ежедневные задачи; всё остальное — статика из wrangler.jsonc (assets).
// Логика общая с api/_lib; бесплатный тариф даёт 50 внешних запросов на запуск, поэтому итоги гонки и сообщения о копилке идут отдельными cron.
import { ACTIONS } from "../api/prize.mjs";
import { handle } from "../api/_lib/prize.mjs";
import { notifyShifts, settleRace } from "../api/_lib/meta.mjs";
import { getStore } from "../api/_lib/store.mjs";

const RACE_CRON = "0 9 * * *"; // не export: Worker может экспортировать только обработчики
const NOTIFY_LIMIT = 15; // на игрока до 3 запросов: чтение, сообщение, снятие из очереди

const reply = (status, json) => new Response(JSON.stringify(json), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

async function prize(request, env) {
    try {
        const store = getStore(env);
        let r;
        if (request.method === "GET") {
            r = await handle("counter", { initData: new URL(request.url).searchParams.get("initData") || "" }, { store, env });
        } else if (request.method === "POST") {
            const b = await request.json().catch(() => ({}));
            r = await handle(ACTIONS.includes(b?.action) ? b.action : "?", b || {}, { store, env });
        } else r = { status: 405, json: { error: "method" } };
        return reply(r.status, r.json);
    } catch {
        return reply(500, { error: "server" });
    }
}

export default {
    async fetch(request, env) {
        if (new URL(request.url).pathname === "/api/prize") return prize(request, env);
        return env.ASSETS ? env.ASSETS.fetch(request) : new Response("Not found", { status: 404 });
    },
    async scheduled(event, env) {
        const store = getStore(env);
        if (event.cron === RACE_CRON) await settleRace({ store, env });
        else await notifyShifts({ store, env, limit: NOTIFY_LIMIT });
    },
};
