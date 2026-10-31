import test from "node:test";
import assert from "node:assert/strict";
import { questsFor, questList, questAdd, questClaim, questClaimBonus, questReady } from "../js/quests.mjs";
import { DAILY_QUESTS } from "../js/config.js";

const DAY = "Sun Nov 01 2026", ids = (day) => questsFor(day).map((q) => q.id);

test("на день три разных задания, у всех одинаковые, в другой день набор меняется", () => {
    assert.equal(new Set(ids(DAY)).size, DAILY_QUESTS.count);
    assert.deepEqual(ids(DAY), ids(DAY));
    const days = Array.from({ length: 14 }, (_, i) => ids(`day ${i}`).join());
    assert.ok(new Set(days).size > 3);
});

test("награда только за выполненное и только один раз, бонус — за все три", () => {
    const d = {}, list = questList(d, DAY);
    assert.equal(questClaim(d, list[0].id, DAY), 0, "не выполнено");
    assert.equal(questReady(d, DAY), 0);
    for (const q of list) questAdd(d, q.id, q.goal, "sum", DAY);
    assert.equal(questReady(d, DAY), 3);
    assert.equal(questClaimBonus(d, DAY), 0, "бонус раньше наград");
    for (const q of list) assert.equal(questClaim(d, q.id, DAY), q.usdt);
    assert.equal(questClaim(d, list[0].id, DAY), 0, "второй раз нельзя");
    assert.equal(questReady(d, DAY), 1);
    assert.equal(questClaimBonus(d, DAY), DAILY_QUESTS.bonus);
    assert.equal(questClaimBonus(d, DAY), 0);
    assert.equal(questReady(d, DAY), 0);
});

test("метры считаются лучшим забегом, остальное копится; новый день начинается с нуля", () => {
    const d = {};
    questAdd(d, "dist", 400, "max", DAY);
    questAdd(d, "dist", 300, "max", DAY);
    questAdd(d, "jump", 2, "sum", DAY);
    questAdd(d, "jump", 3, "sum", DAY);
    assert.equal(d.quests.got.dist, 400);
    assert.equal(d.quests.got.jump, 5);
    questAdd(d, "jump", 1, "sum", "Mon Nov 02 2026");
    assert.equal(d.quests.got.jump, 1);
    assert.equal(d.quests.got.dist, undefined);
});
