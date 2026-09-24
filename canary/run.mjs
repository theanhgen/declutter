// Daily canary: build/chrome against YouTube + every site in canary/sites.json.
// Writes canary/results/<date>.json and sends a Telegram message when the set of failing
// checks differs from the previous run. It only detects: fixes are made by hand (D7).
//   npm run build && npm run canary
// Telegram (optional): bot token in Keychain service "declutter-telegram-token" (or
// DECLUTTER_TELEGRAM_TOKEN), chat id in DECLUTTER_TELEGRAM_CHAT_ID.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { launch, reporter, shortsChecks, consentCheck, root } from '../test/lib.mjs';

const WORKERS = 3;
const only = process.argv.slice(2);
const { sites } = JSON.parse(fs.readFileSync(path.join(root, 'canary/sites.json'), 'utf8'));
const todo = only.length ? sites.filter((s) => only.includes(s.host)) : sites;

const { results, check } = reporter();
const { ctx, sw, close } = await launch();

if (!only.length) {
  const yt = await ctx.newPage();
  await shortsChecks(yt, sw, check);
  await yt.close();
}

const consent = [];
const queue = [...todo];
await Promise.all(Array.from({ length: WORKERS }, async () => {
  const page = await ctx.newPage();
  while (queue.length) {
    const site = queue.shift();
    const r = await consentCheck(page, sw, site);
    consent.push(r);
    check(`consent ${site.host}: ${site.expect}`, r.ok,
      r.ok ? '' : JSON.stringify({ state: r.state, banner: r.banners[0]?.slice(0, 120), err: r.err }));
    if (!r.ok) await page.screenshot({ path: path.join(root, `canary/shots/${site.host}.png`) }).catch(() => {});
  }
  await page.close();
}));
await close();

const failing = results.filter((r) => !r.ok).map((r) => r.name).sort();
const summary = `${results.length - failing.length}/${results.length} passed`;
console.log(`\n${summary}`);
if (only.length) process.exit(failing.length ? 1 : 0);

// ---- compare with the previous run, alert on change ----
const dir = path.join(root, 'canary/results');
fs.mkdirSync(dir, { recursive: true });
const previous = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().pop();
const before = previous ? JSON.parse(fs.readFileSync(path.join(dir, previous), 'utf8')).failing : null;
fs.writeFileSync(path.join(dir, `${new Date().toISOString().slice(0, 10)}.json`),
  JSON.stringify({ at: new Date().toISOString(), summary, failing, results, consent }, null, 1));

const newlyFailing = failing.filter((f) => !(before ?? []).includes(f));
const recovered = (before ?? []).filter((f) => !failing.includes(f));
if (newlyFailing.length || recovered.length || (!before && failing.length)) {
  const lines = [`declutter canary: ${summary}`];
  if (newlyFailing.length) lines.push('', 'Broke:', ...newlyFailing.map((f) => `- ${f}`));
  if (recovered.length) lines.push('', 'Fixed:', ...recovered.map((f) => `- ${f}`));
  await telegram(lines.join('\n'));
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
  if (!token || !chat) { console.log('(Telegram not configured; alert not sent)\n' + text); return; }
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
  });
  if (!res.ok) console.error('Telegram send failed', res.status, await res.text());
}
