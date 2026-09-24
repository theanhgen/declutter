import { createRequire } from 'module'; const require = createRequire(import.meta.url);
const { chromium } = require('./autoconsent/node_modules/playwright');
const b = await chromium.launch({ channel: 'chromium', headless: true, args: ['--disable-blink-features=AutomationControlled'] });
const ctx = await b.newContext({ locale: 'cs-CZ', viewport: { width: 1280, height: 900 }, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36' });
const css = '#cpexSubs_modalWrapper,#cpexSubs_veil,szn-cwl,a.cookie-info{display:none!important} body.subscriptionModalOpen{overflow:auto!important}';
for (const s of ['www.blesk.cz', 'www.novinky.cz', 'www.idnes.cz']) {
  const p = await ctx.newPage(); await p.goto('https://' + s + '/', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(10000);
  await p.addStyleTag({ content: css }); await p.waitForTimeout(500);
  await p.mouse.wheel(0, 1500); await p.waitForTimeout(1000);
  const r = await p.evaluate(() => { const el = document.elementFromPoint(640, 450); return { scrollY: Math.round(scrollY), centerEl: el ? el.tagName + '#' + el.id + '.' + String(el.className).slice(0, 40) : null, articles: document.querySelectorAll('article, a[href*="clanek"], a[href*="/zpravy/"]').length }; });
  // try opening first article link
  const href = await p.evaluate(() => { const a = [...document.querySelectorAll('a[href]')].find(a => /clanek|\/zpravy\/.+|\.A\d{6}/.test(a.href) && a.offsetHeight > 0); return a && a.href; });
  let art = null;
  if (href) { await p.goto(href, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(8000); art = await p.evaluate(() => ({ url: location.href.slice(0, 90), wall: !!document.querySelector('#cpexSubs_modalWrapper'), cwl: !!document.querySelector('szn-cwl'), cookieInfo: !!document.querySelector('a.cookie-info'), redirectedToConsent: /nastaveni-souhlasu|cmp\.seznam/.test(location.href), textLen: document.body.innerText.length })); }
  console.log(s, JSON.stringify(r), 'article:', JSON.stringify(art));
  await p.close();
}
await b.close();
