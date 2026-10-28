// Тонкая прослойка над Telegram WebApp. В обычном браузере всё молча работает
// через заглушки и localStorage, поэтому игру можно тестить без Telegram.

const wa = window.Telegram?.WebApp;
const inTelegram = Boolean(wa && wa.initData);
const atLeast = (v) => Boolean(inTelegram && wa.isVersionAtLeast?.(v));

// CloudStorage иногда отвечает секундами — дольше timeout мс не ждём (undefined — «не дождались», null — пусто/ошибка)
function cloudGet(key, timeout = 2500) {
    return new Promise((resolve) => {
        if (timeout) setTimeout(() => resolve(undefined), timeout);
        wa.CloudStorage.getItem(key, (err, value) => resolve(err ? null : value));
    });
}

export const tg = {
    inTelegram,
    user: inTelegram ? wa.initDataUnsafe?.user ?? null : null,
    // параметр ссылки t.me/bot/app?startapp=… (q — с вопросами, noq — без); в браузере — ?startapp=… в адресе
    startParam: (inTelegram ? wa.initDataUnsafe?.start_param : null) || new URLSearchParams(location.search).get("startapp") || "",

    // На телефоне — во весь экран (Bot API 8.0+): без шапки Telegram, вертикально, свайп вниз не закрывает игру.
    // Отступы под «чёлку» и кнопки Telegram страница берёт из CSS-переменных --tg-safe-area-inset-* и
    // --tg-content-safe-area-inset-*, которые выставляет telegram-web-app.js.
    init() {
        if (!inTelegram) return;
        wa.ready();
        wa.expand();
        if (atLeast("7.7")) wa.disableVerticalSwipes();
        if (atLeast("6.1")) {
            wa.setHeaderColor("#000000");
            wa.setBackgroundColor("#000000");
        }
        if (atLeast("7.10")) wa.setBottomBarColor?.("#000000");
        const mobile = ["android", "ios"].includes(wa.platform);
        if (mobile && atLeast("8.0")) {
            try { wa.requestFullscreen(); } catch {}
            try { wa.lockOrientation(); } catch {}
            wa.onEvent?.("fullscreenFailed", () => wa.expand());
        }
        document.documentElement.classList.add("tg", mobile ? "tg-mobile" : "tg-desktop");
    },

    // Во время забега Telegram спросит подтверждение, если игрок случайно закрывает мини-приложение
    guardClose(on) {
        if (!atLeast("6.2")) return;
        if (on) wa.enableClosingConfirmation();
        else wa.disableClosingConfirmation();
    },

    vibro: true, // настройки: вибрация

    haptic(kind = "light") {
        if (!this.vibro) return;
        if (atLeast("6.1")) {
            if (kind === "error" || kind === "success" || kind === "warning") wa.HapticFeedback.notificationOccurred(kind);
            else wa.HapticFeedback.impactOccurred(kind);
        } else if (navigator.vibrate) {
            try { navigator.vibrate(kind === "heavy" || kind === "error" ? [40, 40, 40] : 15); } catch {}
        }
    },

    // системная кнопка «назад» в шапке Telegram: onBack — показать и повесить обработчик, false — спрятать
    backButton(onBack) {
        if (!atLeast("6.1")) return;
        const bb = wa.BackButton;
        if (this._onBack) bb.offClick(this._onBack);
        this._onBack = onBack || null;
        if (onBack) { bb.onClick(onBack); bb.show(); } else bb.hide();
    },

    localBest() {
        try { return Number(localStorage.getItem("p2p_best")) || 0; } catch { return 0; }
    },

    async getBest() {
        const local = this.localBest();
        if (!atLeast("6.9")) return local;
        const cloud = await cloudGet("best");
        return Math.max(local, Number(cloud ?? 0) || 0);
    },

    saveBest(score) {
        try { localStorage.setItem("p2p_best", String(score)); } catch {}
        if (atLeast("6.9")) wa.CloudStorage.setItem("best", String(score), () => {});
    },

    // Профиль игрока (кошелёк, покупки) — JSON с отметкой времени t; из локальной и облачной копии берём свежую
    // локальная копия — сразу, без ожидания; облачная — потом, если она свежее (см. Profile)
    localProfile() {
        try { return JSON.parse(localStorage.getItem("p2p_profile") || "null"); } catch { return null; }
    },

    // ждём облако без таймаута: если не дождаться и записать поверх, старая копия с этого телефона затрёт свежую
    async cloudProfile() {
        if (!atLeast("6.9")) return null;
        try { return JSON.parse((await cloudGet("profile", 0)) || "null"); } catch { return null; }
    },

    // cloud: false — только в память телефона (пока облачная копия не прочитана)
    saveProfile(data, { cloud = true } = {}) {
        const text = JSON.stringify(data);
        try { localStorage.setItem("p2p_profile", text); } catch {}
        if (cloud && atLeast("6.9")) wa.CloudStorage.setItem("profile", text, () => {});
    },

    share(text, url) {
        const link = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
        if (inTelegram) wa.openTelegramLink(link);
        else window.open(link, "_blank");
    },

    open(url) {
        if (inTelegram && url.startsWith("https://t.me/")) wa.openTelegramLink(url);
        else if (inTelegram) wa.openLink(url);
        else window.open(url, "_blank");
    },
};
