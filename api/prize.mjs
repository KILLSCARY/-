// /api/prize — GET ?initData= (необязательно): счётчик {total, taken, left[, place]};
// POST {action:"event", event:"run:1"|"boss:pavel", initData} — событие прохождения;
// POST {action:"claim", initData} — занять место (идемпотентно, одно на Telegram ID).
// POST {action:"reward", key:"boss:1"|"sign:1.4", initData} — награда один раз: {amount, granted, rewards};
// POST {action:"rewards", initData} — что уже выдано (для синхронизации флагов на клиенте).
// «Карта»: POST {action:"cardrun"} → {runId}; {action:"card", runId} → +1 (≤2 за забег); {action:"cardbuy", item}; {action:"cards"} — баланс.
import { handle } from "./_lib/prize.mjs";
import { getStore } from "./_lib/store.mjs";

async function readBody(req) {
    if (req.body && typeof req.body === "object") return req.body;
    if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch { return {}; } }
    let raw = "";
    for await (const c of req) raw += c;
    try { return JSON.parse(raw || "{}"); } catch { return {}; }
}

export default async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    try {
        let r;
        if (req.method === "GET") {
            const q = new URL(req.url, "http://x").searchParams;
            r = await handle("counter", { initData: q.get("initData") || "" }, { store: getStore() });
        } else if (req.method === "POST") {
            const b = await readBody(req);
            r = await handle(["claim", "event", "reward", "rewards", "cards", "cardrun", "card", "cardbuy", "casecard", "task", "top", "apply"].includes(b.action) ? b.action : "?", b, { store: getStore() });
        } else r = { status: 405, json: { error: "method" } };
        res.statusCode = r.status;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(r.json));
    } catch (e) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "server" }));
    }
}
