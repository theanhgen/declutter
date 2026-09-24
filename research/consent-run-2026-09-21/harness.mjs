import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
import fs from 'fs'; import os from 'os'; import path from 'path';
const [,, cfg, outFile, ...sites] = process.argv;
// Set via env; the 2026-09-21 run used builds in a scratch dir that no longer exists.
const exts = { none: null, com: process.env.COM_BUILD && path.resolve(process.env.COM_BUILD), ac: process.env.AC_BUILD && path.resolve(process.env.AC_BUILD) };
const ext = exts[cfg];
const exe = path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
fs.mkdirSync(path.resolve('profiles'), { recursive: true }); const dir = fs.mkdtempSync(path.resolve('profiles', 'pw-' + cfg + '-'));
const args = ['--disable-blink-features=AutomationControlled'];
if (ext) args.push(`--disable-extensions-except=${ext}`, `--load-extension=${ext}`);
const ctx = await chromium.launchPersistentContext(dir, { channel: 'chromium', headless: true, args, locale: 'cs-CZ', viewport: { width: 1280, height: 900 },
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36' });
await new Promise(r => setTimeout(r, 12000));
console.error(cfg, 'service workers:', ctx.serviceWorkers().map(w => w.url().slice(0, 60)));
const outcome = fs.readFileSync('outcome.js', 'utf8');
const out = fs.createWriteStream(outFile);
async function run(site) {
  const page = await ctx.newPage(); const logs = [];
  page.on('console', m => { const t = m.text(); if (/autoconsent|optOut|opt-out|CMP|consent-o-matic|ConsentOMatic|handled|cmp/i.test(t) && logs.length < 12) logs.push(t.slice(0, 160)); });
  let err = null;
  try { await page.goto('https://' + site + '/', { waitUntil: 'domcontentloaded', timeout: 30000 }); } catch (e) { err = e.message.slice(0, 80); }
  await page.waitForTimeout(20000);
  let res = null;
  try { res = JSON.parse(await page.evaluate(outcome.replace(/^\(async/, '(async').trim().replace(/\)\(\)\s*$/, ')()'))); } catch (e) { res = { evalErr: e.message.slice(0, 120) }; }
  try { await page.screenshot({ path: `shots/H_${cfg}_${site.replace(/\//g, '_')}.png` }); } catch {}
  out.write(JSON.stringify({ site, cfg, err, res, logs }) + '\n');
  await page.close();
}
const q = [...sites]; const workers = [];
for (let i = 0; i < 2; i++) workers.push((async () => { while (q.length) { const s = q.shift(); await run(s); } })());
await Promise.all(workers); out.end(); await ctx.close(); console.error('DONE', cfg);
