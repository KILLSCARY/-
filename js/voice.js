import { VOICE_REVIEWS } from "./config.js";

// ГС-отзывы героев прямо в карточке (раздел «Герои»): на лице — голосовое, как в Telegram (кнопка, волна, время),
// на обороте — расшифровка. Записи настоящие (VOICE_REVIEWS). Играет одно за раз, музыка меню на это время стихает
const BARS = 26; // столько полос в волне
const PLAY = '<path d="M8 5v14l11-7z"/>', PAUSE = '<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>';
const time = (s) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "—:—");
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);

// волна — не настоящая форма звука, а узор, свой у каждого героя (одинаковый при каждом открытии)
function wave(id) {
    let seed = [...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) || 1;
    const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
    return Array.from({ length: BARS }, (_, i) => `<i style="height:${Math.round(18 + 82 * rnd() * (0.55 + 0.45 * Math.sin(i / BARS * Math.PI)))}%;--i:${i}"></i>`).join("");
}

// длительность голосового Telegram (Ogg Opus): в заголовке её нет, и браузер отдаёт Infinity — тогда время, прогресс
// и перемотка не работали. Берём из файла: позиция последней страницы Ogg (в отсчётах 48 кГц) минус pre-skip из OpusHead
export function oggDuration(bytes) {
    const ogg = (i) => bytes[i] === 0x4f && bytes[i + 1] === 0x67 && bytes[i + 2] === 0x67 && bytes[i + 3] === 0x53;
    let last = -1;
    for (let i = bytes.length - 27; i >= 0 && last < 0; i--) if (ogg(i)) last = i;
    if (last < 0) return NaN;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let skip = 0;
    for (let i = 0; i < Math.min(bytes.length - 12, 512); i++) {
        if (String.fromCharCode(...bytes.subarray(i, i + 8)) === "OpusHead") { skip = view.getUint16(i + 10, true); break; }
    }
    return Math.max(0, Number(view.getBigUint64(last + 6, true)) - skip) / 48000;
}

export const voiceFor = (hero) => VOICE_REVIEWS.find((v) => v.hero === hero);

// голосовое на лице карточки: data-voice — id героя, оживляет HeroVoices.bind
export function voiceBubble(hero) {
    if (!voiceFor(hero)) return "";
    return `<div class="hvoice" data-voice="${esc(hero)}" style="--n:${BARS}"><button class="vm-play" type="button" aria-label="Слушать голосовое"><svg viewBox="0 0 24 24" aria-hidden="true">${PLAY}</svg></button>
        <div class="vm-wave" aria-hidden="true">${wave(hero)}</div><span class="vm-time">—:—</span></div>`;
}

// расшифровка — на обороте карточки
export function voiceText(hero) {
    const v = voiceFor(hero);
    return v?.text ? `<div class="hb-voice"><span>Из голосового</span><p>«${esc(v.text)}»</p></div>` : "";
}

export class HeroVoices {
    // hub — чтобы неактивную карточку по тапу на голосовое сначала вывести в центр (goTo), а не играть сбоку
    constructor(hub) {
        this.hub = hub;
        this.playing = null;
        this.audios = [];
    }

    // после перерисовки карусели: плееры в новых карточках, записи старых отпускаем
    bind(root) {
        this.stop();
        this.release();
        for (const el of root.querySelectorAll(".hvoice")) this.attach(el, voiceFor(el.dataset.voice));
    }

    attach(el, v) {
        const audio = new Audio();
        audio.preload = "metadata";
        audio.src = v.file;
        this.audios.push(audio);
        const label = el.querySelector(".vm-time"), btn = el.querySelector(".vm-play"), p = { audio, el, btn };
        let known = NaN; // длительность из файла, когда браузер её не знает (Ogg Opus)
        const dur = () => (Number.isFinite(audio.duration) ? audio.duration : known);
        audio.onloadedmetadata = () => { if (Number.isFinite(dur())) label.textContent = time(dur()); };
        // голосовые Telegram маленькие (десятки КБ): длительность читаем из файла сразу, не дожидаясь плеера
        if (/\.ogg$/i.test(v.file)) fetch(v.file).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject())).then((b) => {
            known = oggDuration(new Uint8Array(b));
            if (this.playing?.audio !== audio && !el.classList.contains("broken")) label.textContent = time(dur());
        }).catch(() => {});
        audio.onerror = () => { if (!audio.getAttribute("src")) return; el.classList.add("broken"); btn.disabled = true; label.textContent = "нет записи"; };
        audio.ontimeupdate = () => {
            el.style.setProperty("--p", dur() ? Math.min(1, audio.currentTime / dur()) : 0);
            label.textContent = time(audio.paused ? dur() : audio.currentTime);
        };
        audio.onended = () => this.stop();
        // касания голосового — только ему: карточка не переворачивается и не ловит свайп оборота
        for (const type of ["touchstart", "touchend", "pointerdown"]) el.addEventListener(type, (e) => e.stopPropagation());
        el.addEventListener("click", (e) => {
            e.stopPropagation();
            const card = el.closest(".hcard");
            if (card && !card.classList.contains("active")) return this.hub.goTo(card.dataset.id); // сбоку — сначала в центр
            if (btn.disabled) return;
            const bar = e.target.closest(".vm-wave");
            if (bar && dur()) { // тап по волне — перемотка
                const r = bar.getBoundingClientRect();
                audio.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur();
                if (this.playing?.audio !== audio) this.play(p);
                return;
            }
            if (this.playing?.audio === audio) this.stop();
            else this.play(p);
        });
    }

    play(p) {
        this.stop();
        this.playing = p;
        this.music = this.hub.game.audio.mode;
        this.hub.game.audio.music("off"); // голос важнее музыки меню
        p.el.classList.add("on");
        p.btn.setAttribute("aria-label", "Пауза");
        p.btn.firstElementChild.innerHTML = PAUSE;
        p.audio.play().catch(() => this.stop());
    }

    // пауза: позиция остаётся; дослушал — с начала
    stop() {
        const p = this.playing;
        if (!p) return;
        this.playing = null;
        p.audio.pause();
        p.el.classList.remove("on");
        p.btn.setAttribute("aria-label", "Слушать голосовое");
        p.btn.firstElementChild.innerHTML = PLAY;
        if (p.audio.ended) { p.audio.currentTime = 0; p.el.style.setProperty("--p", 0); }
        this.hub.game.audio.music(this.music || "menu");
    }

    release() {
        for (const a of this.audios) { a.removeAttribute("src"); a.load(); }
        this.audios = [];
    }
}
