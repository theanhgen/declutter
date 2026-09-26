// Pure logic + build output. Run: npm test (builds first).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { badgeFor, currencyFor, choiceMode, hostMatches, mergeData, redirectTarget, validData } from '../extension/lib.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('redirectTarget: Shorts and channel Shorts tabs', () => {
  assert.equal(redirectTarget('https://www.youtube.com/shorts/abc_D-1?feature=share'), 'https://www.youtube.com/watch?v=abc_D-1');
  assert.equal(redirectTarget('https://www.youtube.com/@MrBeast/shorts'), 'https://www.youtube.com/@MrBeast/videos');
  assert.equal(redirectTarget('https://www.youtube.com/channel/UC123/shorts/'), 'https://www.youtube.com/channel/UC123/videos');
  assert.equal(redirectTarget('https://m.youtube.com/shorts/abc_D-1'), 'https://m.youtube.com/watch?v=abc_D-1');
  assert.equal(redirectTarget('https://www.youtube.com/watch?v=abc'), null);
  assert.equal(redirectTarget('https://www.youtube.com/@shorts'), null);
  assert.equal(redirectTarget('https://www.youtube.com/results?search_query=shorts'), null);
});

test('hostMatches: exact host and subdomains only', () => {
  assert.ok(hostMatches('www.seznam.cz', ['seznam.cz']));
  assert.ok(hostMatches('seznam.cz', ['seznam.cz']));
  assert.ok(!hostMatches('notseznam.cz', ['seznam.cz']));
  assert.ok(!hostMatches('seznam.cz.evil.com', ['seznam.cz']));
});

test('badgeFor: problems are red, everything else is quiet', () => {
  assert.equal(badgeFor({ shortsLeak: 2 }).text, '!');
  assert.equal(badgeFor({ consent: 'failed', cmp: 'x' }).text, '!');
  assert.equal(badgeFor({ consent: 'working', since: 0 }, 20000).text, '!');
  assert.equal(badgeFor({ consent: 'working', since: 10000 }, 20000).text, '');
  assert.equal(badgeFor({ consent: 'done', cmp: 'x' }).text, '');
  assert.equal(badgeFor({ consent: 'wall', host: 'www.seznam.cz' }).text, 'Kč');
  assert.equal(badgeFor({ consent: 'wall', host: 'www.spiegel.de' }).text, '€');
  assert.equal(badgeFor({ consent: 'accepted', cmp: 'x' }).text, '');
});

test('currencyFor: country domain, euro otherwise', () => {
  assert.equal(currencyFor('metro.co.uk'), '£');
  assert.equal(currencyFor('elpais.com'), '€');
  assert.equal(currencyFor('lemonde.fr'), '€');
  assert.equal(currencyFor(undefined), '€');
});

test('validData rejects malformed remote payloads', () => {
  const good = { schema: 1, generated: 'x', shorts: { hide: [], cards: [] }, consent: { walls: [], rules: [], disabledCmps: [] } };
  assert.ok(validData(good));
  assert.ok(!validData({ ...good, schema: 2 }));
  assert.ok(!validData({ ...good, shorts: { hide: 'a' } }));
  assert.ok(!validData(null));
});

test('build: data.json is valid and every CZ rule is well formed', () => {
  const data = JSON.parse(read('build/data.json'));
  assert.ok(validData(data));
  const names = new Set();
  for (const r of data.consent.rules) {
    assert.ok(!names.has(r.name), `duplicate rule name ${r.name}`);
    names.add(r.name);
    for (const k of ['detectCmp', 'detectPopup', 'optIn', 'optOut']) assert.ok(Array.isArray(r[k]), `${r.name}.${k}`);
    for (const k of ['detectCmp', 'detectPopup', 'optIn']) assert.ok(r[k].length, `${r.name}.${k} empty`);
    if (r.runContext?.urlPattern) new RegExp(r.runContext.urlPattern); // throws if invalid
  }
});

test('build: wall list and CZ rules never overlap (wall rules only accept)', () => {
  const data = JSON.parse(read('build/data.json'));
  for (const r of data.consent.rules.filter((x) => /^(cz-)?wall-/.test(x.name))) {
    assert.deepEqual(r.optOut, [], `${r.name} must never refuse`);
    assert.ok(r.optIn.length, `${r.name} needs optIn`);
  }
  for (const r of data.consent.rules.filter((x) => !/^(cz-)?wall-/.test(x.name))) {
    for (const w of data.consent.walls) {
      const re = r.runContext?.urlPattern && new RegExp(r.runContext.urlPattern);
      assert.ok(!re || !re.test(`https://www.${w}/`), `rule ${r.name} targets wall ${w}`);
    }
  }
});

test('build: shorts.css gates every selector on the module switch', () => {
  const css = read('build/chrome/shorts/shorts.css');
  const { hide } = JSON.parse(read('data/shorts.json'));
  for (const s of hide) assert.ok(css.includes(`html:not([data-declutter-shorts="off"]) ${s}`), s);
});

test('build: per-browser manifests', () => {
  const chrome = JSON.parse(read('build/chrome/manifest.json'));
  const safari = JSON.parse(read('build/safari/manifest.json'));
  assert.equal(chrome.background.service_worker, 'background.js');
  assert.deepEqual(safari.background.scripts, ['background.js']);
  assert.equal(safari.content_scripts[1].match_origin_as_fallback, undefined);
  for (const m of [chrome, safari]) {
    for (const cs of m.content_scripts) for (const f of [...(cs.js ?? []), ...(cs.css ?? [])]) {
      assert.ok(fs.existsSync(path.join(root, 'build/chrome', f)), `missing ${f}`);
    }
  }
});

test('DNR redirect regex stays inside the Safari-safe subset', () => {
  for (const r of JSON.parse(read('extension/shorts/dnr-rules.json'))) {
    const re = r.condition.regexFilter;
    assert.ok(!/\||\{\d|\\d|\\w|\(\?[=!<]/.test(re), re);
    assert.ok(re.startsWith('^') && re.endsWith('.*'), 'must match the whole URL');
    const host = re.includes('m\\.youtube') ? 'm.youtube.com' : 'www.youtube.com';
    const m = `https://${host}/shorts/abc_D-1?x=1`.match(new RegExp(re));
    assert.equal(r.action.redirect.regexSubstitution.replace('\\1', m[1]), `https://${host}/watch?v=abc_D-1`);
  }
});

test('BUILTIN_CMPS lists every code-based autoconsent rule (walls switch them all off)', () => {
  const dir = path.join(root, 'node_modules/@duckduckgo/autoconsent/lib/cmps');
  const names = fs.readdirSync(dir).flatMap((f) => [...fs.readFileSync(path.join(dir, f), 'utf8').matchAll(/^\s+name = '([^']+)';/gm)].map((m) => m[1]));
  const src = read('extension/background.js');
  const listed = JSON.parse(src.match(/BUILTIN_CMPS = (\[[^\]]+\])/)[1].replace(/'/g, '"'));
  assert.deepEqual([...listed].sort(), [...names].sort());
});

test('choiceMode: all off refuses, all on accepts, anything else is a mix', () => {
  assert.equal(choiceMode({}), 'refuse');
  assert.equal(choiceMode({ A: false, B: false, D: false, E: false, F: false, X: false }), 'refuse');
  assert.equal(choiceMode({ A: true, B: true, D: true, E: true, F: true, X: true }), 'accept');
  assert.equal(choiceMode({ A: true, B: true }), 'mix');
});

test('mergeData: a rule list overrides rules by name and unions everything else', () => {
  const base = { schema: 1, generated: '2026-01-01', shorts: { hide: ['a'], cards: ['c'] },
    consent: { walls: ['x.cz'], disabledCmps: [], rules: [{ name: 'r1', v: 1 }, { name: 'r2' }] } };
  const extra = { schema: 1, generated: '2026-02-01', shorts: { hide: ['a', 'b'], cards: [] },
    consent: { walls: ['y.cz'], disabledCmps: ['z'], rules: [{ name: 'r1', v: 2 }, { name: 'r3' }] } };
  const m = mergeData(base, extra);
  assert.deepEqual(m.shorts.hide, ['a', 'b']);
  assert.deepEqual(m.consent.walls, ['x.cz', 'y.cz']);
  assert.deepEqual(m.consent.rules.map((r) => `${r.name}${r.v ?? ''}`), ['r2', 'r12', 'r3']);
  assert.equal(m.generated, '2026-02-01');
  assert.equal(mergeData(base, null), base);
});
