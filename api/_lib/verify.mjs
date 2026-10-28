// Проверка действий игрока — сервер сам спрашивает Telegram, а не верит кнопке в игре.
// Подписка на канал: бот вызывает getChatMember (бота нужно сделать админом канала — иначе Telegram не отвечает).
// Приглашение: у каждого своя ссылка …?startapp=ref_<id>; друг засчитывается, когда по ней впервые открыл игру
// новый игрок (start_param приходит в подписанном initData, подделать нельзя).
// env: SUB_CHANNEL — канал (по умолчанию @Nesuschiystore), SUB_BOT_TOKEN — бот проверки (по умолчанию BOT_TOKEN),
// INVITE_LINK — ссылка на мини-приложение (https://t.me/<бот>/<app>; по умолчанию https://t.me/<бот> по getMe).
import { score, RATING } from "./rating.mjs";

const MEMBER = new Set(["creator", "administrator", "member"]);
export const REF_RE = /^ref_(\d{1,20})$/;

async function tgApi(token, method, params, fetchImpl) {
    const r = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(params),
    });
    return r.json();
}

// подписан ли игрок на канал; первый раз — очки рейтинга за задание «Подписаться на NS Store»
export async function checkSub(who, { store, env = process.env, now = Date.now(), fetchImpl = fetch }) {
    const token = env.SUB_BOT_TOKEN || env.BOT_TOKEN, chat = env.SUB_CHANNEL || "@Nesuschiystore";
    if (!token) return { status: 503, json: { error: "sub_off" } };
    let j;
    try { j = await tgApi(token, "getChatMember", { chat_id: chat, user_id: Number(who.id) }, fetchImpl); } catch { return { status: 502, json: { error: "tg_failed" } }; }
    // бот не админ канала или канал не найден — проверить нельзя (не «не подписан»)
    if (!j?.ok) return { status: 503, json: { error: "sub_off", reason: String(j?.description || "").slice(0, 120) } };
    const st = j.result?.status;
    const subscribed = MEMBER.has(st) || (st === "restricted" && Boolean(j.result.is_member));
    let points = 0;
    if (subscribed && (await store.taskOnce(who.id, "store", now))) {
        points = RATING.tasks.store;
        await score(store, who, points, "tasks");
    }
    return { status: 200, json: { subscribed, points } };
}

// новичок — тот, о ком сервер ничего не знает: ни событий, ни наград, ни карт, ни очков
async function isNew(store, id) {
    const [ev, rw, cards, me] = await Promise.all([store.events(id), store.rewards(id), store.cardBalance(id), store.lbMe(id)]);
    return !Object.keys(ev).length && !Object.keys(rw).length && !cards && !me.score;
}

// на каждый подписанный запрос: пришёл по ссылке друга (ref_<id>) и он новичок — засчитать другу (один раз на новичка).
// Вызывается до любых записей этого запроса — иначе новичок перестал бы быть новичком
export async function trackRef(who, { store, now = Date.now() }) {
    const m = REF_RE.exec(who.startParam || "");
    if (!m || m[1] === who.id) return false;
    if (await store.refOf(who.id)) return false; // уже засчитан (или уже решили, что он не новичок)
    if (!(await isNew(store, who.id))) { await store.refSkip(who.id); return false; } // старый игрок по чужой ссылке — не считаем и больше не проверяем
    return store.refAdd(m[1], who.id, now);
}

let botName = null; // username бота — для ссылки-приглашения, спрашиваем у Telegram один раз
async function inviteLink(who, env, fetchImpl) {
    let base = env.INVITE_LINK || "";
    if (!base && env.BOT_TOKEN) {
        if (botName === null) { try { const j = await tgApi(env.BOT_TOKEN, "getMe", {}, fetchImpl); botName = j?.ok ? j.result.username || "" : ""; } catch { botName = ""; } }
        if (botName) base = `https://t.me/${botName}`;
    }
    return base ? `${base}${base.includes("?") ? "&" : "?"}startapp=ref_${who.id}` : null;
}

// сколько друзей пришло по ссылке игрока, его ссылка и (первый раз, когда пришёл хоть один) очки за «Позвать друга»
export async function refStatus(who, { store, env = process.env, now = Date.now(), fetchImpl = fetch }) {
    const invited = await store.refCount(who.id);
    let points = 0;
    if (invited > 0 && (await store.taskOnce(who.id, "invite", now))) {
        points = RATING.tasks.invite;
        await score(store, who, points, "tasks");
    }
    return { status: 200, json: { invited, points, link: await inviteLink(who, env, fetchImpl) } };
}
