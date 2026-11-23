// node research/consent-run-2026-11-23/probe.mjs host... : no extension, dumps banner buttons + CMP guess
import fs from 'node:fs'; import path from 'node:path';
import { launch, root } from '../../test/lib.mjs';
const dir = path.join(root, 'research/consent-run-2026-11-23');
const js = fs.readFileSync(path.join(dir, 'probe.js'), 'utf8');
const hosts = process.argv.slice(2);
const out = path.join(dir, 'raw', 'probe.jsonl'); fs.writeFileSync(out, '');
const { ctx, close } = await launch({ extension: false });
const q = [...hosts];
await Promise.all(Array.from({ length: 3 }, async () => {
  const page = await ctx.newPage();
  while (q.length) {
    const host = q.shift();
    let navs = 0; const on = (f) => { if (f === page.mainFrame()) navs++; }; page.on('framenavigated', on);
    await page.goto('https://' + host + '/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(12000);
    page.off('framenavigated', on);
    const r = await page.evaluate(js).then(JSON.parse).catch((e) => ({ err: e.message }));
    fs.appendFileSync(out, JSON.stringify({ host, navs, ...r }) + '\n');
  }
  await page.close();
}));
await close();
