// Builds build/<target>/ (an unpacked extension) for chrome and safari, plus build/data.json,
// the payload the extension also fetches remotely (D6).
//   node build.mjs            -> all targets
//   node build.mjs chrome     -> one target
//   DECLUTTER_DATA_URL=https://… node build.mjs   -> bake in the remote data URL
//   DECLUTTER_TIP_URL=https://… node build.mjs    -> tip link in settings (not in Safari)
//   node build.mjs --store    -> store build: walls default to manual (strangers opt in to accepting
//                                 tracking), plus upload zips in dist/ for chrome (+ Edge) and firefox
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const root = path.dirname(new URL(import.meta.url).pathname);
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

const STORE = process.argv.includes('--store');

const TARGETS = {
  chrome: {
    esbuild: ['chrome120'],
    manifest: (m) => {
      m.background = { service_worker: 'background.js' };
      // content_scripts "world": "MAIN" needs 111; also stops older Chromium forks (Opera, Whale) installing it.
      m.minimum_chrome_version = '111';
      // Lets the consent script reach about:blank / srcdoc frames that CMPs render into.
      m.content_scripts[1].match_origin_as_fallback = true;
      return m;
    },
  },
  firefox: {
    esbuild: ['firefox128'],
    // Firefox MV3: event-page background; content_scripts "world": "MAIN" needs 128, data_collection_permissions 140 (142 on Android).
    manifest: (m) => ({
      ...m,
      background: { scripts: ['background.js'] },
      browser_specific_settings: {
        gecko: { id: 'declutter@theanhgen', strict_min_version: '142.0', data_collection_permissions: { required: ['none'] } },
        gecko_android: { strict_min_version: '142.0' }, // listed for Firefox for Android too
      },
    }),
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

// ---- icons: a bold rose lowercase "d", drawn on a 16-unit grid without an image library ----
// Flattens M/L/C commands into a polygon.
function flatten(cmds) {
  const pts = [];
  let cur;
  for (const [op, ...v] of cmds) {
    if (op !== 'C') { cur = v; pts.push(v); continue; }
    const [x0, y0] = cur;
    for (let i = 1; i <= 48; i++) {
      const t = i / 48, u = 1 - t;
      pts.push([
        u ** 3 * x0 + 3 * u ** 2 * t * v[0] + 3 * u * t ** 2 * v[2] + t ** 3 * v[4],
        u ** 3 * y0 + 3 * u ** 2 * t * v[1] + 3 * u * t ** 2 * v[3] + t ** 3 * v[5],
      ]);
    }
    cur = v.slice(4);
  }
  return pts;
}

const GLYPH = flatten([
  ['M', 11.3, 1.5], ['L', 14, 1.5], ['L', 14, 14], ['L', 7.65, 14],
  ['C', 3.7, 14, 1.5, 11.95, 1.5, 8.95],
  ['C', 1.5, 5.95, 3.6, 4.0, 6.7, 4.0],
  ['C', 8.1, 4.0, 9.25, 4.45, 10.1, 5.2],
  ['L', 10.1, 2.7],
  ['C', 10.1, 1.9, 10.5, 1.5, 11.3, 1.5],
]);
// The counter is pixel-fit at 16px so the bowl stays open in the toolbar.
const COUNTER = {
  small: flatten([
    ['M', 7.5, 7], ['C', 9.1, 7, 10, 7.8, 10, 9], ['L', 10, 11], ['L', 7.5, 11],
    ['C', 5.9, 11, 5, 10.2, 5, 9], ['C', 5, 7.8, 5.9, 7, 7.5, 7],
  ]),
  large: flatten([
    ['M', 7.8, 7.0], ['C', 9.3, 7.0, 10.15, 7.8, 10.15, 9.1], ['L', 10.15, 11.05], ['L', 7.8, 11.05],
    ['C', 6.2, 11.05, 5.4, 10.25, 5.4, 9.05], ['C', 5.4, 7.85, 6.25, 7.0, 7.8, 7.0],
  ]),
};

function inside(poly, x, y) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < xi + (y - yi) / (yj - yi) * (xj - xi)) hit = !hit;
  }
  return hit;
}

// background: opaque [r, g, b] behind the glyph (app icons); scale: share of the canvas the 16-unit glyph grid fills.
function png(size, { background = null, scale = 1, ss = 8 } = {}) {
  const px = Buffer.alloc(size * (size * 4 + 1));
  const counter = size === 16 && scale === 1 ? COUNTER.small : COUNTER.large;
  const unit = 16 / (size * scale), offset = size * (1 - scale) / 2;
  for (let y = 0; y < size; y++) {
    px[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let covered = 0, stem = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const gx = (x - offset + (sx + 0.5) / ss) * unit - 0.25, gy = (y - offset + (sy + 0.5) / ss) * unit - 0.25;
          if (inside(GLYPH, gx, gy) && !inside(counter, gx, gy)) { covered++; if (gx >= 10.1) stem++; }
        }
      }
      const i = y * (size * 4 + 1) + 1 + x * 4;
      // Two shades on purpose: Safari renders a single-colour toolbar icon as a template (grey, blue when
      // active). The stem is a darker rose so it keeps its colour.
      const a = covered / (ss * ss), light = [201, 101, 117], dark = [168, 74, 92]; // #c96575, #a84a5c
      const rose = covered ? light.map((v, k) => Math.round(v + (dark[k] - v) * stem / covered)) : light;
      if (background) {
        for (let k = 0; k < 3; k++) px[i + k] = Math.round(background[k] + (rose[k] - background[k]) * a);
        px[i + 3] = 255;
      } else {
        px.set(rose, i);
        px[i + 3] = Math.round(255 * a);
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
    define: {
      __DATA_URL__: JSON.stringify(process.env.DECLUTTER_DATA_URL ?? ''),
      __WALLS_DEFAULT__: JSON.stringify(STORE ? 'manual' : 'auto'),
      // Tip link in settings. Never in Safari: App Store tips must be in-app purchases (the container app has them).
      __TIP_URL__: JSON.stringify(name === 'safari' ? '' : process.env.DECLUTTER_TIP_URL ?? ''),
    },
    logLevel: 'warning',
  });

  const copy = (from, to) => {
    fs.mkdirSync(path.dirname(path.join(out, to)), { recursive: true });
    fs.copyFileSync(path.join(root, from), path.join(out, to));
  };
  copy('extension/popup/popup.html', 'popup/popup.html');
  copy('extension/popup/d.svg', 'popup/d.svg');
  copy('extension/options/options.html', 'options/options.html');
  copy('extension/shorts/dnr-rules.json', 'shorts/dnr-rules.json');
  copy('node_modules/@duckduckgo/autoconsent/rules/compact-rules.json', 'consent/compact-rules.json');
  copy('LICENSE', 'LICENSE');
  copy('node_modules/@duckduckgo/autoconsent/LICENSE', 'licenses/autoconsent-MPL-2.0.txt');
  fs.writeFileSync(path.join(out, 'shorts/shorts.css'), shortsCss(data.shorts.hide));
  fs.writeFileSync(path.join(out, 'data.json'), JSON.stringify(data));
  fs.mkdirSync(path.join(out, 'icons'));
  // Toolbar sizes get a margin like other toolbar icons; the glyph alone at full size looks oversized.
  for (const s of [16, 32, 48, 128]) fs.writeFileSync(path.join(out, `icons/${s}.png`), png(s, { scale: s <= 32 ? 0.5625 : 0.75 }));

  const manifest = t.manifest({ ...readJson('extension/manifest.base.json'), version: pkg.version });
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`built build/${name}`);
}

// node build.mjs --app-icon: regenerate the iPhone home-screen icon (1024, opaque) from the same glyph.
// The Mac icon set is downscaled from the same 1024 with sips (full-bleed square; macOS applies its own mask).
if (process.argv.includes('--app-icon')) {
  const out = path.join(root, 'safari/iOSApp/Assets.xcassets/AppIcon.appiconset/icon.png');
  fs.writeFileSync(out, png(1024, { background: [247, 247, 247], scale: 0.62, ss: 2 }));
  console.log(`wrote ${path.relative(root, out)}`);
  const { execFileSync } = await import('node:child_process');
  const mac = path.join(root, 'safari/App/Assets.xcassets/AppIcon.appiconset');
  fs.mkdirSync(mac, { recursive: true });
  const images = [];
  for (const pt of [16, 32, 128, 256, 512]) {
    for (const scale of [1, 2]) {
      const file = `icon_${pt}x${pt}@${scale}x.png`, px = pt * scale;
      if (px === 1024) fs.copyFileSync(out, path.join(mac, file));
      else execFileSync('sips', ['-z', String(px), String(px), out, '--out', path.join(mac, file)], { stdio: 'ignore' });
      images.push({ filename: file, idiom: 'mac', scale: `${scale}x`, size: `${pt}x${pt}` });
    }
  }
  fs.writeFileSync(path.join(mac, 'Contents.json'), JSON.stringify({ images, info: { author: 'xcode', version: 1 } }, null, 2));
  fs.writeFileSync(path.join(root, 'safari/App/Assets.xcassets/Contents.json'), JSON.stringify({ info: { author: 'xcode', version: 1 } }, null, 2));
  console.log(`wrote ${path.relative(root, mac)} (${images.length} sizes)`);
  process.exit(0);
}

const wanted = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const names = wanted.length ? wanted : Object.keys(TARGETS);
for (const n of names) if (!TARGETS[n]) throw new Error(`unknown target ${n}`);
const data = buildData();
fs.mkdirSync(path.join(root, 'build'), { recursive: true });
fs.writeFileSync(path.join(root, 'build/data.json'), JSON.stringify(data, null, 2));
for (const n of names) await buildTarget(n, data);

// Store zips (manifest at the zip root). Chrome's zip also goes to Edge Add-ons unchanged; Safari ships
// through App Store Connect from Xcode, not a zip.
if (STORE) {
  const { execFileSync } = await import('node:child_process');
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
  for (const n of names.filter((n) => n !== 'safari')) {
    const zip = path.join(root, 'dist', `declutter-${n}-${pkg.version}.zip`);
    fs.rmSync(zip, { force: true });
    execFileSync('zip', ['-qrX', zip, '.', '-x', '.*'], { cwd: path.join(root, 'build', n) });
    console.log(`packed ${path.relative(root, zip)}`);
  }
  // AMO asks for source when the upload is bundled: the tracked tree, rebuilt with `npm ci && npm run store`.
  const src = path.join(root, 'dist', `declutter-source-${pkg.version}.zip`);
  fs.rmSync(src, { force: true });
  execFileSync('git', ['archive', '--format=zip', '-o', src, 'HEAD'], { cwd: root });
  console.log(`packed ${path.relative(root, src)}`);
}
