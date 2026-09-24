// Per-site accept, "report this site", counters, and the popup's site control.
//   npm run build && node test/features.mjs
import { consentCheck, launch, reporter, setSettings, tabState } from './lib.mjs';

const { results, check } = reporter();
const { ctx, sw, close } = await launch();
const extId = new URL(sw.url()).host;
const page = await ctx.newPage();
const local = (k) => sw.evaluate(async (key) => (await chrome.storage.local.get(key))[key], k);
const tabIdOf = (url) => sw.evaluate(async (u) => (await chrome.tabs.query({})).find((t) => t.url === u)?.id, url);

// Refused by default, counted.
let r = await consentCheck(page, sw, { host: 'www.bazos.cz', expect: 'done' });
check('default: bazos refused', r.ok, JSON.stringify(r.state));
check('counter: refused', (await local('stats'))?.refused >= 1, JSON.stringify(await local('stats')));

// Accepted when the user chose "accept" for the site.
await setSettings(sw, { acceptSites: ['www.o2.cz'] });
r = await consentCheck(page, sw, { host: 'www.o2.cz', expect: 'clear' });
check('per-site accept: o2 accepted', r.state?.consent === 'acceptedSite' && !r.bannerVisible, JSON.stringify(r.state));
check('counter: accepted', (await local('stats'))?.accepted >= 1);

// Popup: the site control shows "accept" pressed; "report" saves the site.
const pop = await ctx.newPage();
await pop.goto(`chrome-extension://${extId}/popup/popup.html?tab=${await tabIdOf(page.url())}`);
await pop.waitForTimeout(800);
check('popup: site control shows accept', await pop.locator('#siteMode [data-mode=accept]').getAttribute('aria-pressed') === 'true');
await pop.click('#report'); await pop.waitForTimeout(500);
const reports = await local('reports');
check('report saved locally', reports?.[0]?.host === 'www.o2.cz', JSON.stringify(reports?.[0]));

// Popup: switching to "leave" stores the exception (and drops the accept).
await pop.click('#siteMode [data-mode=ignore]').catch(() => {}); // popup closes itself
await page.waitForTimeout(1500);
const s = await local('settings');
check('popup: "leave" moves the site to exceptions', s.exceptions.includes('www.o2.cz') && !s.acceptSites.includes('www.o2.cz'), JSON.stringify(s));

// Shorts counter (click path).
await page.goto('https://www.youtube.com/results?search_query=minecraft', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
const id = await page.evaluate(() => document.querySelector('a[href^="/shorts/"]')?.getAttribute('href').split('/')[2]);
await page.evaluate((i) => { const a = Object.assign(document.createElement('a'), { href: `/shorts/${i}` }); document.body.append(a); a.click(); }, id);
await page.waitForTimeout(4000);
check('counter: shorts redirected', (await local('stats'))?.shorts >= 1, JSON.stringify(await local('stats')));

await close();
const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
