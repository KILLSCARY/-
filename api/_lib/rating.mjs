// Рейтинг игроков: очки начисляет только сервер — за то, что он сам проверил (карты, боссы, таблички, место в сотне)
// и за разовые задания (записаться на разбор, анкета, приглашение, NS Store). Клиент очки не передаёт.
// Хранилище: p2p:lb — sorted set tgId → очки; p2p:lbn — hash tgId → имя; p2p:lbs — hash «tgId:стат» → счётчик;
// p2p:tk:<tgId> — hash задание → метка (HSETNX: второй раз очки не даёт).
export const RATING = {
    card: 10,
    boss: { 1: 100, 2: 200, 3: 400 },
    sign: 20,
    top100: 150,
    tasks: { razbor: 50, anketa: 30, invite: 20, store: 10 },
};
export const STATS = ["cards", "bosses", "signs", "tasks"];

// имя в таблице: имя и первая буква фамилии (ник не показываем)
export function nameOf(user = {}) {
    const n = [user.first_name, user.last_name ? `${user.last_name[0]}.` : ""].filter(Boolean).join(" ").trim();
    return (n || "Игрок").replace(/[<>]/g, "").slice(0, 28);
}

export async function score(store, who, pts, stat, n = 1) {
    if (!(pts > 0) || !store.lbAdd) return;
    await store.lbAdd(who.id, pts, nameOf(who.user), stat, n);
}

// очки за награду, которую сервер выдал впервые (boss:<глава>, sign:<id>)
export function rewardPoints(key) {
    const [kind, v] = key.split(":");
    if (kind === "boss") return { pts: RATING.boss[v] || 0, stat: "bosses" };
    if (kind === "sign") return { pts: RATING.sign, stat: "signs" };
    return { pts: 0 };
}

// Один раз на игрока: очки за то, что сервер выдал до появления рейтинга — боссы, таблички, место в сотне, карты на балансе
export async function backfill(store, who, now) {
    if (!store.lbOnce || !(await store.lbOnce(who.id, now))) return;
    const rw = await store.rewards(who.id);
    for (const key of Object.keys(rw)) { const r = rewardPoints(key); await score(store, who, r.pts, r.stat); }
    if (await store.place(who.id)) await score(store, who, RATING.top100, "tasks");
    const cards = await store.cardBalance(who.id);
    if (cards > 0) await score(store, who, RATING.card * cards, "cards", cards);
}

export async function handleRating(action, body, who, { store, now }) {
    if (action === "task") {
        const id = String(body.task || "");
        if (id === "razbor") return { status: 400, json: { error: "use_apply" } }; // разбор — только через отправленную заявку (leads.mjs)
        const pts = RATING.tasks[id];
        if (!pts) return { status: 400, json: { error: "bad_task" } };
        const fresh = await store.taskOnce(who.id, id, now);
        if (fresh) await score(store, who, pts, "tasks");
        return { status: 200, json: { ok: true, task: id, fresh, points: fresh ? pts : 0 } };
    }
    if (action === "top") {
        const n = Math.min(100, Math.max(5, Number(body.n) || 50));
        await store.lbName?.(who.id, nameOf(who.user)); // имя могли поменять в Telegram
        return { status: 200, json: { top: await store.lbTop(n), me: { id: who.id, ...(await store.lbMe(who.id)) }, rules: RATING } };
    }
    return null;
}
