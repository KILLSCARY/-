import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = {};
globalThis.location = { search: '' };
globalThis.localStorage = { getItem() { return null; }, setItem() {} };

const { Profile } = await import('../js/profile.js');
const { CHAPTERS, STORIES } = await import('../js/config.js');

test('три последовательные главы завершаются обычными боями', () => {
    assert.deepEqual(CHAPTERS.map(c => c.boss), ['mizulina', 'cop', 'pavel']);
    assert.deepEqual(STORIES.map(s => s.chapter), [1, 2, 3]);
    assert.ok(STORIES.every(s => !s.exam));
});

test('старый профиль сохраняет валюту, награды, фразы и пройденные сюжетные бои', async () => {
    const p = new Profile(); await p.ready;
    p.load({ beaten: 4, story: 1, earned: 52000, usdt: 42, chests: 2, bossPaid: { 1: 1 }, heroes: ['sasha'] });
    assert.equal(p.chapter().index, 1);
    assert.equal(p.data.story, 1);
    assert.equal(p.data.usdt, 42);
    assert.equal(p.data.chests, 2);
    assert.deepEqual(p.data.bossPaid, { 1: 1 });
    assert.ok(p.phrases().includes('ИНВЕСТИЦИЯ'));
    p.load(p.data);
    assert.equal(p.chapter().index, 1);
    p.beatBoss();
    assert.equal(p.chapter().index, 2);
});

test('пройденный старый финал остаётся завершённым', async () => {
    const p = new Profile(); await p.ready;
    p.load({ beaten: 5, story: 3, exam: true, usdt: 500 });
    assert.equal(p.chapter().done, true);
    assert.equal(p.data.usdt, 500);
});
