// Shared by test/e2e.mjs (quick smoke) and canary/run.mjs (daily full run).
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

// Headless Chromium says "HeadlessChrome" in its UA and many CMPs then show nothing.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36';

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

// mobile: pose as iPhone Safari (YouTube then serves m.youtube.com). Chromium engine, real extension.
export async function launch({ extension = true, mobile = false } = {}) {
  const ext = path.join(root, 'build/chrome');
  if (extension && !fs.existsSync(path.join(ext, 'manifest.json'))) throw new Error('run npm run build first');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'declutter-'));
  // channel 'chromium' = Playwright's Chromium (Chrome for Testing); branded Chrome ignores --load-extension.
  const ctx = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: !process.env.HEADED,
    userAgent: mobile ? IPHONE_UA : UA,
    locale: 'cs-CZ',
    viewport: mobile ? { width: 393, height: 852 } : { width: 1400, height: 900 },
    ...(mobile && { isMobile: true, hasTouch: true, deviceScaleFactor: 3 }),
    // Without this navigator.webdriver is true, and some banners (orestbida cookieconsent) never show.
    args: ['--disable-blink-features=AutomationControlled',
      ...(extension ? [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`] : [])],
  });
  const sw = extension ? (ctx.serviceWorkers()[0] ?? await ctx.waitForEvent('serviceworker')) : null;
  const close = async () => { await ctx.close(); fs.rmSync(profile, { recursive: true, force: true }); };
  return { ctx, sw, close };
}

export function reporter() {
  const results = [];
  const check = (name, ok, detail = '') => {
    results.push({ name, ok: !!ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  };
  return { results, check };
}

export const tabState = (sw, url) => sw.evaluate(async (u) => {
  const tab = (await chrome.tabs.query({})).find((t) => t.url === u);
  return tab ? (await chrome.storage.session.get(`tab-${tab.id}`))[`tab-${tab.id}`] ?? {} : null;
}, url);

export const setSettings = (sw, patch) => sw.evaluate(async (p) => {
  const { settings = {} } = await chrome.storage.local.get('settings');
  await chrome.storage.local.set({ settings: { ...settings, ...p } });
}, patch);

const visibleCount = (page, sel) => page.evaluate((s) =>
  [...document.querySelectorAll(s)].filter((e) => e.getClientRects().length > 0).length, sel);

// ---- Shorts ----
export async function shortsChecks(page, sw, check) {
  const youtube = async (url) => {
    await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(6000);
  };

  await youtube('https://www.youtube.com/results?search_query=minecraft');
  const total = await page.evaluate(() => document.querySelectorAll('a[href^="/shorts/"]').length);
  check('youtube search: Shorts present in the DOM (check is meaningful)', total > 0, `${total} links`);
  check('youtube search: no visible /shorts/ links', (await visibleCount(page, 'a[href^="/shorts/"]')) === 0);
  check('youtube search: no visible Shorts shelf', (await visibleCount(page, 'grid-shelf-view-model')) === 0);
  const sidebar = await page.evaluate(() => [...document.querySelectorAll('ytd-guide-entry-renderer a#endpoint')]
    .map((a) => [a.title, a.getClientRects().length > 0]));
  const entry = sidebar.find(([t]) => t === 'Shorts');
  check('youtube sidebar: Shorts entry hidden', !!entry && !entry[1], entry ? '' : `titles: ${sidebar.map(([t]) => t).join(', ')}`);
  check('youtube search: self-check reports no leak', !((await tabState(sw, page.url()))?.shortsLeak > 0));

  const shortId = await page.evaluate(() => document.querySelector('a[href^="/shorts/"]')?.getAttribute('href').split('/')[2]);
  if (shortId) {
    await page.evaluate((id) => {
      const a = Object.assign(document.createElement('a'), { href: `/shorts/${id}`, textContent: 'x' });
      document.body.append(a);
      a.click();
    }, shortId);
    await page.waitForURL(/\/watch\?v=/, { timeout: 15000 }).catch(() => {});
    check('youtube: click on a Short opens /watch', page.url().includes(`/watch?v=${shortId}`), page.url());

    await page.goto(`https://www.youtube.com/shorts/${shortId}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(4000);
    check('youtube: direct /shorts/<id> load lands on /watch', page.url().includes(`/watch?v=${shortId}`), page.url());
    check('youtube watch page: no visible /shorts/ links', (await visibleCount(page, 'a[href^="/shorts/"]')) === 0);
  }

  await youtube('https://www.youtube.com/@MrBeast/shorts');
  check('youtube: channel /shorts tab redirects to /videos', /\/@MrBeast\/videos/.test(page.url()), page.url());
  const tabs = await page.evaluate(() => [...document.querySelectorAll('yt-tab-shape')]
    .map((t) => [t.getAttribute('tab-title'), t.getClientRects().length > 0]));
  check('youtube channel: Shorts tab hidden', tabs.some(([t, v]) => t === 'Shorts' && !v), JSON.stringify(tabs));
}

// ---- Consent ----
const outcomeJs = fs.readFileSync(path.join(root, 'test/outcome.js'), 'utf8');

// expect: 'done'  = a banner is known to show; our extension must answer it
//         'clear' = no banner must be left visible (the site may not show one to a headless browser)
//         'wall'  = consent-or-pay wall; must be recognised and left visible
export async function consentCheck(page, sw, { host, expect }, wait) {
  wait ??= 15000;
  let err = null;
  await page.goto(`https://${host}/`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch((e) => { err = e.message.split('\n')[0]; });
  await page.waitForTimeout(wait);
  const state = sw ? await tabState(sw, page.url()) : null;
  const out = await page.evaluate(outcomeJs).then(JSON.parse).catch((e) => ({ banners: [], evalErr: e.message }));
  const bannerVisible = out.banners.length > 0;
  let ok;
  // A wall inside an iframe (Sourcepoint) is invisible to the page-level banner check; trust the frame's detection.
  if (expect === 'wall') ok = state?.consent === 'wall' && (bannerVisible || state.wallFrame > 0);
  else if (expect === 'done') ok = state?.consent === 'done' && !bannerVisible;
  else ok = !bannerVisible && state?.consent !== 'failed';
  return { host, expect, ok, state, bannerVisible, banners: out.banners, err };
}
