// The popup's status for each state of a page, on a local page (no live sites).
//   npm run build && node test/states.mjs
import http from 'node:http';
import { launch, reporter, setSettings } from './lib.mjs';

const { results, check } = reporter();
const server = http.createServer((_, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>t</title><p>plain page'); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;

let { ctx, sw, close } = await launch();
const extId = new URL(sw.url()).host;
const page = await ctx.newPage();
await page.goto(url);
await page.waitForTimeout(800);
const tabId = await sw.evaluate(async (u) => (await chrome.tabs.query({})).find((t) => t.url === u)?.id, url);

const popup = async (id = tabId) => {
  const pop = await ctx.newPage();
  await pop.goto(`chrome-extension://${extId}/popup/popup.html?tab=${id}`);
  await pop.waitForTimeout(600);
  const status = await pop.locator('#status').innerText().catch(() => '');
  return { pop, status };
};
const setTabState = (patch) => sw.evaluate(async ([id, p]) => {
  const k = `tab-${id}`;
  await chrome.storage.session.set({ [k]: { ...(await chrome.storage.session.get(k))[k], ...p } });
}, [tabId, patch]);

let { pop, status } = await popup();
check('plain page: no known banner', status.includes('no known cookie banner found'), status);
check('plain page: first segment says refuse', await pop.locator('#siteMode [data-mode=refuse]').innerText() === 'refuse');
await pop.close();

await setSettings(sw, { categories: { A: true, B: false, D: false, E: false, F: false, X: false } });
({ pop, status } = await popup());
check('category mix: first segment says your mix', await pop.locator('#siteMode [data-mode=refuse]').innerText() === 'your mix');
await pop.close();
await setSettings(sw, { categories: { A: false, B: false, D: false, E: false, F: false, X: false } });

await setSettings(sw, { consent: false });
({ pop, status } = await popup());
check('consent off: says off', status.includes('cookie banners: off'), status);
await pop.close();
await setSettings(sw, { consent: true });

await setTabState({ consent: 'failed', cmp: 'x' });
({ pop, status } = await popup());
check('failed: next step, no rule name', status.includes("couldn't answer") && status.includes('answer it yourself') && !status.includes('\nx'), status);
check('failed: report is the first action', await pop.locator('#actions > :first-child').getAttribute('id') === 'report');
await pop.close();

await setTabState({ consent: undefined, shortsLeak: 3, leakPath: '/results' });
({ pop, status } = await popup());
check('shorts caught: neutral row with count', status.includes('3 shorts caught by the backup check') && !(await pop.locator('#status .dot.bad').count()), status);
await pop.close();

const blank = await ctx.newPage();
await blank.goto('data:text/html,<p>not a web page');
// No host permission covers data: URLs, so the tab's url is hidden from the extension: take the newest tab.
const blankId = await sw.evaluate(async () => Math.max(...(await chrome.tabs.query({})).map((t) => t.id)));
({ pop, status } = await popup(blankId));
check('browser page: says it does not run there', status.includes("doesn't run on browser pages"), status);
await pop.close();

// No record for the tab (it was open before the extension loaded, or the state was lost): the popup pings the page.
// A live content script answers, so this is still "no banner", not "not running". (The orphaned case itself, a tab
// open across an update, can't be staged here: chrome.runtime.reload() doesn't bring an unpacked extension back
// under Playwright.)
await sw.evaluate((id) => chrome.storage.session.remove(`tab-${id}`), tabId);
({ pop, status } = await popup());
check('no record but live script: still no banner', status.includes('no known cookie banner found') && !(await pop.locator('#reload').isVisible()), status);
await pop.close();

await close();
server.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
