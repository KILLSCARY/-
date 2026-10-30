import test from 'node:test';
import assert from 'node:assert/strict';
import { FramePacer, FrameMeter, updateAmbientAnimation } from '../js/frame-timing.js';
import { PerfHud } from '../js/perf.js';

for (const hz of [60, 90, 120, 144]) {
    for (const cap of [30, 60, 120]) {
        test(`планировщик: экран ${hz} Гц, лимит ${cap} FPS`, () => {
            const pacer = new FramePacer();
            let frames = 0;
            for (let i = 0; i < hz * 10; i++) {
                const now = 1000 + i * 1000 / hz + Math.sin(i) * 0.3;
                if (pacer.ready(now, 1000 / cap) && i >= hz) frames++;
            }
            assert.ok(Math.abs(frames / 9 - Math.min(hz, cap)) < 1, `получено ${frames / 9} FPS`);
        });
    }
}

test('после зависания нет пачки догоняющих кадров; смена лимита применяется сразу', () => {
    const pacer = new FramePacer();
    assert.equal(pacer.ready(1000, 1000 / 30), true);
    assert.equal(pacer.ready(1010, 1000 / 30), false);
    assert.equal(pacer.ready(1015, 1000 / 120), true);
    assert.equal(pacer.ready(5000, 1000 / 30), true);
    assert.equal(pacer.ready(5001, 1000 / 30), false);
    pacer.reset();
    assert.equal(pacer.ready(5010, 1000 / 30), true);
});

test('измерение FPS видит 10 FPS при зависаниях по 100 мс, а не 20 из обрезанного dt', () => {
    const meter = new FrameMeter();
    let fps;
    for (let i = 0; i <= 12; i++) fps = meter.sample(1000 + i * 100);
    assert.equal(fps, 10);
    meter.reset();
    assert.equal(meter.sample(20000), null, 'фоновая пауза не попадает в новый замер');
});

test('фоновые микшеры обновляются реже, сохраняя ход времени; скрытые и дальние не работают', () => {
    let calls = 0, elapsed = 0;
    const o = { visible: true, position: { z: -30 }, userData: { mixer: { update(dt) { calls++; elapsed += dt; } } } };
    const tier = { far: 62, animationHz: 20 };
    for (let i = 0; i < 120; i++) updateAmbientAnimation(o, 1 / 120, tier);
    assert.equal(calls, 20);
    assert.ok(Math.abs(elapsed - 1) < 1e-6);
    o.visible = false;
    updateAmbientAnimation(o, 1, tier);
    o.visible = true; o.position.z = -80;
    updateAmbientAnimation(o, 1, tier);
    assert.equal(calls, 20);
    o.position.z = -5;
    for (let i = 0; i < 120; i++) updateAmbientAnimation(o, 1 / 120, tier);
    assert.equal(calls, 80, 'ближняя анимация остаётся 60 FPS');
    assert.ok(Math.abs(elapsed - 2) < 1e-6, 'нет скачка после возвращения в кадр');
});

test('диагностика измеряет прямой рендер и постобработку без потери this', () => {
    const originalWindow = globalThis.window, originalDocument = globalThis.document;
    globalThis.window = {};
    globalThis.document = { createElement: () => ({ remove() {} }), body: { append() {} } };
    try {
        const renderer = { info: { autoReset: true, render: { calls: 0, triangles: 0 }, reset() { this.render.calls = this.render.triangles = 0; } } };
        const g = { renderer, direct: true, render() { assert.equal(this, g); this.renderer.info.render.calls += this.direct ? 1 : 3; } };
        const original = g.render;
        const hud = new PerfHud(g);
        hud.toggle(true);
        g.render(); g.direct = false; g.render();
        assert.deepEqual(hud.frames.map(f => f.calls), [1, 3]);
        hud.toggle(false);
        assert.equal(g.render, original);
        assert.equal(renderer.info.autoReset, true);
    } finally { globalThis.window = originalWindow; globalThis.document = originalDocument; }
});

test('пакет монет сохраняет GLB-трансформации, магнит, удаление и отсечение', async () => {
    const THREE = await import('../js/vendor/three.module.js');
    const { CoinBatch } = await import('../js/coin-batch.js');
    const template = new THREE.Group();
    template.userData.cfg = { size: 0.62 };
    const model = new THREE.Group();
    model.scale.setScalar(0.5); model.rotation.y = 0.7; model.position.y = 0.4;
    const source = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    source.position.x = 0.3; model.add(source); template.add(model);
    const batch = CoinBatch.fromTemplate(template, 2);
    const first = batch.add(), second = batch.add();
    assert.equal(batch.add(), null, 'переполнение использует обычную модель');
    first.position.set(2, 1, -4); first.rotation.y = 0.9;
    second.position.z = -90;
    batch.sync(62);
    assert.equal(batch.mesh.count, 1);
    const vertex = new THREE.Vector3().fromBufferAttribute(batch.mesh.geometry.attributes.position, 0);
    const matrix = new THREE.Matrix4(); batch.mesh.getMatrixAt(0, matrix);
    const actual = vertex.applyMatrix4(matrix);
    const original = new THREE.Vector3().fromBufferAttribute(source.geometry.attributes.position, 0)
        .applyMatrix4(source.matrixWorld).add(new THREE.Vector3(0, -0.31, 0)).applyMatrix4(first.matrix);
    assert.ok(actual.distanceTo(original) < 1e-6);
    first.position.x = 0; // магнит меняет логическую позицию
    second.position.z = -5;
    batch.sync(62); assert.equal(batch.mesh.count, 2);
    batch.mesh.getMatrixAt(0, matrix); assert.equal(matrix.elements[12], 0);
    assert.equal(batch.remove(first), true);
    assert.equal(batch.remove(first), false);
    batch.sync(62); assert.equal(batch.mesh.count, 1);
    batch.remove(second); batch.sync(62); assert.equal(batch.mesh.count, 0);
    assert.equal(source.geometry.attributes.position.getX(0), 0.5, 'общая геометрия не меняется');
    assert.equal(CoinBatch.fromTemplate(new THREE.Group()), null, 'неизвестная модель остаётся на обычном пути');
    batch.mesh.geometry.dispose(); source.geometry.dispose(); source.material.dispose();
});


// Проверяем настоящие методы Game без запуска WebGL/Telegram конструктора.
const gameSource = (await import('node:fs/promises')).readFile;
const gameText = await gameSource(new URL('../js/game.js', import.meta.url), 'utf8');
function gameMethod(name, prizeStub = {}) {
    let start = gameText.indexOf(`    ${name}(`);
    if (start < 0) start = gameText.indexOf(`    async ${name}(`);
    const end = gameText.indexOf('\n    }', start) + 6;
    const method = gameText.slice(start, end);
    // Комментарии между методами допустимы внутри литерала объекта.
    return Function('QUALITY', 'RES_MIN', 'prize', `return ({${method}\n}).${name}`)('auto', 0.6, prizeStub);
}
const measureFps = gameMethod('measureFps');

test('устойчивые 28 FPS не застревают на средней графике телефона; затем включается лимит 30', () => {
    const g = {
        state: 'playing', runTime: 10, measuredState: 'playing', mobile: true,
        settings: {}, quality: 'medium', resScale: 0.7, perfStep: 3,
        frameMeter: { sample: () => 28, reset() {} }, frameBudget: () => 1000 / 60,
        setQuality(level) { this.quality = level; }, onResize() {},
    };
    measureFps.call(g);
    assert.equal(g.quality, 'low');
    g.resScale = 0.7;
    measureFps.call(g);
    assert.equal(g.performanceFpsCap, 30);
    g.performanceFpsCap = 60;
    measureFps.call(g);
    assert.equal(g.performanceFpsCap, 30, 'после возврата со 120 к 60 можно снизить лимит дальше');
});

test('бой не пересобирает уровень графики во время раунда', () => {
    const g = {
        state: 'fight', measuredState: 'fight', mobile: true, settings: {},
        quality: 'medium', resScale: 0.7, perfStep: 0,
        frameMeter: { sample: () => 20, reset() {} }, frameBudget: () => 1000 / 60,
        setQuality() { assert.fail('пересборка шейдеров в бою'); },
    };
    measureFps.call(g);
    assert.equal(g.quality, 'medium');
    assert.equal(g.performanceFpsCap, 30);
});


test('повторный выбор того же качества восстанавливает эффекты, снятые адаптацией', () => {
    const setSetting = gameMethod('setSetting');
    const previous = globalThis.localStorage;
    globalThis.localStorage = { setItem() {} };
    try {
        let applied = 0;
        const g = { settings: {}, quality: 'medium', autoQuality: 'medium', perfStep: 3,
            applySettings() {}, frameMeter: { reset() {} },
            setQuality(level) { assert.equal(level, 'medium'); assert.equal(this.perfStep, 0); applied++; },
        };
        setSetting.call(g, 'quality', 'auto');
        assert.equal(applied, 1);
    } finally { globalThis.localStorage = previous; }
});


test('награды ждут облако и записываются в актуальный профиль после ответа сервера', async () => {
    let ready, response, requested = false, saves = 0;
    const profile = { data: {}, ready: new Promise(resolve => { ready = resolve; }), save() { saves++; } };
    const syncRewards = gameMethod('syncRewards', { rewards() {
        requested = true;
        return new Promise(resolve => { response = resolve; });
    } });
    await syncRewards.call({}); // неуспешный запуск до создания профиля
    const pending = syncRewards.call({ profile });
    assert.equal(requested, false);
    ready();
    await Promise.resolve();
    assert.equal(requested, true);
    const current = profile.data = {};
    response({ rewards: { 'boss:one': true } });
    await pending;
    assert.equal(current.bossPaid.one, 1);
    assert.equal(saves, 1);
});
