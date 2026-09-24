// Shorts on m.youtube.com (what Safari on iPhone gets), with the real extension in Chromium posing as an iPhone.
//   npm run build && node test/mobile.mjs
import { launch, reporter, tabState } from './lib.mjs';

const { results, check } = reporter();
const { ctx, sw, close } = await launch({ mobile: true });
const page = await ctx.newPage();
const visible = (sel) => page.evaluate((s) => [...document.querySelectorAll(s)].filter((e) => e.getClientRects().length).length, sel);

await page.goto('https://m.youtube.com/results?search_query=minecraft', { waitUntil: 'domcontentloaded' }).catch(() => {});
await page.waitForTimeout(8000);
check('m.youtube served', page.url().startsWith('https://m.youtube.com/'), page.url().slice(0, 60));
const total = await page.evaluate(() => document.querySelectorAll('a[href*="/shorts/"]').length);
check('search: Shorts present in the DOM (check is meaningful)', total > 0, `${total} links`);
check('search: no visible Shorts', (await visible('a[href*="/shorts/"], ytm-shorts-lockup-view-model')) === 0);
check('bottom bar: Shorts tab hidden', (await visible('.pivot-shorts')) === 0 && (await visible('ytm-pivot-bar-item-renderer')) > 0);
check('search: self-check reports no leak', !((await tabState(sw, page.url()))?.shortsLeak > 0));

const id = await page.evaluate(() => document.querySelector('a[href*="/shorts/"]')?.getAttribute('href').match(/shorts\/([\w-]+)/)?.[1]);
await page.goto(`https://m.youtube.com/shorts/${id}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
await page.waitForTimeout(4000);
check('direct m.youtube.com/shorts/<id> lands on /watch', page.url().includes(`/watch?v=${id}`), page.url().slice(0, 70));

// In-app navigation to a Short (what tapping one does): pushState + a DOM change.
await page.goto('https://m.youtube.com/', { waitUntil: 'domcontentloaded' }).catch(() => {});
await page.waitForTimeout(5000);
await page.evaluate((i) => { history.pushState({}, '', `/shorts/${i}`); document.body.append(document.createElement('div')); }, id);
await page.waitForURL(/\/watch\?v=/, { timeout: 10000 }).catch(() => {});
check('in-app navigation to a Short lands on /watch', page.url().includes(`/watch?v=${id}`), page.url().slice(0, 70));

await close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
