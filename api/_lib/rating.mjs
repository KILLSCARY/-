// Рейтинг игроков (с 29.10) — только забег: лучший результат игрока, очки как в игре (Game.score): USDT × 10 + метры.
// Карты, боссы, таблички, место в сотне и задания очков в рейтинг больше не дают (задания остаются — для воронки).
// Результат присылает телефон, поэтому сервер его проверяет (runScore): забег этого игрока (runId из cardrun, сервер
// сам засёк старт), не короче run.minSec, метров не больше, чем пробежать на run.vmax за прошедшее время (+ «Рывок»),
// USDT не больше run.usdtPerM на метр; очки считает сам сервер по метрам и USDT.
// Хранилище: p2p:lbr — sorted set tgId → лучший результат (ZADD GT); p2p:lbn — hash tgId → имя; p2p:lbp — фото;
// p2p:tk:<tgId> — hash задание → метка (HSETNX: второй раз не засчитывается). p2p:lb/p2p:lbs — старая сумма очков, не читается.
export const RATING = {
    run: { vmax: 32, dash: 520, usdtPerM: 4, usdtBase: 150, minSec: 20, ttlSec: 3 * 3600 },
    tasks: { razbor: 0, anketa: 0, invite: 0, store: 0 }, // задания есть, очков за них нет
};
export const STATS = [];

// имя в таблице: имя и первая буква фамилии (ник не показываем)
export function nameOf(user = {}) {
    const n = [user.first_name, user.last_name ? `${user.last_name[0]}.` : ""].filter(Boolean).join(" ").trim();
    return (n || "Игрок").replace(/[<>]/g, "").slice(0, 28);
}

// фото профиля Telegram (photo_url из подписанного initData) — только https с доменов Telegram, иначе без фото (буква имени)
export function photoOf(user = {}) {
    const u = String(user.photo_url || "");
    return /^https:\/\/([a-z0-9-]+\.)*(t\.me|telegram\.org|telesco\.pe)\/[^\s"'<>]{1,400}$/i.test(u) ? u : "";
}

// старые начисления (карты, боссы, таблички, место в сотне, задания) рейтинг больше не двигают — вызовы остались, очков нет
export async function score() {}

// очки за награду, которую сервер выдал впервые (boss:<глава>, sign:<id>)
export function rewardPoints() { return { pts: 0 }; }

export async function backfill() {} // прошлые награды в рейтинг забегов не идут


// Результат забега: { runId, distance (м), usdt }. Очки — max(лучший, usdt × 10 + метры); подозрительный — 403 без записи
export async function runScore(body, who, { store, now }) {
    const R = RATING.run, runId = String(body.runId || "");
    const dist = Math.floor(Number(body.distance)), usdt = Math.floor(Number(body.usdt));
    if (!/^[a-z0-9]{6,24}$/.test(runId)) return { status: 400, json: { error: "bad_run" } };
    if (!Number.isFinite(dist) || !Number.isFinite(usdt) || dist < 0 || usdt < 0) return { status: 400, json: { error: "bad_values" } };
    const start = await store.runStart(who.id, runId);
    if (!start || now - start > R.ttlSec * 1000) return { status: 403, json: { error: "no_run" } };
    const sec = (now - start) / 1000;
    if (sec < R.minSec) return { status: 403, json: { error: "too_fast" } };
    if (dist > R.vmax * sec + R.dash || usdt > dist * R.usdtPerM + R.usdtBase) return { status: 403, json: { error: "implausible" } };
    const pts = usdt * 10 + dist;
    const best = await store.lbBest(who.id, pts, nameOf(who.user), photoOf(who.user));
    return { status: 200, json: { ok: true, score: pts, best } };
}

export async function handleRating(action, body, who, { store, now }) {
    if (action === "runscore") return runScore(body, who, { store, now });
    if (action === "task") {
        const id = String(body.task || "");
        if (id === "razbor") return { status: 400, json: { error: "use_apply" } }; // разбор — только через отправленную заявку (leads.mjs)
        if (id === "invite" || id === "store") return { status: 400, json: { error: "use_check" } }; // друг и подписка — только проверкой (verify.mjs)
        if (!(id in RATING.tasks)) return { status: 400, json: { error: "bad_task" } };
        const fresh = await store.taskOnce(who.id, id, now);
        return { status: 200, json: { ok: true, task: id, fresh, points: 0 } };
    }
    if (action === "top") {
        const n = Math.min(100, Math.max(5, Number(body.n) || 50));
        await store.lbName?.(who.id, nameOf(who.user), photoOf(who.user)); // имя и фото могли поменять в Telegram
        const [top, me, done] = await Promise.all([store.lbTop(n), store.lbMe(who.id), store.tasksDone ? store.tasksDone(who.id) : []]);
        return { status: 200, json: { top, me: { id: who.id, ...me, done: done.filter((t) => t in RATING.tasks) }, rules: { kind: "run" } } };
    }
    return null;
}
