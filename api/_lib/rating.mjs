// Рейтинг игроков: очки начисляет только сервер — за то, что он сам проверил (карты, боссы, таблички, место в сотне)
// и за разовые задания (записаться на разбор, анкета, приглашение, подписка на NS Store). Клиент очки не передаёт:
// разбор — по доставленной заявке, друг и подписка — проверкой сервера (verify.mjs), анкета — по нажатию.
// Хранилище: p2p:lb — sorted set tgId → очки; p2p:lbn — hash tgId → имя; p2p:lbp — hash tgId → фото (photo_url из initData);
// p2p:lbs — hash «tgId:стат» → счётчик;
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

// фото профиля Telegram (photo_url из подписанного initData) — только https с доменов Telegram, иначе без фото (буква имени)
export function photoOf(user = {}) {
    const u = String(user.photo_url || "");
    return /^https:\/\/([a-z0-9-]+\.)*(t\.me|telegram\.org|telesco\.pe)\/[^\s"'<>]{1,400}$/i.test(u) ? u : "";
}

export async function score(store, who, pts, stat, n = 1) {
    if (!(pts > 0) || !store.lbAdd) return;
    await store.lbAdd(who.id, pts, nameOf(who.user), stat, n, photoOf(who.user));
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

// Из чего сложились очки игрока — тем же расчётом, что и начисление: сделанные задания (done) и раскладка по видам (parts).
// Телефон по done отмечает задания, засчитанные на другом устройстве; parts показывает «За что у тебя очки»
async function partsOf(store, id) {
    const [done, rw, place] = await Promise.all([store.tasksDone ? store.tasksDone(id) : [], store.rewards(id), store.place(id)]);
    const tasks = Object.fromEntries(done.filter((t) => RATING.tasks[t]).map((t) => [t, RATING.tasks[t]]));
    const bosses = Object.fromEntries(Object.keys(rw).filter((k) => k.startsWith("boss:")).map((k) => [k.slice(5), RATING.boss[k.slice(5)] || 0]));
    return { done: Object.keys(tasks), parts: { bosses, tasks, top100: place ? RATING.top100 : 0 } };
}

export async function handleRating(action, body, who, { store, now }) {
    if (action === "task") {
        const id = String(body.task || "");
        if (id === "razbor") return { status: 400, json: { error: "use_apply" } }; // разбор — только через отправленную заявку (leads.mjs)
        if (id === "invite" || id === "store") return { status: 400, json: { error: "use_check" } }; // друг и подписка — только проверкой (verify.mjs)
        const pts = RATING.tasks[id];
        if (!pts) return { status: 400, json: { error: "bad_task" } };
        const fresh = await store.taskOnce(who.id, id, now);
        if (fresh) await score(store, who, pts, "tasks");
        return { status: 200, json: { ok: true, task: id, fresh, points: fresh ? pts : 0 } };
    }
    if (action === "top") {
        const n = Math.min(100, Math.max(5, Number(body.n) || 50));
        await store.lbName?.(who.id, nameOf(who.user), photoOf(who.user)); // имя и фото могли поменять в Telegram
        const [top, me, parts] = await Promise.all([store.lbTop(n), store.lbMe(who.id), partsOf(store, who.id)]);
        return { status: 200, json: { top, me: { id: who.id, ...me, ...parts }, rules: RATING } };
    }
    return null;
}
