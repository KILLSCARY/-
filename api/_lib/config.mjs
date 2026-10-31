// Настройки приза «первым 100» — всё через env, значения по умолчанию ниже.
const num = (v, d) => (v != null && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : d);
export function prizeConfig(env = process.env) {
    return {
        total: num(env.PRIZE_TOTAL, 100),
        // цепочка событий, которая должна быть у игрока к моменту заявки (в этом порядке по времени)
        chain: (env.PRIZE_CHAIN || "run:1,boss:pavel").split(",").map((s) => s.trim()).filter(Boolean),
        minStepSec: num(env.PRIZE_MIN_STEP_SEC, 30), // минимум секунд между соседними событиями цепочки
        minTotalSec: num(env.PRIZE_MIN_TOTAL_SEC, 300), // минимум секунд от первого события до последнего
        initDataMaxAgeSec: num(env.INITDATA_MAX_AGE_SEC, 86400),
    };
}
export const EVENT_RE = /^(run|chapter|boss):[a-z0-9_-]{1,32}$/i;
// минимум секунд от run:<глава> до награды за босса этой главы (нельзя просто дёрнуть API)
export const BOSS_MIN_RUN_SEC = (env = process.env) => (env.BOSS_MIN_RUN_SEC != null && env.BOSS_MIN_RUN_SEC !== "" ? Number(env.BOSS_MIN_RUN_SEC) : 30);
