// Top-200 CZ run (2026-11-23). node research/consent-run-2026-11-23/run.mjs ext|none [host ...]
// Writes raw/<mode>[-<tag>].jsonl. Same harness as the canary (test/lib.mjs), 3 workers, walls manual.
import fs from 'node:fs';
import path from 'node:path';
import { launch, consentCheck, root } from '../../test/lib.mjs';

const [mode, ...rest] = process.argv.slice(2);
const tag = process.env.TAG ? '-' + process.env.TAG : '';
const dir = path.join(root, 'research/consent-run-2026-11-23');
const all = JSON.parse(fs.readFileSync(path.join(dir, 'sites.json'), 'utf8')).sites;
const todo = rest.length ? all.filter((s) => rest.includes(s.host)) : all;
const outFile = path.join(dir, 'raw', mode + tag + '.jsonl');
fs.writeFileSync(outFile, '');
fs.mkdirSync(path.join(dir, 'shots'), { recursive: true });

const { ctx, sw, close } = await launch({ extension: mode === 'ext' });
const queue = [...todo];
let done = 0;
await Promise.all(Array.from({ length: 3 }, async () => {
  let page = await ctx.newPage();
  while (queue.length) {
    const site = queue.shift();
    let navs = 0;
    const onNav = (f) => { if (f === page.mainFrame()) navs++; };
    page.on('framenavigated', onNav);
    const t0 = Date.now();
    const r = await Promise.race([
      consentCheck(page, sw, { host: site.host, expect: 'done' }, 15000),
      new Promise((res) => setTimeout(() => res({ crash: 'timeout 90s' }), 90000)),
    ]).catch((e) => ({ crash: String(e.message || e).split('\n')[0] }));
    page.off('framenavigated', onNav);
    let tcf = null, url = null, title = null, textLen = null;
    try {
      url = page.url();
      ({ tcf, title, textLen } = await page.evaluate(async () => {
        let tcf = null;
        if (typeof window.__tcfapi === 'function') tcf = await new Promise((res) => { const to = setTimeout(() => res('timeout'), 3000); try { window.__tcfapi('getTCData', 2, (d, ok) => { clearTimeout(to); if (!ok || !d) return res('noData'); const pc = d.purpose?.consents || {}; res({ status: d.eventStatus, cmpId: d.cmpId, consented: Object.keys(pc).filter((k) => pc[k]).join(','), hasTC: !!d.tcString }); }); } catch (e) { clearTimeout(to); res('err'); } });
        return { tcf, title: document.title.slice(0, 80), textLen: (document.body?.innerText || '').length };
      }));
    } catch {}
    const rec = { n: site.n, host: site.host, mode, state: r.state ?? null, bannerVisible: !!r.bannerVisible, banners: r.banners ?? [], err: r.err ?? null, crash: r.crash ?? null, navs, url, title, textLen, tcf, ms: Date.now() - t0 };
    fs.appendFileSync(outFile, JSON.stringify(rec) + '\n');
    if (r.bannerVisible || (mode === 'ext' && r.state?.consent !== 'done')) await page.screenshot({ path: path.join(dir, 'shots', site.host + '-' + mode + tag + '.png') }).catch(() => {});
    if (r.crash) { await page.close().catch(() => {}); page = await ctx.newPage(); }
    console.log(++done + '/' + todo.length, site.host, r.state?.consent ?? '-', r.bannerVisible ? 'BANNER' : '', r.err ?? r.crash ?? '');
  }
  await page.close().catch(() => {});
}));
await close();
