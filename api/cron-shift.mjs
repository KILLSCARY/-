// Cron Vercel раз в сутки: итоги гонки недели и сообщения о полной копилке «Ночной смены». Vercel сам присылает заголовок с CRON_SECRET.
import { notifyShifts, settleRace } from "./_lib/meta.mjs";
import { getStore } from "./_lib/store.mjs";

export default async function handler(req, res) {
    res.setHeader("Content-Type", "application/json");
    if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
        res.statusCode = 401;
        return res.end(JSON.stringify({ error: "auth" }));
    }
    try {
        res.statusCode = 200;
        const race = await settleRace({ store: getStore() });
        res.end(JSON.stringify({ race, ...(await notifyShifts({ store: getStore() })) }));
    } catch {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: "server" }));
    }
}
