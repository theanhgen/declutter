
// node shot.mjs <outdir>: builds nothing; screenshots build/chrome's popup in fixed states.
import http from 'node:http';
// node shot.mjs <outdir> [repo root]: screenshots <repo>/build/chrome's popup in fixed states.
const out = process.argv[2];
const { launch, setSettings } = await import((process.argv[3] || '/Users/nguyentheanh/Desktop/bitbybit/02-personal/declutter') + '/test/lib.mjs');
const server = http.createServer((_, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><p>x'); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = 'http://127.0.0.1:' + server.address().port + '/';
const { ctx, sw, close } = await launch();
const extId = new URL(sw.url()).host;
const page = await ctx.newPage(); await page.goto(url); await page.waitForTimeout(800);
const tabId = await sw.evaluate(async (u) => (await chrome.tabs.query({})).find((t) => t.url === u)?.id, url);
await sw.evaluate(async (id) => { await chrome.storage.session.set({ ['tab-' + id]: { consent: 'done', cmp: 'onetrust' } }); }, tabId);
async function shot(name, scheme, act) {
  const pop = await ctx.newPage();
  await pop.emulateMedia({ colorScheme: scheme });
  await pop.setViewportSize({ width: 300, height: 560 });
  await pop.goto('chrome-extension://' + extId + '/popup/popup.html?tab=' + tabId);
  await pop.waitForTimeout(900);
  if (act) await act(pop);
  await pop.waitForTimeout(250);
  await pop.screenshot({ path: out + '/' + name + '.png', fullPage: true });
  await pop.close();
}
await shot('popup-light', 'light');
await shot('popup-dark', 'dark');
await shot('popup-hover-row2-light', 'light', (p) => p.locator('#posts').hover());
await shot('popup-hover-pill-light', 'light', (p) => p.locator('#siteMode [aria-pressed="true"]').hover());
await shot('popup-keyboard-focus-light', 'light', async (p) => { await p.mouse.move(0, 0); await p.keyboard.press('Tab'); });
await setSettings(sw, { posts: false });
await shot('popup-posts-off-light', 'light');
await shot('popup-posts-off-dark', 'dark');
await setSettings(sw, { posts: true });
await close(); server.close();
console.log('shots in ' + out);
