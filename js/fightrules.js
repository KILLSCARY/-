// Правила боя без Three.js и DOM — их проверяют тесты (tests/fight.test.mjs), без браузера.
// Идеи: парирование и вторая фаза босса — из Veilspire, урон по зонам — попадание в голову из Blackwater.
import { FIGHT } from "./config.js";

// Парирование: блок, поднятый не раньше чем за FIGHT.parry.window с до удара, отражает его целиком.
// Чтобы окно не ловили частыми нажатиями блока, между подъёмами блока нужна пауза FIGHT.parry.rearm с.
export function raiseBlock(f, now) {
    f.parryAt = now - (f.blockUpAt ?? -99) >= FIGHT.parry.rearm ? now : null;
    f.blockUpAt = now;
}

export function isParry(def, now, unstoppable) {
    return !unstoppable && def.act === "block" && def.parryAt != null && now - def.parryAt <= FIGHT.parry.window;
}

// Вторая фаза: ниже доли FIGHT.phase2.at здоровья соперник злится. У бойца можно выключить (phase2: false)
// или задать свои числа (phase2: { at, speed, tele, heavy }).
export function phase2Of(cfg) {
    return cfg?.phase2 === false ? null : { ...FIGHT.phase2, ...(cfg?.phase2 || {}) };
}

export function inPhase2(hp, hpMax, p2) {
    return !!p2 && hp > 0 && hp / hpMax <= p2.at;
}

// Урон по зоне тапа: голова — FIGHT.zones.head, корпус и кнопки — как есть.
export function zoneDamage(dmg, zone) {
    return Math.round(dmg * (FIGHT.zones[zone] ?? 1));
}
