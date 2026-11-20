
// node shot-variants.mjs <outdir> <variants.json>: the built popup with each variant's CSS injected.
// variants.json: [{"name": "opt-1", "css": "..."}]; writes <name>-light.png, <name>-dark.png, <name>-hover-light.png
import fs from 'node:fs';
import http from 'node:http';
const { launch } = await import('/Users/nguyentheanh/Desktop/bitbybit/02-personal/declutter/test/lib.mjs');
const [out, vfile] = process.argv.slice(2);
const variants = JSON.parse(fs.readFileSync(vfile, 'utf8'));
const server = http.createServer((_, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><p>x'); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = 'http://127.0.0.1:' + server.address().port + '/';
const { ctx, sw, close } = await launch();
const extId = new URL(sw.url()).host;
const page = await ctx.newPage(); await page.goto(url); await page.waitForTimeout(800);
const tabId = await sw.evaluate(async (u) => (await chrome.tabs.query({})).find((t) => t.url === u)?.id, url);
await sw.evaluate(async (id) => { await chrome.storage.session.set({ ['tab-' + id]: { consent: 'done', cmp: 'onetrust' } }); }, tabId);
for (const v of variants) for (const [suffix, scheme, hover] of [['light', 'light'], ['dark', 'dark'], ['hover-light', 'light', true]]) {
  const pop = await ctx.newPage();
  await pop.emulateMedia({ colorScheme: scheme });
  await pop.setViewportSize({ width: 352, height: 460 });
  await pop.goto('chrome-extension://' + extId + '/popup/popup.html?tab=' + tabId);
  await pop.waitForTimeout(900);
  if (v.css) await pop.addStyleTag({ content: v.css });
  if (hover) await pop.locator('#siteMode [aria-pressed="true"]').hover();
  await pop.waitForTimeout(200);
  // crop: from this page's status down to the site-choice pill, the two things the choice trades off
  const a = await pop.locator('#status').boundingBox(), b = await pop.locator('#siteMode').boundingBox();
  const y = Math.max(0, a.y - 26), clip = { x: 0, y, width: 352, height: b.y + b.height + 12 - y };
  await pop.screenshot({ path: out + '/' + v.name + '-' + suffix + '.png', clip });
  await pop.close();
}
await close(); server.close();
