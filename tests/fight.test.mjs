// node --test tests/*.test.mjs — правила боя без браузера (js/fightrules.js)
import test from "node:test";
import assert from "node:assert/strict";
import { FIGHT, FIGHTERS } from "../js/config.js";
import { raiseBlock, isParry, phase2Of, inPhase2, zoneDamage } from "../js/fightrules.js";

const blocker = (now) => { const f = { act: "block" }; raiseBlock(f, now); return f; };

test("парирование: удар в окне после подъёма блока", () => {
    const f = blocker(10);
    assert.equal(isParry(f, 10 + FIGHT.parry.window - 0.01, false), true);
    assert.equal(isParry(f, 10 + FIGHT.parry.window + 0.01, false), false, "поздно — обычный блок");
});

test("парирование: супер не парируется, без блока — нет", () => {
    const f = blocker(10);
    assert.equal(isParry(f, 10.1, true), false);
    assert.equal(isParry({ ...f, act: "idle" }, 10.1, false), false);
});

test("парирование: частые нажатия блока окно не дают", () => {
    const f = blocker(10);
    raiseBlock(f, 10 + FIGHT.parry.rearm - 0.1);
    assert.equal(isParry(f, 10 + FIGHT.parry.rearm, false), false);
    raiseBlock(f, 20);
    assert.equal(isParry(f, 20.1, false), true, "после паузы окно снова есть");
});

test("вторая фаза: ниже половины здоровья, не в нокауте", () => {
    const p2 = phase2Of(FIGHTERS.pavel);
    assert.equal(inPhase2(51, 100, p2), false);
    assert.equal(inPhase2(50, 100, p2), true);
    assert.equal(inPhase2(0, 100, p2), false);
    assert.equal(inPhase2(10, 100, phase2Of({ phase2: false })), false, "можно выключить у бойца");
    assert.equal(phase2Of({ phase2: { at: 0.3 } }).at, 0.3, "свой порог");
});

test("вторая фаза не делает замах короче, чем успеть среагировать", () => {
    const p2 = phase2Of({});
    for (const [id, f] of Object.entries(FIGHTERS)) for (const t of f.telegraph || [])
        assert.ok(t * p2.tele >= 0.35, `${id}: замах ${(t * p2.tele).toFixed(2)} с`);
});

test("урон в голову сильнее, в корпус как есть", () => {
    assert.equal(zoneDamage(10, "body"), 10);
    assert.equal(zoneDamage(10, "head"), Math.round(10 * FIGHT.zones.head));
    assert.equal(zoneDamage(10, "нет такой"), 10);
});

test("сила героев: сильнейшие как Спиди, дальше Горилла, Дима и Товарус, слабее всех Ислам", () => {
    const power = (id) => FIGHTERS[id === "mouse" ? "mouse" : `hero_${id}`];
    for (const id of ["pavel", "sasha"]) {
        assert.deepEqual(power(id).dmg, FIGHTERS.mouse.dmg);
        assert.equal(power(id).hp, FIGHTERS.mouse.hp);
    }
    const heavy = (id) => power(id).dmg.heavy;
    assert.ok(heavy("mouse") > heavy("gorilla") && heavy("gorilla") > heavy("dima") && heavy("dima") > heavy("islam"));
    assert.equal(heavy("denchik"), heavy("gorilla"), "Денчик бьёт как Горилла");
    assert.ok(power("denchik").punchTime > power("gorilla").punchTime, "но медленнее");
    assert.equal(power("dima").dmg.heavy, power("tovarus").dmg.heavy);
    assert.ok(power("islam").hp < FIGHTERS.mouse.hp);
    for (const f of Object.values(FIGHTERS)) for (const n of Object.values(f.dmg)) assert.ok(n >= 1);
});
