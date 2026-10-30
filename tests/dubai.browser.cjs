// Real WebGL integration check; use the same static server/Playwright setup as winter.browser.cjs.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
        headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
    try {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
            userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile' });
        const errors = [];
        page.on('pageerror', e => errors.push(String(e)));
        page.on('console', m => { if (m.type() === 'error' && /THREE\.|WebGL|Shader Error/.test(m.text())) errors.push(m.text()); });
        await page.route('https://telegram.org/**', route => route.abort());
        await page.addInitScript(() => {
            localStorage.setItem('p2p_settings', JSON.stringify({ music: false, sfx: false, modeChosen: true, questions: false }));
            localStorage.setItem('p2p_profile', JSON.stringify({ exam: true, anketa: { test: true } }));
        });
        await page.goto(new URL('?location=dubai', process.env.GAME_URL || 'http://127.0.0.1:8001/').href);
        await page.waitForFunction(() => window.game?.hub && !game.heroLoading && !document.querySelector('#boot'), null, { timeout: 90000 });
        await page.waitForFunction(() => game.world.vietnam?.assetsReady, null, { timeout: 30000 });
        assert.equal(await page.evaluate(() => game.location), 'vietnam');
        assert.equal(await page.evaluate(() => game.renderer.getContext().getContextAttributes().antialias), true);
        await page.evaluate(() => { document.querySelector('#daily').hidden = true; game.hub.showDaily = () => {}; game.hub.tab('settings'); });
        await page.locator('[data-location="auto"]').click();
        assert.equal(await page.evaluate(() => game.location), 'street');
        await page.locator('[data-location="dubai"]').click();
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('p2p_settings')).location), 'dubai');
        assert.equal(new URL(page.url()).searchParams.get('location'), null);
        await page.evaluate(() => game.hub.tab('run'));
        await page.locator('#btn-play').click();
        await page.waitForFunction(() => game.state === 'playing' && game.runTime > .2, null, { timeout: 30000 });
        assert.ok(await page.evaluate(() => game.distance > 0));
        await page.evaluate(() => game.pause());
        const report = await page.evaluate(() => {
            game.loop = () => {};
            const district = game.world.vietnam, w = game.world;
            const check = (ok, label) => { if (!ok) throw new Error(label); };
            let triangles = 0;
            district.items.forEach(o => o.traverse(m => { if (m.isMesh) triangles += (m.geometry.index?.count || m.geometry.attributes.position.count) / 3; }));
            check(triangles < 100000, `Dubai scene stays below 100k triangles including parked cars: ${triangles}`);
            check(district.detailArtworkReady && district.materials.banners.map.image.width === 2048, 'photo billboards and detail textures load');
            check(district.road.material.normalMap && district.road.material.roughnessMap, 'asphalt detail maps load');
            check(district.yachtSites.length === 5 && district.yachtSites.every(p => p.x < -10), 'five yachts sit outside running lanes in the marina');
            check(district.billboardSites.length >= 7 && district.billboardSites.every(p => p.y > 6), 'large billboards sit above the sidewalks');
            check(!w.rain.visible && !w.ripples.visible && !w.reflector, 'Dubai does not run wet street effects');
            check(w.streetRoots.every(o => !o.visible), 'original street hidden');
            const z = district.chunks.map(c => c.position.z);
            district.update(.016, 330);
            check(district.chunks.every((c, i) => Math.abs(c.position.z - (z[i] + 10 > district.behind ? z[i] - 150 : z[i] + 10)) < .001), 'chunks wrap correctly across multiple loops');
            w.clear();
            const coins = game.coinCount;
            w.addCoin(1, 0, .7); game.x = 0; game.y = 0; game.slideLeft = 0; game.collide(0, 0);
            check(game.coinCount === coins + 1 && w.coins.length === 0, 'coins collect in Dubai');
            const obstacle = w.addObstacle('dumpster', 0, -12);
            w.update(.1, 1, game.t);
            check(obstacle.visible && obstacle.position.z > -12, 'obstacles remain visible and move');
            w.clear();
            check(district.materials.glass.map.image.width === 1024, 'detailed facade artwork loaded');
            const wallet = game.profile.data.usdt, count = district.items.length;
            game.setLocation('winter'); check(district.items.every(o => !o.visible), 'Dubai hidden in winter');
            game.setLocation('vietnam'); check(district.items.every(o => o.visible), 'Dubai restored after winter');
            game.setLocation('street'); check(district.items.every(o => !o.visible), 'Dubai hidden in street');
            game.setLocation('vietnam'); check(district.items.length === count, 'Dubai geometry reused');
            check(game.profile.data.usdt === wallet, 'location changes preserve balance');
            const setting = game.settings.location; game.settings.location = 'auto';
            check(game.heroLocation('dima') === 'vietnam' && game.heroLocation('tovarus') === 'vietnam', 'legacy hero routes lead to Dubai');
            game.settings.location = setting;
            for (const quality of ['high', 'medium', 'low']) {
                game.setQuality(quality); game.render();
                check(game.camera.far >= 320 && game.scene.fog.far >= 275, `${quality}: distant skyline visible`);
                check(!w.reflector && !w.rain.visible, `${quality}: expensive rain/reflection disabled`);
                check(game.renderer.getContext().getError() === 0, `${quality}: no WebGL errors`);
            }
            return { triangles, chunks: district.chunks.length };
        });
        await page.evaluate(() => {
            document.querySelectorAll('.screen').forEach(e => e.hidden = true);
            for (const id of ['daily', 'gorilla']) document.getElementById(id).hidden = true;
            game.gorilla = () => {};
            game.camera.position.set(0, 3.3, 5); game.camera.lookAt(0, .9, -8);
            game.camera.fov = 72; game.camera.updateProjectionMatrix();
            game.world.vietnam.chunks.forEach((c, i) => c.position.z = -i * 32);
            for (let i = 0; i < 7; i++) game.world.addCoin(1, -6 - i * 2.3);
            game.world.addObstacle('roadblock', 0, -17); game.render();
        });
        await page.screenshot({ path: '/tmp/dubai-mobile.png' });
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.waitForTimeout(250);
        await page.evaluate(() => {
            game.camera.position.set(0, 3.1, 5.7); game.camera.lookAt(0, 1.8, -18);
            game.camera.fov = 58; game.camera.updateProjectionMatrix(); game.render();
        });
        await page.screenshot({ path: '/tmp/dubai-desktop.png' });
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({ ...report, render: await page.evaluate(() => ({ ...game.renderer.info.render })), errors }, null, 2));
    } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
