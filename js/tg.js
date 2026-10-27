// Тонкая прослойка над Telegram WebApp. В обычном браузере всё молча работает
// через заглушки и localStorage, поэтому игру можно тестить без Telegram.

const wa = window.Telegram?.WebApp;
const inTelegram = Boolean(wa && wa.initData);
const atLeast = (v) => Boolean(inTelegram && wa.isVersionAtLeast?.(v));

export const tg = {
    inTelegram,
    user: inTelegram ? wa.initDataUnsafe?.user ?? null : null,

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

    haptic(kind = "light") {
        if (atLeast("6.1")) {
            if (kind === "error" || kind === "success" || kind === "warning") wa.HapticFeedback.notificationOccurred(kind);
            else wa.HapticFeedback.impactOccurred(kind);
        } else if (navigator.vibrate) {
            try { navigator.vibrate(kind === "heavy" || kind === "error" ? [40, 40, 40] : 15); } catch {}
        }
    },

    async getBest() {
        let local = 0;
        try { local = Number(localStorage.getItem("p2p_best")) || 0; } catch {}
        if (!atLeast("6.9")) return local;
        const cloud = await new Promise((resolve) => {
            wa.CloudStorage.getItem("best", (err, value) => resolve(err ? 0 : Number(value) || 0));
        });
        return Math.max(local, cloud);
    },

    saveBest(score) {
        try { localStorage.setItem("p2p_best", String(score)); } catch {}
        if (atLeast("6.9")) wa.CloudStorage.setItem("best", String(score), () => {});
    },

    // Профиль игрока (кошелёк, покупки) — JSON с отметкой времени t; из локальной и облачной копии берём свежую
    async loadProfile() {
        let local = null, cloud = null;
        try { local = JSON.parse(localStorage.getItem("p2p_profile") || "null"); } catch {}
        if (atLeast("6.9")) {
            cloud = await new Promise((resolve) => {
                wa.CloudStorage.getItem("profile", (err, value) => {
                    try { resolve(err ? null : JSON.parse(value || "null")); } catch { resolve(null); }
                });
            });
        }
        return (cloud?.t || 0) > (local?.t || 0) ? cloud : local;
    },

    saveProfile(data) {
        const text = JSON.stringify(data);
        try { localStorage.setItem("p2p_profile", text); } catch {}
        if (atLeast("6.9")) wa.CloudStorage.setItem("profile", text, () => {});
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
