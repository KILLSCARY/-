// Optional real WebGL smoke check. Start the static server first; see docs/winter-district.md.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.GAME_URL || 'http://127.0.0.1:8001/';

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
        await page.goto(new URL('?location=winter', base).href);
        await page.waitForFunction(() => window.game?.hub && !game.heroLoading && !document.querySelector('#boot'), { timeout: 90000 });
        await page.waitForFunction(() => game.world.winter?.assetsReady, { timeout: 20000 });
        await page.waitForFunction(() => game.winterSky?.naturalWidth > 0, { timeout: 20000 });
        assert.equal(await page.evaluate(() => game.location), 'winter');
        assert.equal(await page.evaluate(() => game.renderer.getContext().getContextAttributes().antialias), true);

        // Real settings buttons, including persistent choice and removing an old deep link override.
        await page.evaluate(() => { document.querySelector('#daily').hidden = true; game.hub.showDaily = () => {}; game.hub.tab('settings'); });
        await page.locator('[data-location="auto"]').click();
        assert.equal(await page.evaluate(() => game.location), 'street');
        assert.equal(new URL(page.url()).searchParams.get('location'), null);
        await page.locator('[data-location="winter"]').click();
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('p2p_settings')).location), 'winter');
        await page.evaluate(() => game.hub.tab('run'));

        // Start and pause a real run: the runner continues to advance through the winter scenery.
        await page.locator('#btn-play').click();
        await page.waitForFunction(() => game.state === 'playing' && game.runTime > .2, { timeout: 20000 });
        const distance = await page.evaluate(() => game.distance);
        assert.ok(distance > 0, 'running must advance');
        await page.evaluate(() => game.pause());
        assert.equal(await page.evaluate(() => game.state), 'paused');

        // Stop only the animation scheduler so lifecycle and rendering assertions are deterministic.
        const checks = await page.evaluate(async () => {
            game.loop = () => {};
            const w = game.world, winter = w.winter;
            const wallet = game.profile.data.usdt, count = winter.items.length;
            const streets = w.streetRoots.filter(o => o.isMesh);
            const messages = [];
            const check = (condition, label) => { if (!condition) throw new Error(label); messages.push(label); };
            check(!w.rain.visible && !w.ripples.visible, 'winter hides rain and ripple effects');
            check(streets.every(o => !o.visible), 'original road and scenery are hidden');
            let triangles = 0;
            for (const g of winter.chunks) g.traverse(m => { if (m.isMesh) triangles += (m.geometry.index?.count || m.geometry.attributes.position.count) / 3; });
            check(triangles < 200000, 'winter geometry stays under 200k triangles for the entire loop');
            check(winter.chunks.every(g => g.children.filter(o => o.isMesh).length <= 9), 'at most nine shared material batches per chunk');
            check(winter.chunks.every(g => g.children.some(o => o.userData.parkedCar)), 'textured GLB cars mounted in every block');
            check(winter.materials.facade.map.image.width === 1024 && winter.materials.snow.map.image.width === 512,
                'detailed facade and snow assets loaded');
            const before = winter.chunks[0].position.z;
            w.update(.1, 1.3, game.t);
            check(Math.abs(winter.chunks[0].position.z - before - 1.3) < .001, 'scenery moves at gameplay speed');
            winter.update(0, 640);
            const positions = winter.chunks.map(g => g.position.z).sort((a, b) => a - b);
            check(positions.every(z => z <= 45 && z > 45 - 160), 'loop recycles after several street lengths');
            check(positions.slice(1).every((z, i) => Math.abs(z - positions[i] - 32) < .001), 'no gaps after recycling');

            w.clear();
            const random = Math.random;
            let seed = 17, bins = 0;
            Math.random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
            try {
                for (let row = 0; row < 40; row++) {
                    w.spawnRow(-40, row / 40, 13 + row / 40 * 17);
                    const lanes = new Set(w.obstacles.filter(o => o.userData.type !== 'decor').map(o => o.userData.lane));
                    if (lanes.size > 2) throw new Error('winter row blocks all three lanes');
                    bins += w.obstacles.filter(o => o.userData.type === 'dumpster').length;
                    w.clear();
                }
            } finally { Math.random = random; }
            check(bins > 0, 'winter rows include bins and preserve an open lane at all tested speeds');
            const coins = game.coinCount;
            w.addCoin(1, 0, .7);
            game.x = 0; game.y = 0; game.slideLeft = 0;
            game.collide(0, 0);
            check(game.coinCount === coins + 1 && w.coins.length === 0, 'coins can be collected in winter');
            const obstacle = w.addObstacle('dumpster', 0, -12);
            w.update(.1, 1, game.t);
            check(obstacle.visible && obstacle.position.z > -12, 'gameplay obstacles remain visible and move');
            w.clear();

            for (const location of ['street', 'vietnam', 'winter', 'vietnam', 'street', 'winter']) {
                game.setLocation(location);
                w.update(.016, 0, game.t);
                check(winter.items.every(o => o.visible === (location === 'winter')), `${location}: winter visibility`);
                if (location === 'street') check(streets.every(o => o.visible), 'street geometry restored');
                if (location === 'vietnam') check(w.vietnam.items.every(o => o.visible), 'Vietnam scenery restored');
            }
            check(w.winter === winter && winter.items.length === count, 'switching does not rebuild winter');
            check(game.profile.data.usdt === wallet, 'location choice leaves wallet unchanged');
            for (const level of ['high', 'medium', 'low']) {
                game.setQuality(level);
                game.render();
                check(!w.reflector && !w.rain.visible, `${level}: no wet street reflection or rain in winter`);
                check(game.renderer.getContext().getError() === 0, `${level}: WebGL renders without errors`);
            }
            // Freshly arriving asynchronous scenery stays hidden, and restores on leaving winter.
            const THREE = await import('/js/vendor/three.module.js');
            const late = w.addScenery(new THREE.Group());
            check(!late.visible, 'late scenery hidden');
            game.setLocation('street'); check(late.visible, 'late scenery restored');
            game.setLocation('winter');
            w.scenery.splice(w.scenery.indexOf(late), 1); w.scene.remove(late);
            return { messages, triangles };
        });

        // Render the real mobile camera and keep screenshots for visual inspection.
        await page.evaluate(() => {
            document.querySelectorAll('.screen').forEach(e => e.hidden = true);
            document.querySelector('#daily').hidden = true;
            document.querySelector('#gorilla').hidden = true;
            game.gorilla = () => {};
            game.camera.position.set(0, 3.3, 5); game.camera.lookAt(0, .9, -8);
            game.camera.fov = 72; game.camera.updateProjectionMatrix();
            game.world.winter.chunks.forEach((g, i) => g.position.z = -i * 32);
            for (let i = 0; i < 7; i++) game.world.addCoin(1, -6 - i * 2.3);
            game.world.addObstacle('roadblock', 0, -17);
            game.render();
        });
        await page.screenshot({ path: '/tmp/winter-district-mobile.png' });
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.waitForTimeout(250);
        await page.evaluate(() => {
            game.camera.position.set(0, 3.1, 5.7); game.camera.lookAt(0, 1.8, -18);
            game.camera.fov = 58; game.camera.updateProjectionMatrix(); game.render();
        });
        await page.screenshot({ path: '/tmp/winter-district-desktop.png' });
        const render = await page.evaluate(() => ({ ...game.renderer.info.render }));
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({ passed: checks.messages, totalSceneryTriangles: checks.triangles, render }, null, 2));
    } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
