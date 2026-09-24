// D6 end to end: the extension picks up a changed data.json from its dataUrl, with no rebuild.
// Serves a modified copy of build/data.json on localhost that (a) hides YouTube's logo via the
// Shorts selector list and (b) adds bazos.cz to the wall list, then checks both take effect.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { launch, reporter, root, setSettings, tabState } from './lib.mjs';

const data = JSON.parse(fs.readFileSync(path.join(root, 'build/data.json'), 'utf8'));
data.generated = new Date(Date.now() + 60000).toISOString(); // newer than the bundled copy
data.shorts.hide.push('ytd-topbar-logo-renderer');
data.consent.walls.push('bazos.cz');
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify(data));
}).listen(0);
const url = `http://127.0.0.1:${server.address().port}/data.json`;

const { results, check } = reporter();
const { ctx, sw, close } = await launch();
const page = await ctx.newPage();

await setSettings(sw, { dataUrl: url });
await page.waitForTimeout(1500);
const status = await sw.evaluate(async () => (await chrome.storage.local.get('remoteDataStatus')).remoteDataStatus);
check('remote data fetched', status?.ok, JSON.stringify(status));

await page.goto('https://www.youtube.com/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
const logoVisible = await page.evaluate(() => [...document.querySelectorAll('ytd-topbar-logo-renderer')].some((e) => e.getClientRects().length));
check('remote Shorts selector applied (logo hidden)', !logoVisible);

await page.goto('https://www.bazos.cz/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(8000);
const s = await tabState(sw, page.url());
// On a wall site only wall rules run, so bazos's TermsFeed banner is no longer refused.
check('remote wall list applied (bazos banner left alone)', s && s.consent !== 'done', JSON.stringify(s));

await close();
server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
