// App Store screenshots at Apple's required sizes -> dist/appstore-screenshots/<device>/.
//   iphone: 1320x2868 (6.9")   ipad: 2064x2752 (13")   mac: 2880x1800
// The extension's real UI (popup + settings), rendered in Chromium with the store build, on a captioned canvas.
//   node build.mjs --store chrome && node store/appstore-screenshots.mjs
import fs from 'node:fs';
import path from 'node:path';
import { consentCheck, launch, root } from '../test/lib.mjs';

const DEVICES = {
  iphone: { w: 440, h: 956, scale: 3, ios: true },
  ipad: { w: 1032, h: 1376, scale: 2, ios: true },
  mac: { w: 1440, h: 900, scale: 2, ios: false },
};
const SHOTS = [
  { name: '1-popup', title: 'cookie banners,\nanswered for you', body: 'Refuses tracking by default. Per site: refuse, accept or leave alone.' },
  { name: '2-choice', title: 'your choice,\ncategory by category', body: 'Allow only what you want. Applied through the banner’s own settings.', tab: 'choice' },
  { name: '3-about', title: 'nothing leaves\nyour device', body: 'No account, no analytics, no server. Counters stay local.', tab: 'about' },
];
const out = path.join(root, 'dist/appstore-screenshots');
fs.rmSync(out, { recursive: true, force: true });

const { ctx, sw, close } = await launch({ walls: null });
const extId = new URL(sw.url()).host;
const site = await ctx.newPage();
const r = await consentCheck(site, sw, { host: 'stackoverflow.com', expect: 'done' });
if (!r.ok) throw new Error(`stackoverflow not refused: ${JSON.stringify(r.state)}`);
const tabId = await sw.evaluate(async (u) => (await chrome.tabs.query({})).find((t) => t.url === u)?.id, site.url());

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>');
for (const [device, d] of Object.entries(DEVICES)) {
  fs.mkdirSync(path.join(out, device), { recursive: true });
  const landscape = d.w > d.h;
  for (const shot of SHOTS) {
    // The UI image: the popup (as the toolbar/page menu shows it) or a settings tab.
    const ui = await ctx.newPage({});
    await ui.emulateMedia({ colorScheme: 'light' });
    let png;
    if (!shot.tab) {
      await ui.setViewportSize({ width: (d.ios ? Math.min(d.w - 48, 420) : 300) * d.scale, height: 900 * d.scale });
      await ui.goto(`chrome-extension://${extId}/popup/popup.html?tab=${tabId}`);
      await ui.evaluate(([ios, z]) => { if (ios) document.documentElement.classList.add('ios'); document.documentElement.style.zoom = z; }, [d.ios, d.scale]);
      await ui.waitForTimeout(800);
      png = await ui.locator('body').screenshot();
    } else {
      const uw = landscape ? 760 : d.w - 48, uh = landscape ? d.h - 140 : Math.round(d.h * 0.72);
      await ui.setViewportSize({ width: uw * d.scale, height: uh * d.scale });
      await ui.goto(`chrome-extension://${extId}/options/options.html#${shot.tab}`);
      await ui.evaluate((z) => { document.documentElement.style.zoom = z; }, d.scale);
      await ui.waitForTimeout(700);
      png = await ui.screenshot();
    }
    await ui.close();

    const canvas = await ctx.newPage();
    await canvas.setViewportSize({ width: d.w * d.scale, height: d.h * d.scale });
    const img = `data:image/png;base64,${png.toString('base64')}`;
    const caption = `<div class="cap"><div class="t">${esc(shot.title)}</div><p>${esc(shot.body)}</p></div>`;
    const frame = `<img src="${img}" class="${shot.tab ? 'page' : 'pop'}">`;
    await canvas.setContent(`<style>
      html { zoom: ${d.scale}; }
      body { margin: 0; width: ${d.w}px; height: ${d.h}px; background: #f7f7f7; color: #1a1a1a; overflow: hidden;
        font-family: ui-monospace, 'SF Mono', Menlo, monospace; display: flex; box-sizing: border-box;
        ${landscape ? 'flex-direction: row; align-items: center; justify-content: center; gap: 72px; padding: 0 64px;'
                    : 'flex-direction: column; align-items: center; padding: 64px 24px 0; gap: 40px;'} }
      .cap { ${landscape ? 'max-width: 440px;' : 'text-align: center; max-width: 92%;'} }
      .t { font-size: ${landscape ? 40 : Math.round(d.w / 13)}px; line-height: 1.15; }
      p { font-size: ${landscape ? 18 : Math.round(d.w / 30)}px; line-height: 1.5; color: #737373; margin: 18px 0 0; }
      img { box-shadow: 0 12px 48px rgba(0,0,0,.14); border-radius: 16px; background: #fff; }
      img.pop { width: ${d.ios ? Math.min(d.w - 48, 420) : 300}px; }
      img.page { width: ${landscape ? 760 : d.w - 48}px; }
    </style>${caption}${frame}`);
    await canvas.waitForTimeout(200);
    await canvas.screenshot({ path: path.join(out, device, `${shot.name}.png`) });
    await canvas.close();
  }
}
await close();
console.log(`wrote ${Object.keys(DEVICES).length * SHOTS.length} screenshots to ${path.relative(root, out)}`);
