// Builds build/<target>/ (an unpacked extension) for chrome and safari, plus build/data.json,
// the payload the extension also fetches remotely (D6).
//   node build.mjs            -> all targets
//   node build.mjs chrome     -> one target
//   DECLUTTER_DATA_URL=https://… node build.mjs   -> bake in the remote data URL
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const root = path.dirname(new URL(import.meta.url).pathname);
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

const TARGETS = {
  chrome: {
    esbuild: ['chrome120'],
    manifest: (m) => {
      m.background = { service_worker: 'background.js' };
      // Lets the consent script reach about:blank / srcdoc frames that CMPs render into.
      m.content_scripts[1].match_origin_as_fallback = true;
      return m;
    },
  },
  safari: {
    esbuild: ['safari16'],
    // Safari runs `scripts` as a non-persistent event page; more predictable than its service worker.
    manifest: (m) => ({ ...m, background: { scripts: ['background.js'], persistent: false } }),
  },
};

// ---- data (bundled fallback + remote payload) ----
function buildData() {
  const rulesDir = path.join(root, 'data/rules-cz');
  const rules = fs.readdirSync(rulesDir).filter((f) => f.endsWith('.json')).sort()
    .map((f) => {
      const rule = readJson(`data/rules-cz/${f}`);
      if (!rule.name || !Array.isArray(rule.detectCmp) || !Array.isArray(rule.optOut)) {
        throw new Error(`data/rules-cz/${f}: needs name, detectCmp[], optOut[]`);
      }
      return rule;
    });
  return {
    schema: 1,
    generated: new Date().toISOString(),
    shorts: readJson('data/shorts.json'),
    consent: { ...readJson('data/consent.json'), rules },
  };
}

// Every selector is gated on the <html> attribute the content script sets when the module is off,
// so the stylesheet can stay static (no flash on load) and still be switched off.
function shortsCss(selectors) {
  return selectors.map((s) => `html:not([data-declutter-shorts="off"]) ${s}`).join(',\n') +
    ' {\n  display: none !important;\n}\n';
}

// ---- icons: a dark disc with a light slash, drawn without an image library ----
function png(size) {
  const px = Buffer.alloc(size * (size * 4 + 1));
  const c = (size - 1) / 2, r = size / 2 - 0.5, w = size / 9;
  for (let y = 0; y < size; y++) {
    px[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const i = y * (size * 4 + 1) + 1 + x * 4;
      const d = Math.hypot(x - c, y - c);
      const inDisc = d <= r;
      const onSlash = Math.abs((x - c) - (y - c)) / Math.SQRT2 <= w && d <= r * 0.72;
      const [R, G, B] = onSlash ? [245, 245, 240] : [28, 30, 36];
      px[i] = R; px[i + 1] = G; px[i + 2] = B; px[i + 3] = inDisc ? 255 : 0;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(px)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function buildTarget(name, data) {
  const t = TARGETS[name];
  const out = path.join(root, 'build', name);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });

  await esbuild.build({
    entryPoints: {
      background: 'extension/background.js',
      'consent/content': 'extension/consent/content.js',
      'consent/open-shadow': 'extension/consent/open-shadow.js',
      'shorts/shorts': 'extension/shorts/shorts.js',
      'popup/popup': 'extension/popup/popup.js',
    },
    absWorkingDir: root,
    outdir: out,
    bundle: true,
    format: 'iife',
    target: t.esbuild,
    legalComments: 'none',
    // Where the extension fetches newer data from (D6). Empty = bundled data only.
    define: { __DATA_URL__: JSON.stringify(process.env.DECLUTTER_DATA_URL ?? '') },
    logLevel: 'warning',
  });

  const copy = (from, to) => {
    fs.mkdirSync(path.dirname(path.join(out, to)), { recursive: true });
    fs.copyFileSync(path.join(root, from), path.join(out, to));
  };
  copy('extension/popup/popup.html', 'popup/popup.html');
  copy('extension/shorts/dnr-rules.json', 'shorts/dnr-rules.json');
  copy('node_modules/@duckduckgo/autoconsent/rules/compact-rules.json', 'consent/compact-rules.json');
  fs.writeFileSync(path.join(out, 'shorts/shorts.css'), shortsCss(data.shorts.hide));
  fs.writeFileSync(path.join(out, 'data.json'), JSON.stringify(data));
  fs.mkdirSync(path.join(out, 'icons'));
  for (const s of [16, 32, 48, 128]) fs.writeFileSync(path.join(out, `icons/${s}.png`), png(s));

  const manifest = t.manifest({ ...readJson('extension/manifest.base.json'), version: pkg.version });
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`built build/${name}`);
}

const wanted = process.argv.slice(2);
const names = wanted.length ? wanted : Object.keys(TARGETS);
for (const n of names) if (!TARGETS[n]) throw new Error(`unknown target ${n}`);
const data = buildData();
fs.mkdirSync(path.join(root, 'build'), { recursive: true });
fs.writeFileSync(path.join(root, 'build/data.json'), JSON.stringify(data, null, 2));
for (const n of names) await buildTarget(n, data);
