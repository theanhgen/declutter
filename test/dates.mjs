// Upload dates on m.youtube.com's related videos (dates.js + dates-main.js): after a full load, after an in-app
// navigation to another video, and gone when the setting is off.
//   npm run build && node test/dates.mjs
import { launch, reporter, setSettings } from './lib.mjs';

const { results, check } = reporter();
const { ctx, sw, close } = await launch({ mobile: true });
const page = await ctx.newPage();

const state = () => page.evaluate(() => {
  const cards = [...document.querySelectorAll('ytm-video-with-context-renderer')].filter((c) => c.querySelector('ytm-badge-and-byline-renderer'));
  const bylines = cards.map((c) => c.querySelector('ytm-badge-and-byline-renderer').textContent.replace(/\s+/g, ' ').trim());
  const ours = cards.map((c) => c.querySelectorAll('[data-declutter-date]').length);
  // A date we added must belong to the card's own video.
  const wrongId = cards.filter((c) => {
    const id = new URL(c.querySelector('a[href*="/watch?"]')?.getAttribute('href') ?? '/', location.href).searchParams.get('v');
    return [...c.querySelectorAll('[data-declutter-date]')].some((e) => e.getAttribute('data-declutter-date') !== id);
  }).length;
  return { url: location.href, cards: cards.length, dated: ours.filter((n) => n === 2).length, doubled: ours.filter((n) => n > 2).length,
    wrongId, sample: bylines.slice(0, 3) };
});

const open = async (url) => {
  for (let i = 0; i < 2; i++) { // the first load can land on Google's consent page
    await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(9000);
    if (await page.locator('ytm-video-with-context-renderer').count().catch(() => 0)) return;
  }
};

await open('https://m.youtube.com/watch?v=dQw4w9WgXcQ');
let r = await state();
check('full load: related videos listed (check is meaningful)', r.cards >= 5, JSON.stringify(r));
check('full load: dates added to the first related videos', r.dated >= 5, JSON.stringify(r));
check('full load: no card dated twice or with another video\'s date', r.doubled === 0 && r.wrongId === 0, JSON.stringify(r));

const before = r.url;
await page.locator('ytm-video-with-context-renderer a[href*="/watch?"]').nth(2).click();
await page.waitForTimeout(9000);
r = await state();
check('in-app navigation: another video opened without a reload', r.url !== before, r.url);
check('in-app navigation: dates added for the new related videos', r.dated >= 5, JSON.stringify(r));
check('in-app navigation: no stale or doubled dates', r.doubled === 0 && r.wrongId === 0, JSON.stringify(r));

await setSettings(sw, { dates: false });
await page.waitForTimeout(1500);
r = await state();
check('setting off: dates removed', r.dated === 0, JSON.stringify(r));

// Off at load, then switched on with the page open: the dates come back without a reload.
await open('https://m.youtube.com/watch?v=dQw4w9WgXcQ');
r = await state();
check('off at load: no dates', r.cards >= 5 && r.dated === 0, JSON.stringify(r));
await setSettings(sw, { dates: true });
await page.waitForTimeout(2000);
r = await state();
check('switched on with the page open: dates appear', r.dated >= 5, JSON.stringify(r));

// Elsewhere YouTube shows the date itself: nothing added on search results.
await open('https://m.youtube.com/results?search_query=lidl');
check('search results: nothing added', await page.evaluate(() => document.querySelectorAll('[data-declutter-date]').length) === 0);

await close();
const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
