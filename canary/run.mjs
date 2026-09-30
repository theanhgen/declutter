// Daily canary: build/chrome against YouTube + every site in canary/sites.json.
// Sends a Telegram message when the set of failing checks differs from the previous day's run, when days were
// missed, when the run crashes (or the --build fails), or when most sites did not load. Writes
// canary/results/<date>.json once the alert is out. It only detects: fixes are made by hand (D7).
//   npm run build && npm run canary      (or: node canary/run.mjs --build)
// Telegram (optional): bot token in Keychain service "declutter-telegram-token" (or
// DECLUTTER_TELEGRAM_TOKEN), chat id in DECLUTTER_TELEGRAM_CHAT_ID.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { launch, reporter, shortsChecks, consentCheck, root } from '../test/lib.mjs';
import { alertText, looksOffline, missedDays, previousFile } from './alert.mjs';

const WORKERS = 3;
const args = process.argv.slice(2);
// --build: build/chrome first, inside the crash handler, so a broken build alerts too (the LaunchAgent uses it).
const build = args.includes('--build');
const only = args.filter((a) => !a.startsWith('--'));
const { sites } = JSON.parse(fs.readFileSync(path.join(root, 'canary/sites.json'), 'utf8'));
const todo = only.length ? sites.filter((s) => only.includes(s.host)) : sites;

const { results, check } = reporter();
const consent = [];
let close = async () => {};
try {
  if (build) execFileSync(process.execPath, [path.join(root, 'build.mjs'), 'chrome'], { stdio: 'inherit' });
  const run = await launch();
  close = run.close;
  const { ctx, sw } = run;

  if (!only.length) {
    const yt = await ctx.newPage();
    await shortsChecks(yt, sw, check);
    await yt.close();
  }

  const queue = [...todo];
  await Promise.all(Array.from({ length: WORKERS }, async () => {
    const page = await ctx.newPage();
    while (queue.length) {
      const site = queue.shift();
      // One site throwing (e.g. the service worker handle going away) fails that site, not the whole run.
      const r = await consentCheck(page, sw, site, site.wait)
        .catch((e) => ({ host: site.host, expect: site.expect, ok: false, banners: [], crash: String(e.message || e).split('\n')[0] }));
      consent.push(r);
      check(`consent ${site.host}: ${site.expect}`, r.ok,
        r.ok ? '' : JSON.stringify({ state: r.state, banner: r.banners[0]?.slice(0, 120), err: r.err, crash: r.crash }));
      if (!r.ok) await page.screenshot({ path: path.join(root, `canary/shots/${site.host}.png`) }).catch(() => {});
    }
    await page.close();
  }));
} catch (e) {
  await close().catch(() => {});
  console.error(e);
  if (!only.length) await telegram(`declutter canary crashed:\n${String(e.stack || e).split('\n').slice(0, 4).join('\n')}`);
  process.exit(2);
}
await close();

const failing = results.filter((r) => !r.ok).map((r) => r.name).sort();
const summary = `${results.length - failing.length}/${results.length} passed`;
console.log(`\n${summary}`);
if (only.length) process.exit(failing.length ? 1 : 0);

// ---- compare with the previous run, alert on change ----
const dir = path.join(root, 'canary/results');
fs.mkdirSync(dir, { recursive: true });
const today = new Date().toISOString().slice(0, 10);
if (looksOffline(consent)) {
  // Not saved: tomorrow compares against the last real run instead of a day of load errors.
  await telegram(`declutter canary: ${consent.filter((r) => r.err).length}/${consent.length} sites did not load. Network down? Results not saved.`);
  process.exit(2);
}
const previous = previousFile(fs.readdirSync(dir), today);
const before = previous ? JSON.parse(fs.readFileSync(path.join(dir, previous), 'utf8')).failing : null;
const text = alertText({ summary, failing, before, missed: missedDays(previous, today) });
// Saved only once the alert is out: if the send fails, the next run sees the same change and alerts again.
if (!text || await telegram(text)) {
  fs.writeFileSync(path.join(dir, `${today}.json`),
    JSON.stringify({ at: new Date().toISOString(), summary, failing, results, consent }, null, 1));
} else {
  console.error('alert not sent; results not saved, so the next run alerts again');
}
process.exit(failing.length ? 1 : 0);

async function telegram(text) {
  let token = process.env.DECLUTTER_TELEGRAM_TOKEN;
  if (!token) {
    try {
      token = execFileSync('/usr/bin/security', ['find-generic-password', '-s', 'declutter-telegram-token', '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch { /* not configured */ }
  }
  const chat = process.env.DECLUTTER_TELEGRAM_CHAT_ID;
  // Not configured counts as sent: there is nowhere to retry to.
  if (!token || !chat) { console.log('(Telegram not configured; alert not sent)\n' + text); return true; }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
    });
    if (!res.ok) console.error('Telegram send failed', res.status, await res.text());
    return res.ok;
  } catch (e) {
    console.error('Telegram send failed', e.message);
    return false;
  }
}
