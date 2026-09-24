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
      if (!rule.name || !Array.isArray(rule.detectCmp) || !Array.isArray(rule.optIn) || !Array.isArray(rule.optOut)) {
        throw new Error(`data/rules-cz/${f}: needs name, detectCmp[], optIn[], optOut[]`);
      }
      // Wall rules (cz-wall-*, wall-*) only ever accept; every other rule must be able to refuse.
      if (!/^(cz-)?wall-/.test(rule.name) && !rule.optOut.length) throw new Error(`data/rules-cz/${f}: empty optOut`);
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

// ---- icons: a clean teal frame with its overlay peeled away ----
function png(size) {
  const px = Buffer.alloc(size * (size * 4 + 1));
  // At 16px, keep the fold solid and at least two gap pixels clear; AA only outer corners.
  const toolbarPixels = [
    '................',
    '..aTTT..FPPPPp..',
    '.aTTTT...FPPPPP.',
    '.TTSSSS...FPPPP.',
    '.TTSSSSS...FPPP.',
    '.TTSSSSSSS..FPP.',
    '.TTSSSSSSSS..FP.',
    '.TTSSSSSSSSS..F.',
    '.TTSSSSSSSSSS...',
    '.TTSSSSSSSSSSTT.',
    '.TTSSSSSSSSSSTT.',
    '.TTSSSSSSSSSSTT.',
    '.TTTSSSSSSSSTTT.',
    '.aTTTTTTTTTTTTa.',
    '..aTTTTTTTTTTa..',
    '................',
  ];
  const toolbarColors = {
    T: [8, 136, 135, 255],
    S: [238, 255, 249, 255],
    P: [65, 215, 180, 255],
    F: [5, 89, 88, 255],
    a: [8, 136, 135, 128],
    p: [65, 215, 180, 128],
  };
  const samples = 8;
  const small = size <= 16;
  const inset = small ? 3 : 3.25;
  const roundedBox = (x, y, left, top, right, bottom, radius) => {
    const dx = Math.max(left + radius - x, 0, x - right + radius);
    const dy = Math.max(top + radius - y, 0, y - bottom + radius);
    return dx * dx + dy * dy <= radius * radius;
  };
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const colorAt = (x, y) => {
    if (!roundedBox(x, y, 1, 1, 15, 15, small ? 3 : 3.5)) return null;
    const diagonal = x - y;
    const peelEdge = 6.5 + 0.32 * (y - 1) + 0.08 * (y - 1) ** 2;
    if (x > peelEdge && diagonal < 8) return null;
    if (diagonal >= 8) {
      if (!small && diagonal < 8.7 + 0.09 * (y - 1) ** 2) return [9, 116, 110];
      return mix([59, 211, 177], [21, 161, 150], y / 8);
    }
    if (roundedBox(x, y, inset, inset, 16 - inset, 16 - inset, small ? 1 : 1.5)) {
      return [235, 255, 247];
    }
    return mix([14, 157, 145], [7, 125, 131], y / 16);
  };
  for (let y = 0; y < size; y++) {
    px[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const i = y * (size * 4 + 1) + 1 + x * 4;
      if (size === 16) {
        const color = toolbarColors[toolbarPixels[y][x]];
        if (color) px.set(color, i);
        continue;
      }
      let red = 0, green = 0, blue = 0, covered = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const color = colorAt(
            (x + (sx + 0.5) / samples) * 16 / size,
            (y + (sy + 0.5) / samples) * 16 / size,
          );
          if (!color) continue;
          red += color[0]; green += color[1]; blue += color[2]; covered++;
        }
      }
      // Average covered samples only, so transparent edges have no dark fringe.
      if (covered) {
        px[i] = Math.round(red / covered);
        px[i + 1] = Math.round(green / covered);
        px[i + 2] = Math.round(blue / covered);
        px[i + 3] = Math.round(255 * covered / (samples * samples));
      }
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
      'options/options': 'extension/options/options.js',
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
  copy('extension/options/options.html', 'options/options.html');
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
