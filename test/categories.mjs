// "Your choice" with a mix (preferences + analytics on, ads/content/storage/other off), checked against what each
// CMP itself recorded afterwards.   npm run build && node test/categories.mjs
import { launch, reporter, setSettings, tabState } from './lib.mjs';

const MIX = { A: true, B: true, D: false, E: false, F: false, X: false };
const SITES = [
  { host: 'www.bezrealitky.cz', cmp: 'cookiebot', read: () => window.Cookiebot?.consent && JSON.stringify({ p: window.Cookiebot.consent.preferences, s: window.Cookiebot.consent.statistics, m: window.Cookiebot.consent.marketing }),
    ok: (v) => v === JSON.stringify({ p: true, s: true, m: false }) },
  { host: 'www.csfd.cz', cmp: 'didomi', read: () => { const e = window.Didomi?.getUserStatus?.().purposes.consent.enabled ?? []; return JSON.stringify({ analytics: e.includes('market_research') || e.includes('improve_products'), ads: e.some((p) => /ads/.test(p)) }); },
    ok: (v) => v === JSON.stringify({ analytics: true, ads: false }) },
  { host: 'stackoverflow.com', cmp: 'onetrust', read: () => window.OnetrustActiveGroups ?? '',
    ok: (v) => /C0002/.test(v) && /C0003/.test(v) && !/C0004/.test(v) },
  { host: 'www.ceskatelevize.cz', cmp: 'cookieconsent-v3', read: () => JSON.stringify(window.CookieConsent?.getUserPreferences?.().acceptedCategories ?? []),
    ok: (v) => /analyt|perform|stat/i.test(v) && !/ad|market|target/i.test(v) },
];

const { results, check } = reporter();
const { ctx, sw, close } = await launch();
await setSettings(sw, { categories: MIX });
const page = await ctx.newPage();
for (const site of SITES) {
  await page.goto(`https://${site.host}/`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(15000);
  const state = await tabState(sw, page.url());
  const recorded = await page.evaluate(site.read).catch((e) => `err ${e.message}`);
  check(`${site.cmp} on ${site.host}: mix applied`, state?.consent === 'choice' && state.adapter === site.cmp && site.ok(recorded),
    JSON.stringify({ state, recorded }));
}
// No adapter (consentmanager on o2): a mix falls back to refusing everything.
await page.goto('https://www.o2.cz/', { waitUntil: 'domcontentloaded' }).catch(() => {});
await page.waitForTimeout(15000);
const st = await tabState(sw, page.url());
check('no adapter (o2 / consentmanager): falls back to refuse', st?.consent === 'done' && st.choiceFallback === true, JSON.stringify(st));

await close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
