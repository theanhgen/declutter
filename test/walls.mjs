// Consent-or-pay walls, both modes, on the three wall families (CPEx, Seznam, Mafra).
//   npm run build && node test/walls.mjs
import { launch, reporter, setSettings, tabState } from './lib.mjs';

const { results, check } = reporter();
const wallVisible = (page) => page.evaluate(() => {
  const cpex = document.querySelector('#cpexSubs_consentButton');
  // Seznam leaves its bar in the page with visibility:hidden after consent.
  const szn = document.querySelector('szn-cwl')?.shadowRoot?.querySelector('#cwl-main[style*="visibility: visible"]');
  const mafra = document.querySelector('a.cookie-info[href*="nastaveni-souhlasu"]');
  return [cpex, szn, mafra].some((e) => e && e.getClientRects().length > 0) || /nastaveni-souhlasu/.test(location.href);
});
const tabId = (sw, url) => sw.evaluate(async (u) => (await chrome.tabs.query({})).find((t) => t.url === u)?.id, url);

// ---- manual (default): badge + accept from the popup ----
{
  const { ctx, sw, close } = await launch();
  const page = await ctx.newPage();
  const ext = await ctx.newPage();
  await ext.goto(`chrome-extension://${new URL(sw.url()).host}/options/options.html`);
  for (const [host, name] of [['www.blesk.cz', 'CPEx'], ['www.novinky.cz', 'Seznam'], ['www.idnes.cz', 'Mafra']]) {
    await page.goto(`https://${host}/`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(10000);
    const s = await tabState(sw, page.url());
    check(`manual ${name}: wall detected, left alone`, s?.consent === 'wall' && await wallVisible(page), JSON.stringify(s));
    const badge = await sw.evaluate(async (id) => chrome.action.getBadgeText({ tabId: id }), await tabId(sw, page.url()));
    check(`manual ${name}: Kč badge`, badge === 'Kč', badge);
    const ok = await ext.evaluate(async (id) => chrome.runtime.sendMessage({ type: 'acceptWall', tabId: id }), await tabId(sw, page.url()));
    await page.waitForTimeout(12000);
    check(`manual ${name}: "Accept this wall" gets you in`, ok && !(await wallVisible(page)) && page.url().includes(host), page.url().slice(0, 80));
  }
  await close();
}

// ---- auto: accepted without asking, articles open directly ----
{
  const { ctx, sw, close } = await launch({ walls: 'auto' });
  const page = await ctx.newPage();
  for (const [host, name, article] of [['www.blesk.cz', 'CPEx', null], ['www.novinky.cz', 'Seznam', 'a[href*="/clanek/"]'], ['www.idnes.cz', 'Mafra', 'a[href*="/zpravy/"]']]) {
    let url = `https://${host}/`;
    if (article) {
      // Find an article link without triggering the wall flow, then open it cold.
      const probe = await ctx.newPage();
      await probe.route('**/*', (r) => (r.request().resourceType() === 'document' ? r.continue() : r.abort()));
      await probe.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
      url = await probe.evaluate((sel) => document.querySelector(sel)?.href, article) ?? url;
      await probe.close();
    }
    await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(15000);
    check(`auto ${name}: accepted, content shown`, !(await wallVisible(page)) && page.url().includes(host), page.url().slice(0, 90));
  }
  await close();
}

// ---- fresh install: auto is the default ----
{
  const { ctx, sw, close } = await launch({ walls: null });
  const page = await ctx.newPage();
  await page.goto('https://www.blesk.cz/', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(12000);
  check('default (no settings): wall accepted automatically', !(await wallVisible(page)), JSON.stringify(await tabState(sw, page.url())));
  await close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
