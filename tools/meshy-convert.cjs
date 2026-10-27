const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const [outDir, jobsFile] = process.argv.slice(2);
  const jobs = JSON.parse(fs.readFileSync(jobsFile));
  const b = await chromium.launch({ args: ['--js-flags=--max-old-space-size=8000'] });
  for (const job of jobs) {
    const p = await b.newPage();
    p.on('pageerror', e => console.log('pageerror:', e.message));
    await p.route('**/save?**', async (route) => {
      const name = new URL(route.request().url()).searchParams.get('name');
      fs.writeFileSync(`${outDir}/${name}.glb`, route.request().postDataBuffer());
      await route.fulfill({ status: 200, body: 'ok' });
    });
    await p.goto('http://localhost:8124/tools/meshy-convert.html?job=' + encodeURIComponent(JSON.stringify(job)));
    await p.waitForFunction(() => window.DONE, null, { timeout: 1200000, polling: 1000 });
    console.log(job.out, JSON.stringify(await p.evaluate(() => window.DONE)));
    await p.close();
  }
  await b.close();
})();
