// Заявка на разбор: заполняется в игре, сервер сам отправляет её в чат менеджеров через специального бота.
// Очки рейтинга за «Записаться на разбор» — только после того, как Telegram принял сообщение (не за нажатие кнопки).
// env: LEADS_BOT_TOKEN — бот для заявок (если не задан — BOT_TOKEN игры), LEADS_CHAT_ID — чат/группа менеджеров
// (бота туда нужно добавить), LEADS_COOLDOWN_SEC — не чаще одной заявки за столько секунд (по умолчанию 10 мин).
import { score, RATING } from "./rating.mjs";

const esc = (s) => String(s ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]);
const clip = (s, n) => String(s ?? "").trim().slice(0, n);

export function leadText(who, b) {
    const u = who.user || {};
    const name = [u.first_name, u.last_name].filter(Boolean).join(" ") || "Игрок";
    const lines = [
        "<b>🎯 Заявка на разбор — «Покоритель P2P 3.0»</b>",
        `<b>Кто:</b> <a href="tg://user?id=${who.id}">${esc(name)}</a>${u.username ? ` (@${esc(u.username)})` : ""} · id ${who.id}`,
        `<b>Связь:</b> ${esc(clip(b.contact, 80)) || "—"}`,
    ];
    if (b.note) lines.push(`<b>Комментарий:</b> ${esc(clip(b.note, 400))}`);
    const ak = Array.isArray(b.anketa) ? b.anketa.slice(0, 8) : [];
    if (ak.length) lines.push("<b>Анкета:</b>", ...ak.map(([q, a]) => `• ${esc(clip(q, 80))} — ${esc(clip(a, 80))}`));
    const ph = Array.isArray(b.phrases) ? b.phrases.slice(0, 10).map((x) => clip(x, 40)).filter(Boolean) : [];
    if (ph.length) lines.push(`<b>Кодовые фразы:</b> ${esc(ph.join(", "))}`);
    if (b.code) lines.push(`<b>Код типа:</b> ${esc(clip(b.code, 20))}`);
    if (b.progress) lines.push(`<b>Прогресс:</b> ${esc(clip(b.progress, 120))}`);
    return lines.join("\n");
}

export async function handleLead(body, who, { store, env = process.env, now = Date.now(), fetchImpl = fetch }) {
    const token = env.LEADS_BOT_TOKEN || env.BOT_TOKEN, chat = env.LEADS_CHAT_ID;
    if (!token || !chat) return { status: 503, json: { error: "leads_off" } };
    if (!clip(body.contact, 80)) return { status: 400, json: { error: "no_contact" } };
    const cd = Number(env.LEADS_COOLDOWN_SEC ?? 600);
    if (!(await store.leadGate(who.id, now, cd))) return { status: 429, json: { error: "too_often" } };
    let ok = false;
    try {
        const r = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chat, text: leadText(who, body), parse_mode: "HTML", disable_web_page_preview: true }),
        });
        ok = Boolean((await r.json())?.ok);
    } catch {}
    if (!ok) { await store.leadGate(who.id, 0, 0, true); return { status: 502, json: { error: "send_failed" } }; } // не дошло — можно сразу ещё раз
    const fresh = await store.taskOnce(who.id, "razbor", now);
    if (fresh) await score(store, who, RATING.tasks.razbor, "tasks");
    return { status: 200, json: { ok: true, points: fresh ? RATING.tasks.razbor : 0 } };
}
