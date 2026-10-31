// Вкладки NS Store: «Ночная смена» и промокоды. Числа и правила — js/meta-rules.mjs, ответы — js/meta-client.js.
import { META, shiftLevel } from "./meta-rules.mjs";
import { prize } from "./prize.js";
import { tg } from "./tg.js";
import { NS_STORE_URL } from "./config.js";
import { metaApi } from "./meta-client.js";

const num = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

// ---- ночная смена ----
export function renderShift(hub, box) {
    const m = hub.meta, lvl = shiftLevel(m.shift.lvl), next = META.shift.levels[(m.shift.lvl || 0) + 1];
    const mult = lvl.mult;
    const fill = m.shift.at ? Math.min(1, (Date.now() - m.shift.at) / META.shift.fullMs) : 0;
    const left = m.shift.at + META.shift.fullMs - Date.now(), early = m.shift.at && Date.now() - m.shift.at < META.shift.minMs;
    box.innerHTML = "";
    const card = document.createElement("div");
    card.className = "shift-card";
    card.innerHTML = `<img class="shift-art" src="img/night-shift.webp?v=1" alt="">
        <h3>Ночная смена</h3>
        <p>${m.shift.at ? `Никита дежурит у бака: ${lvl.name}` : "Никита выйдет к баку и будет собирать, пока тебя нет"}</p>
        ${m.shift.at ? `<div class="shift-row"><span>Копилка</span><span>${fill >= 1 ? "полная" : `${Math.round(fill * 100)}% · полная через ${Math.ceil(left / 3600000)} ч`}</span></div>
        <div class="shift-bar"><i style="width:${fill * 100}%"></i></div>
        <div class="shift-row shift-sum"><b>${num(META.shift.usdt * mult * fill)} USDT</b><b class="nss">${Math.floor(META.shift.nss * mult * fill)} NSS</b></div>` : ""}`;
    const go = document.createElement("button");
    go.className = "btn btn-main";
    go.textContent = !m.shift.at ? "Отправить на смену" : early ? "Копилка почти пуста" : "Забрать";
    go.disabled = !!early;
    go.onclick = async () => {
        go.disabled = true;
        const r = await metaApi.shift();
        if (r.status !== 200) { go.disabled = false; return hub.toast("Не получилось, попробуй ещё раз"); }
        hub.meta = r.meta;
        if (r.usdt) hub.p.gift(r.usdt);
        hub.toast(r.started ? "Никита вышел на смену" : `+${num(r.usdt)} USDT · +${r.nss} NSS`);
        hub.game.audio.play(r.started ? "swipe" : "chest");
        hub.render();
    };
    card.append(go);
    box.append(card);

    const up = document.createElement("div");
    up.className = "shift-up";
    if (next?.art) up.classList.add("has-art");
    up.innerHTML = `${next?.art ? `<img src="${next.art}" alt="">` : ""}<div><b>${next ?`Новый бак: ${next.name}` : "Все баки твои"}</b><span>${next ? `Копилка ×${next.mult} вместо ×${lvl.mult}` : `Копилка ×${lvl.mult}`}</span></div>`;
    if (next) {
        const b = document.createElement("button");
        b.className = "btn-small btn-gold";
        b.innerHTML = `<img class="ico-card" src="img/card.svg?v=2" alt="Карты"> ${next.price}`;
        b.disabled = hub.p.cards < next.price;
        b.onclick = async () => {
            if (!prize.online && !hub.p.payCards(next.price)) return hub.toast("Не хватает Карт");
            const r = await metaApi.shiftUp();
            if (r.status !== 200) return hub.toast(r.error === "not_enough" ? "Не хватает Карт" : "Не получилось, попробуй ещё раз");
            hub.meta = r.meta;
            if (typeof r.cards === "number") hub.p.setCards(r.cards);
            hub.toast(`Бак куплен: ${next.name}`);
            hub.game.audio.play("buy");
            hub.render();
        };
        up.append(b);
    }
    box.append(up);
}

// ---- промокоды: единственное, на что тратятся NSS ----
export function renderPromos(hub, box) {
    const m = hub.meta, last = m.promos.filter((x) => !x.race).pop(), now = Date.now();
    const wait = last ? last.at + META.promoEveryMs - now : 0;
    box.innerHTML = "";
    const intro = document.createElement("div");
    intro.className = "promo-intro";
    intro.innerHTML = `<b class="nss">${m.nss} NSS</b><p>NSS дают забеги, смена и Кейс недели. За NSS — скидка на настоящие товары NS Store: один код в неделю, действует 72 часа. На деньги NSS не меняются.</p>`;
    box.append(intro);
    for (const p of META.promos) {
        const row = document.createElement("div");
        row.className = "promo-row";
        row.innerHTML = `<div><b>Скидка ${p.off}% на добавки в магазине НЕ СУЩИЙ STORE</b><i><u style="width:${Math.min(100, m.nss / p.nss * 100)}%"></u></i></div>`;
        const b = document.createElement("button");
        b.className = "btn-small btn-gold";
        b.textContent = `${p.nss} NSS`;
        b.disabled = !META.promosOpen || m.nss < p.nss || wait > 0;
        b.onclick = async () => {
            const r = await metaApi.promo(p.id);
            if (r.status !== 200) return hub.toast(r.error === "wait" ? "Новый код — через неделю после прошлого" : r.error === "not_enough" ? "Не хватает NSS" : "Не получилось, попробуй ещё раз");
            hub.meta = r.meta;
            hub.game.audio.play("record");
            hub.toast(`Твой код: ${r.promo.code}`);
            hub.render();
        };
        row.append(b);
        box.append(row);
    }
    if (!META.promosOpen) {
        box.insertAdjacentHTML("beforeend", `<div class="promo-code"><div><b>NSS-******</b><span>Скоро недельные промокоды</span></div></div>`);
        return;
    }
    if (wait > 0) box.insertAdjacentHTML("beforeend", `<p class="sheet-sub">Следующий код — через ${Math.ceil(wait / 864e5)} дн.</p>`);
    for (const p of [...m.promos].reverse()) {
        const on = p.until > now, c = document.createElement("div");
        c.className = `promo-code${on ? "" : " off"}`;
        c.innerHTML = `<div><b>${p.code}</b><span>${p.race ? `Гонка недели, ${p.place} место · на БАДы · ` : ""}Скидка ${p.off}% · ${on ? `осталось ${Math.ceil((p.until - now) / 3600000)} ч` : "срок вышел"}</span></div>`;
        if (on && !p.race) { // код гонки пока скрыт — использовать нечего
            const copy = document.createElement("button");
            copy.className = "btn-small";
            copy.textContent = "Использовать";
            copy.onclick = () => { navigator.clipboard?.writeText(p.code).catch(() => {}); hub.toast("Код скопирован — назови его менеджеру"); tg.open(NS_STORE_URL); };
            c.append(copy);
        }
        box.append(c);
    }
}
