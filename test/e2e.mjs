// Quick smoke test: build/chrome in Playwright's Chromium against live YouTube + 4 Czech sites.
//   npm run build && npm run test:e2e            (HEADED=1 to watch)
// The full daily run over every site is canary/run.mjs.
import { launch, reporter, setSettings, shortsChecks, consentCheck } from './lib.mjs';

const { results, check } = reporter();
const { ctx, sw, close } = await launch();
check('background service worker running', !!sw, sw?.url());
const page = await ctx.newPage();

await shortsChecks(page, sw, check);

await setSettings(sw, { shorts: false });
await page.waitForTimeout(2000); // open YouTube tabs reload on a Shorts toggle
await page.goto('https://www.youtube.com/results?search_query=minecraft', { waitUntil: 'domcontentloaded' }).catch(() => {});
await page.waitForTimeout(6000);
const visible = await page.evaluate(() => [...document.querySelectorAll('a[href^="/shorts/"]')].filter((e) => e.getClientRects().length).length);
check('Shorts module off: Shorts visible again', visible > 0, `${visible} visible`);
await setSettings(sw, { shorts: true });
await page.waitForTimeout(2000);

for (const site of [
  { host: 'www.o2.cz', expect: 'done' },        // consentmanager in a shadow root
  { host: 'www.bazos.cz', expect: 'done' },     // TermsFeed
  { host: 'www.alza.cz', expect: 'done' },      // our Czech rule
  { host: 'www.blesk.cz', expect: 'wall' },     // CPEx consent-or-pay wall
]) {
  const r = await consentCheck(page, sw, site);
  check(`consent ${site.host}: ${site.expect}`, r.ok, JSON.stringify({ state: r.state, banners: r.banners.length }));
}

await close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
