// Per-site accept, "report this site", counters, the chip, the popup's site control, the welcome page and GPC.
//   npm run build && node test/features.mjs
import http from 'node:http';
import { consentCheck, launch, reporter, setSettings, tabState } from './lib.mjs';

const { results, check } = reporter();
const { ctx, sw, close } = await launch();
const extId = new URL(sw.url()).host;
const page = await ctx.newPage();
const local = (k) => sw.evaluate(async (key) => (await chrome.storage.local.get(key))[key], k);
const tabIdOf = (url) => sw.evaluate(async (u) => (await chrome.tabs.query({})).find((t) => t.url === u)?.id, url);

// The chip is on the page for about two seconds and carries nothing the page can read (closed shadow root, no
// attributes), so the test knows it by its place: a fixed, top-most child of <body>. What it said is in the
// background's record.
const chipOnPage = () => page.evaluate(() => [...document.body.children].some((e) => e.style.zIndex === '2147483647' && e.style.position === 'fixed'));
// The record is per tab and outlives the page: only one made for the site now in the tab counts.
const chipSaid = async () => {
  const rec = await sw.evaluate(async (u) => {
    const id = (await chrome.tabs.query({})).find((t) => t.url === u)?.id;
    return (await chrome.storage.session.get(`chip-${id}`))[`chip-${id}`];
  }, page.url());
  return rec?.host === new URL(page.url()).hostname ? rec.text : undefined;
};
// Opened once by onInstalled in a fresh profile.
check('welcome page opened on install', ctx.pages().some((p) => p.url().endsWith('/welcome/welcome.html')), ctx.pages().map((p) => p.url()).join(' '));

const sawChip = async () => { for (let i = 0; i < 140; i++) { if (await chipOnPage().catch(() => false)) return true; await page.waitForTimeout(100); } return false; };

// Refused by default, counted.
let seen = sawChip();
let r = await consentCheck(page, sw, { host: 'www.bazos.cz', expect: 'done' });
check('default: bazos refused', r.ok, JSON.stringify(r.state));
check('counter: refused', (await local('stats'))?.refused >= 1, JSON.stringify(await local('stats')));
check('chip: shown, said "cookies refused"', await seen && await chipSaid() === 'cookies refused', await chipSaid());
check('chip: gone again', !(await chipOnPage()));

// Accepted when the user chose "accept" for the site.
await setSettings(sw, { acceptSites: ['www.o2.cz'] });
seen = sawChip();
r = await consentCheck(page, sw, { host: 'www.o2.cz', expect: 'clear' });
check('per-site accept: o2 accepted', r.state?.consent === 'acceptedSite' && !r.bannerVisible, JSON.stringify(r.state));
check('counter: accepted', (await local('stats'))?.accepted >= 1);
check('chip: shown, said "cookies accepted"', await seen && await chipSaid() === 'cookies accepted', await chipSaid());

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

// Chip switched off: the banner is still refused, nothing is said.
await setSettings(sw, { chip: false });
seen = sawChip();
r = await consentCheck(page, sw, { host: 'www.datart.cz', expect: 'done' });
check('chip off: datart refused, no chip', r.ok && !(await seen) && !(await chipSaid()), JSON.stringify(r.state));
await setSettings(sw, { chip: true });

// Global Privacy Control: off by default; when on, the header and the page property reach a site, but not a site the
// user accepts. A local server records the header (localhost and 127.0.0.1 are two sites to the browser).
const seenGpc = {};
const server = http.createServer((req, res) => {
  seenGpc[req.headers.host.split(':')[0]] = req.headers['sec-gpc'] ?? null;
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end('<!doctype html><title>gpc</title><p>gpc');
}).listen(0);
const port = server.address().port;
const gpcOn = async (host) => {
  await page.goto(`http://${host}:${port}/`);
  return { header: seenGpc[host], property: await page.evaluate(() => navigator.globalPrivacyControl ?? null) };
};
let g = await gpcOn('127.0.0.1');
check('GPC off by default: no header, no property', g.header === null && g.property === null, JSON.stringify(g));
await setSettings(sw, { gpc: true, acceptSites: ['localhost'] });
await page.waitForTimeout(1000);
g = await gpcOn('127.0.0.1');
check('GPC on: header and property sent', g.header === '1' && g.property === true, JSON.stringify(g));
g = await gpcOn('localhost');
check('GPC on: not sent to a site set to accept', g.header === null && g.property === null, JSON.stringify(g));
await setSettings(sw, { gpc: false, acceptSites: [] });
await page.waitForTimeout(1000);
g = await gpcOn('127.0.0.1');
check('GPC off again: nothing sent', g.header === null && g.property === null, JSON.stringify(g));
server.close();

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
