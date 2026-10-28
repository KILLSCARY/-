// Награды, которые выдаёт только сервер, — один раз на Telegram ID. Суммы здесь, клиент их не передаёт.
// boss:<глава> — победа над боссом главы; sign:<id таблички> — первый верный ответ на табличку главы.
export const BOSS_REWARDS = { 1: 3000, 2: 6000, 3: 12000 };
const SIGN_BY_CHAPTER = { 1: 250, 2: 500, 3: 1000 };
export const SIGNS = ["1.1", "1.2", "1.3", "1.4", "2.1", "2.2", "2.3", "2.4", "3.1", "3.2", "3.3", "3.4"];
export const REWARD_RE = /^(boss:[1-3]|sign:[1-3]\.[1-4])$/;

export function rewardAmount(key) {
    if (!REWARD_RE.test(key)) return 0;
    const [kind, v] = key.split(":");
    return kind === "boss" ? BOSS_REWARDS[v] : SIGN_BY_CHAPTER[v.split(".")[0]];
}
