// YouTube Playables (games), desktop and mobile. The home shelf needs a login, so the test builds shelves and menu
// entries on the public /playables page out of a real game card's link and element name, and checks that the page's
// own game cards stay visible.
//   npm run build && node test/playables.mjs
import path from 'node:path';
import { webkit } from 'playwright';
import { launch, reporter, root, setSettings } from './lib.mjs';

const { results, check } = reporter();

// Adds a shelf with a game link, a shelf with a game card element, a menu entry (desktop) and a control shelf with a
// video link, once per page; returns what is visible.
const mark = (page, y) => page.evaluate((y) => {
  const real = document.querySelector('a[href^="/playables/"]');
  if (!real) return { real: 0, url: location.href };
  // Desktop YouTube (Polymer) stamps its own template into the element when it is attached, replacing any children,
  // so the content goes in afterwards, into the shelf's own #content where the real shelf has its cards.
  const shelf = (id, child) => {
    let s = document.getElementById(id);
    if (!s) {
      s = Object.assign(document.createElement(`${y}-rich-section-renderer`), { id });
      s.style.display = 'block';
      document.body.prepend(s);
      (s.querySelector('#content') ?? s).append(child, 'shelf');
    }
    return s;
  };
  const byLink = shelf('dt-link', Object.assign(document.createElement('a'), { href: real.getAttribute('href'), textContent: 'a game' }));
  const byTag = shelf('dt-tag', document.createElement('mini-game-card-view-model'));
  const control = shelf('dt-video', Object.assign(document.createElement('a'), { href: '/watch?v=dQw4w9WgXcQ', textContent: 'a video' }));
  let guide = null;
  if (y === 'ytd') {
    guide = document.getElementById('dt-guide');
    if (!guide) {
      guide = Object.assign(document.createElement('ytd-guide-entry-renderer'), { id: 'dt-guide' });
      guide.style.display = 'block';
      document.body.prepend(guide);
      // A real entry is <ytd-guide-entry-renderer><a id="endpoint" href=…>; the stamped template has that link.
      const a = guide.querySelector(':scope > a') ?? guide.appendChild(document.createElement('a'));
      Object.assign(a, { href: '/playables', textContent: 'Playables' });
    }
  }
  const shown = (e) => !!e && e.getClientRects().length > 0;
  const cards = [...document.querySelectorAll('a[href^="/playables/"]')].filter((a) => !a.closest('[id^="dt-"]'));
  return { real: cards.length, realShown: cards.filter(shown).length, byLink: shown(byLink), byTag: shown(byTag),
    control: shown(control), guide: guide ? shown(guide) : null };
}, y);

for (const mobile of [false, true]) {
  const where = mobile ? 'mobile' : 'desktop';
  const [host, y] = mobile ? ['m', 'ytm'] : ['www', 'ytd'];
  const { ctx, sw, close } = await launch({ mobile });
  const page = await ctx.newPage();
  const open = async () => {
    for (let i = 0; i < 2; i++) { // the first load can land on Google's consent page
      await page.goto(`https://${host}.youtube.com/playables`, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(9000);
      if (await page.locator('a[href^="/playables/"]').count().catch(() => 0)) return;
    }
  };
  await open();
  let r = await mark(page, y);
  check(`${where}: /playables page shows its games`, r.real > 0 && r.realShown > 0, JSON.stringify(r));
  check(`${where}: control shelf with a video stays (check is meaningful)`, r.control === true);
  check(`${where}: shelf hidden (by /playables/ link)`, r.byLink === false);
  check(`${where}: shelf hidden (by game card element)`, r.byTag === false);
  if (!mobile) check(`${where}: Playables menu entry hidden`, r.guide === false);

  await setSettings(sw, { playables: false });
  await page.waitForTimeout(3000); // the tab reloads on the toggle
  await open();
  r = await mark(page, y);
  check(`${where}: switch off, shelves and menu entry visible again`, r.byLink && r.byTag && r.control && r.guide !== false, JSON.stringify(r));
  await close();
}

// Safari's engine: Playwright cannot load an extension into WebKit, so check that build/safari's stylesheet parses
// and hides the same things there. Skipped when WebKit is missing (npx playwright install webkit).
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
for (const mobile of [false, true]) {
  const where = `webkit ${mobile ? 'mobile' : 'desktop'} (build/safari css)`;
  const browser = await webkit.launch().catch(() => null);
  if (!browser) { console.log(`SKIP  ${where}: engine not installed`); continue; }
  const [host, y] = mobile ? ['m', 'ytm'] : ['www', 'ytd'];
  const ctx = await browser.newContext({ locale: 'cs-CZ', ...(mobile && { userAgent: IPHONE, viewport: { width: 393, height: 852 }, hasTouch: true }) });
  const page = await ctx.newPage();
  for (let i = 0; i < 2; i++) {
    await page.goto(`https://${host}.youtube.com/playables`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(6000);
    if (await page.locator('a[href^="/playables/"]').count().catch(() => 0)) break;
    await page.getByRole('button', { name: /Odmítnout vše|Reject all/ }).first().click().catch(() => {}); // Google's consent page
    await page.waitForTimeout(6000);
  }
  let r = await mark(page, y);
  check(`${where}: without the stylesheet, built shelves show (check is meaningful)`, r.real > 0 && r.byLink && r.byTag && r.control, JSON.stringify(r));
  await page.addStyleTag({ path: path.join(root, 'build/safari/shorts/shorts.css') });
  r = await mark(page, y);
  check(`${where}: shelves and menu entry hidden, games page and video stay`,
    r.byLink === false && r.byTag === false && r.control && r.realShown > 0 && r.guide !== true, JSON.stringify(r));
  await page.evaluate(() => document.documentElement.setAttribute('data-declutter-playables', 'off'));
  r = await mark(page, y);
  check(`${where}: switch off, visible again`, r.byLink && r.byTag && r.control, JSON.stringify(r));
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
