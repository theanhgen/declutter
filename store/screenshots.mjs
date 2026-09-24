// Store screenshots, 1280x800 PNG (Chrome Web Store, Edge, AMO all accept this size) -> dist/screenshots/.
//   npm run store   (store build first, so the settings show the store defaults)
import fs from 'node:fs';
import path from 'node:path';
import { consentCheck, launch, root } from '../test/lib.mjs';

const out = path.join(root, 'dist/screenshots');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const { ctx, sw, close } = await launch({ walls: null });
const extId = new URL(sw.url()).host;
const page = await ctx.newPage();
await page.emulateMedia({ colorScheme: 'light' });

// 1. The popup on a site whose banner was just refused, on a plain canvas with a caption.
const r = await consentCheck(page, sw, { host: 'www.bazos.cz', expect: 'done' });
if (!r.ok) throw new Error(`bazos not refused: ${JSON.stringify(r.state)}`);
const tabId = await sw.evaluate(async (u) => (await chrome.tabs.query({})).find((t) => t.url === u)?.id, page.url());
const pop = await ctx.newPage();
await pop.emulateMedia({ colorScheme: 'light' });
await pop.setViewportSize({ width: 300, height: 600 });
await pop.goto(`chrome-extension://${extId}/popup/popup.html?tab=${tabId}`);
await pop.waitForTimeout(800);
const popupPng = await pop.locator('body').screenshot();
await pop.close();

const shot = await ctx.newPage();
await shot.emulateMedia({ colorScheme: 'light' });
await shot.setViewportSize({ width: 1280, height: 800 });
await shot.setContent(`<body style="margin:0;height:800px;display:flex;align-items:center;justify-content:center;gap:96px;
  background:#f7f7f7;font-family:ui-monospace,'SF Mono',Menlo,monospace;color:#1a1a1a">
  <div style="max-width:420px"><div style="font-size:34px;line-height:1.2">cookie banners,<br>answered for you</div>
  <p style="font-size:17px;line-height:1.5;color:#737373">Refuses tracking by default, or applies the categories you
  allow. Per-site accept / refuse / leave alone. Nothing leaves your browser.</p></div>
  <img src="data:image/png;base64,${popupPng.toString('base64')}" style="width:300px;border-radius:14px;
  box-shadow:0 10px 40px rgba(0,0,0,.14)"></body>`);
await shot.screenshot({ path: path.join(out, '1-popup.png') });

// 2-5. Settings tabs as they are.
for (const [i, tab] of [[2, 'choice'], [3, 'youtube'], [4, 'walls'], [5, 'about']]) {
  await shot.goto(`chrome-extension://${extId}/options/options.html#${tab}`);
  await shot.waitForTimeout(600);
  await shot.screenshot({ path: path.join(out, `${i}-${tab}.png`) });
}
await close();
console.log(`wrote ${fs.readdirSync(out).length} screenshots to ${path.relative(root, out)}`);
