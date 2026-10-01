// Community posts in YouTube feeds, desktop and mobile. The home and subscriptions feeds need a login, so the
// test marks real feed cards on a public channel's Videos tab (the same grid elements) as posts, with the link
// and element name taken from the channel's real Posts tab (which must stay visible).
//   npm run build && node test/posts.mjs
import path from 'node:path';
import { firefox, webkit } from 'playwright';
import { launch, reporter, root, setSettings } from './lib.mjs';

const { results, check } = reporter();
for (const mobile of [false, true]) {
  const where = mobile ? 'mobile' : 'desktop';
  const [host, y, post, feedPost] = mobile
    ? ['m', 'ytm', 'ytm-backstage-post-renderer', 'ytm-backstage-post-renderer']
    : ['www', 'ytd', 'ytd-backstage-post-renderer', 'ytd-post-renderer'];
  const { ctx, sw, close } = await launch({ mobile });
  const page = await ctx.newPage();
  const open = async (tab, sel) => {
    for (let i = 0; i < 2; i++) { // the first load can land on Google's consent page
      await page.goto(`https://${host}.youtube.com/@cybernews/${tab}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(9000);
      if (await page.locator(sel).count().catch(() => 0)) return;
    }
  };
  // Turn the first two real cards of the grid into posts; the third stays a video.
  const feed = (link) => page.evaluate(([y, feedPost, link]) => {
    const [byLink, byTag, video] = document.querySelectorAll(`${y}-rich-grid-renderer ${y}-rich-item-renderer`);
    if (!video) return { cards: 0 };
    byLink.append(Object.assign(document.createElement('a'), { href: link, textContent: 'a post' }));
    byTag.append(document.createElement(feedPost));
    const shown = (e) => e.getClientRects().length > 0;
    return { cards: 3, byLink: shown(byLink), byTag: shown(byTag), video: shown(video) };
  }, [y, feedPost, link]);

  await open('posts', post);
  const real = await page.evaluate((post) => {
    const p = document.querySelector(post);
    return { visible: !!p && p.getClientRects().length > 0, link: p?.querySelector('a[href*="/post/"]')?.getAttribute('href') };
  }, post);
  check(`${where}: channel Posts tab still shows its posts`, real.visible && /^\/post\//.test(real.link ?? ''), JSON.stringify(real));

  await open('videos', `${y}-rich-item-renderer`);
  let r = await feed(real.link);
  check(`${where}: feed grid has real cards (check is meaningful)`, r.cards === 3 && r.video, JSON.stringify(r));
  check(`${where}: feed post hidden (by /post/ link)`, r.byLink === false);
  check(`${where}: feed post hidden (by element name)`, r.byTag === false);

  await setSettings(sw, { posts: false });
  await page.waitForTimeout(3000); // the tab reloads on the toggle
  await open('videos', `${y}-rich-item-renderer`);
  r = await feed(real.link);
  check(`${where}: switch off, feed posts visible again`, r.byLink && r.byTag && r.video, JSON.stringify(r));
  await close();
}

// Safari's and Firefox's engines. Playwright cannot load an extension into them, so this checks what differs per
// engine: that each build's stylesheet parses and hides the same cards there. Skipped where the engine is missing
// (npx playwright install webkit firefox).
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
for (const [engine, build, mobile] of [[webkit, 'safari', false], [webkit, 'safari', true], [firefox, 'firefox', false]]) {
  const where = `${engine.name()} ${mobile ? 'mobile' : 'desktop'} (build/${build} css)`;
  const browser = await engine.launch().catch(() => null);
  if (!browser) { console.log(`SKIP  ${where}: engine not installed`); continue; }
  const [host, y, feedPost] = mobile ? ['m', 'ytm', 'ytm-backstage-post-renderer'] : ['www', 'ytd', 'ytd-post-renderer'];
  const ctx = await browser.newContext({ locale: 'cs-CZ', ...(mobile && { userAgent: IPHONE, viewport: { width: 393, height: 852 }, hasTouch: true }) });
  const page = await ctx.newPage();
  for (let i = 0; i < 2; i++) {
    await page.goto(`https://${host}.youtube.com/@cybernews/videos`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(6000);
    if (await page.locator(`${y}-rich-item-renderer`).count().catch(() => 0)) break;
    await page.getByRole('button', { name: /Odmítnout vše|Reject all/ }).first().click().catch(() => {}); // Google's consent page
    await page.waitForTimeout(6000);
  }
  const mark = () => page.evaluate(([y, feedPost]) => {
    const [byLink, byTag, video] = document.querySelectorAll(`${y}-rich-grid-renderer ${y}-rich-item-renderer`);
    if (!video) return { cards: 0, url: location.href };
    if (!byLink.querySelector('a[href*="/post/"]')) {
      byLink.append(Object.assign(document.createElement('a'), { href: '/post/Ugkx_test', textContent: 'a post' }));
      byTag.append(document.createElement(feedPost));
    }
    const shown = (e) => e.getClientRects().length > 0;
    return { cards: 3, byLink: shown(byLink), byTag: shown(byTag), video: shown(video) };
  }, [y, feedPost]);
  let r = await mark();
  check(`${where}: without the stylesheet, marked cards show (check is meaningful)`, r.cards === 3 && r.byLink && r.byTag && r.video, JSON.stringify(r));
  await page.addStyleTag({ path: path.join(root, `build/${build}/shorts/shorts.css`) });
  r = await mark();
  check(`${where}: feed posts hidden, video stays`, r.byLink === false && r.byTag === false && r.video === true, JSON.stringify(r));
  await page.evaluate(() => document.documentElement.setAttribute('data-declutter-posts', 'off'));
  r = await mark();
  check(`${where}: switch off, feed posts visible again`, r.byLink && r.byTag && r.video, JSON.stringify(r));
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
