// End-to-end: loads build/chrome into Playwright's Chromium and checks both modules on live sites.
//   npm run build && npm run test:e2e            (HEADED=1 to watch)
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ext = path.join(root, 'build/chrome');
if (!fs.existsSync(path.join(ext, 'manifest.json'))) throw new Error('run npm run build first');

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'declutter-e2e-'));
const ctx = await chromium.launchPersistentContext(profile, {
  channel: 'chromium',
  headless: !process.env.HEADED,
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',
  locale: 'cs-CZ',
  viewport: { width: 1400, height: 900 },
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
const sw = ctx.serviceWorkers()[0] ?? await ctx.waitForEvent('serviceworker');
check('background service worker running', !!sw, sw?.url());

const tabState = (url) => sw.evaluate(async (u) => {
  const [tab] = await chrome.tabs.query({ url: u });
  return tab ? (await chrome.storage.session.get(`tab-${tab.id}`))[`tab-${tab.id}`] ?? {} : null;
}, url);
const setSettings = (patch) => sw.evaluate(async (p) => {
  const { settings = {} } = await chrome.storage.local.get('settings');
  await chrome.storage.local.set({ settings: { ...settings, ...p } });
}, patch).then(() => page.waitForTimeout(2000)); // YouTube tabs reload on a Shorts toggle

const visibleCount = (page, sel) => page.evaluate((s) =>
  [...document.querySelectorAll(s)].filter((e) => e.getClientRects().length > 0).length, sel);

const page = await ctx.newPage();

// ---- Shorts ----
async function youtube(url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
}

await youtube('https://www.youtube.com/results?search_query=minecraft');
const shortsLinksTotal = await page.evaluate(() => document.querySelectorAll('a[href^="/shorts/"]').length);
check('search: page has Shorts in the DOM (test is meaningful)', shortsLinksTotal > 0, `${shortsLinksTotal} links`);
check('search: no visible /shorts/ links', (await visibleCount(page, 'a[href^="/shorts/"]')) === 0);
check('search: no visible Shorts shelf', (await visibleCount(page, 'grid-shelf-view-model')) === 0);
const sidebar = await page.evaluate(() => [...document.querySelectorAll('ytd-guide-entry-renderer a#endpoint')]
  .map((a) => [a.title, a.getClientRects().length > 0]));
const shortsEntry = sidebar.find(([t]) => t === 'Shorts');
check('sidebar: Shorts entry hidden', !!shortsEntry && !shortsEntry[1], JSON.stringify(sidebar.map(([t]) => t)));
check('search: no leak reported', !((await tabState(page.url()))?.shortsLeak > 0));

const shortId = await page.evaluate(() => document.querySelector('a[href^="/shorts/"]')?.getAttribute('href').split('/')[2]);
if (shortId) {
  // In-app click on a Short (capture-phase handler).
  await page.evaluate((id) => {
    const a = Object.assign(document.createElement('a'), { href: `/shorts/${id}`, textContent: 'x' });
    document.body.append(a);
    a.click();
  }, shortId);
  await page.waitForURL(/\/watch\?v=/, { timeout: 15000 }).catch(() => {});
  check('click on a Short opens /watch', page.url().includes(`/watch?v=${shortId}`), page.url());

  // Direct load (DNR redirect).
  await page.goto(`https://www.youtube.com/shorts/${shortId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  check('direct /shorts/<id> load lands on /watch', page.url().includes(`/watch?v=${shortId}`), page.url());
  check('watch page: no visible /shorts/ links', (await visibleCount(page, 'a[href^="/shorts/"]')) === 0);
}

await youtube('https://www.youtube.com/@MrBeast/shorts');
check('channel /shorts tab redirects to /videos', /\/@MrBeast\/videos/.test(page.url()), page.url());
const tabs = await page.evaluate(() => [...document.querySelectorAll('yt-tab-shape')].map((t) => [t.getAttribute('tab-title'), t.getClientRects().length > 0]));
check('channel: Shorts tab hidden', tabs.some(([t, v]) => t === 'Shorts' && !v), JSON.stringify(tabs));

await setSettings({ shorts: false });
await youtube('https://www.youtube.com/results?search_query=minecraft');
check('module off: Shorts visible again', (await visibleCount(page, 'a[href^="/shorts/"]')) > 0);
await setSettings({ shorts: true });

// ---- Consent ----
async function site(host, wait = 15000) {
  await page.goto(`https://${host}/`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(wait);
  return tabState(page.url());
}
let s = await site('www.o2.cz');
check('o2 (consentmanager, shadow DOM): banner refused', s?.consent === 'done', JSON.stringify(s));
s = await site('www.bazos.cz');
check('bazos: banner refused', s?.consent === 'done', JSON.stringify(s));
s = await site('www.blesk.cz');
check('blesk (wall): left alone', s?.consent === 'wall', JSON.stringify(s));
const wallVisible = await page.evaluate(() => {
  const w = document.querySelector('#cpexSubs_modalWrapper');
  return !!w && w.getClientRects().length > 0;
});
check('blesk: wall still visible', wallVisible);

await ctx.close();
fs.rmSync(profile, { recursive: true, force: true });
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
