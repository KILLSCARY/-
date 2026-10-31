import test from 'node:test';
import assert from 'node:assert/strict';
import { GUIDE_STEPS, guidePlacement } from '../js/guide.js';

const box = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height });
const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

for (const viewport of [
    { width: 320, height: 568, top: 12, bottom: 12 },
    { width: 390, height: 844, top: 106, bottom: 46 }, // Telegram и вырез экрана
    { width: 844, height: 390, top: 12, bottom: 12 },
    { width: 1366, height: 768, top: 12, bottom: 12 },
]) {
    test(`облачко остаётся на экране ${viewport.width}×${viewport.height}, не перекрывая кнопку`, () => {
        const panel = { width: Math.min(360, viewport.width - 24), height: 225 };
        for (const y of [viewport.top + 10, viewport.height - viewport.bottom - 70]) {
            const target = box(20, y, Math.min(280, viewport.width - 40), 50);
            const p = guidePlacement(target, panel, viewport);
            const card = box(p.panel.left, p.panel.top, panel.width, panel.height);
            assert.ok(card.left >= 8 && card.right <= viewport.width - 8);
            assert.ok(card.top >= viewport.top && card.bottom <= viewport.height - viewport.bottom);
            assert.equal(overlaps(card, target), false);
            assert.ok(p.focus.left >= 8 && p.focus.top >= viewport.top);
            assert.ok(p.focus.left + p.focus.width <= viewport.width - 8);
        }
    });
}

test('частично обрезанная кнопка не создаёт подсветку за границами экрана', () => {
    const p = guidePlacement(box(-20, -10, 200, 70), { width: 296, height: 200 }, { width: 320, height: 568 });
    assert.equal(p.focus.left, 8);
    assert.equal(p.focus.top, 12);
    assert.equal(p.focus.left + p.focus.width, 187);
});

test('комикс объясняет каждый основной раздел и заканчивается управлением у кнопки забега', () => {
    for (const tab of ['heroes', 'cases', 'shop', 'chapters', 'rating', 'map']) {
        assert.ok(GUIDE_STEPS.some(step => step.target?.includes(`data-go="${tab}"`)));
    }
    const last = GUIDE_STEPS.at(-1);
    assert.equal(last.target, '#btn-play');
    assert.equal(last.controls, true);
});

test('обучение начинается с предупреждения: игровые валюты, добавки и что настоящее', () => {
    const first = GUIDE_STEPS[0], text = first.items.flat().join(' ');
    assert.equal(first.notice, true);
    assert.equal(first.target, undefined);
    for (const word of ['USDT', 'NSS', 'Карты', 'БАДы', 'нельзя вывести', 'промокоды']) assert.ok(text.includes(word), word);
    assert.equal(GUIDE_STEPS.filter(step => step.notice).length, 1);
});
