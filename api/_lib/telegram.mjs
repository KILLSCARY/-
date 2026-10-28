// Проверка подписи Telegram WebApp initData (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app)
import crypto from "node:crypto";

export function verifyInitData(initData, botToken, maxAgeSec = 86400, now = Date.now()) {
    if (!initData || typeof initData !== "string" || !botToken) return null;
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) return null;
    params.delete("hash");
    const dataCheck = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join("\n");
    const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
    const calc = crypto.createHmac("sha256", secret).update(dataCheck).digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(calc, "hex"), Buffer.from(hash, "hex"))) return null;
    const authDate = Number(params.get("auth_date"));
    if (!authDate || (maxAgeSec > 0 && now / 1000 - authDate > maxAgeSec)) return null;
    let user;
    try { user = JSON.parse(params.get("user") || "null"); } catch { return null; }
    if (!user || !Number.isSafeInteger(user.id)) return null;
    return { id: String(user.id), user, authDate, startParam: params.get("start_param") || "" };
}

// для тестов: подписать initData так же, как это делает Telegram
export function signInitData(fields, botToken) {
    const params = new URLSearchParams(fields);
    const dataCheck = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join("\n");
    const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
    params.set("hash", crypto.createHmac("sha256", secret).update(dataCheck).digest("hex"));
    return params.toString();
}
