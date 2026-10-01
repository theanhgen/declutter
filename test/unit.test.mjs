// Pure logic + build output. Run: npm test (builds first).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { alertText, looksOffline, missedDays, previousFile } from '../canary/alert.mjs';
import { applyCategories } from '../extension/consent/categories.js';
import { badgeFor, currencyFor, reportUrl, choiceMode, hostMatches, keepRemoteLists, mergeData, redirectTarget, validData } from '../extension/lib.js';

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

test('reportUrl sends the site only: no path, query, fragment or credentials', () => {
  assert.equal(reportUrl('https://www.idnes.cz/zpravy/a?utm=x&email=a@b.c#top'), 'https://www.idnes.cz');
  assert.equal(reportUrl('https://user:pw@shop.cz:8443/reset/9f8e7d'), 'https://shop.cz:8443');
  assert.equal(reportUrl('file:///Users/x/a.html'), null);
  assert.equal(reportUrl('chrome-extension://abc/options.html'), null);
  assert.equal(reportUrl(''), null);
});

test('validData rejects malformed remote payloads', () => {
  const good = { schema: 1, generated: 'x', shorts: { hide: [], cards: [] }, consent: { walls: [], rules: [], disabledCmps: [] } };
  assert.ok(validData(good));
  assert.ok(!validData({ ...good, schema: 2 }));
  assert.ok(!validData({ ...good, shorts: { hide: 'a' } }));
  assert.ok(!validData(null));
  const withRules = (rules) => ({ ...good, consent: { ...good.consent, rules } });
  assert.ok(validData(withRules([{ name: 'r', runContext: { urlPattern: '^https://x\\.cz/' } }])));
  assert.ok(!validData(withRules([{ name: 'r', runContext: { urlPattern: '([' } }])), 'regex that does not compile');
  assert.ok(!validData(withRules([{ runContext: {} }])), 'rule without a name');
  assert.ok(!validData(withRules([null])));
});

test('keepRemoteLists: a failed fetch keeps the last good copy, removed URLs drop out', () => {
  const d = (g) => ({ schema: 1, generated: g, shorts: { hide: [], cards: [] }, consent: { walls: [], rules: [], disabledCmps: [] } });
  const prev = { a: d('1'), b: d('1'), gone: d('1') };
  assert.deepEqual(keepRemoteLists(['a', 'b'], prev, { a: d('2') }), { a: d('2'), b: d('1') });
  assert.deepEqual(keepRemoteLists(['a'], undefined, {}), {}, 'offline on first run: nothing, not an error');
  assert.deepEqual(keepRemoteLists(['a'], { a: { schema: 2 } }, {}), {}, 'an invalid stored copy is not kept');
});

test('applyCategories: Czech category names map to the right category', async () => {
  const accepted = [];
  const names = ['necessary', 'Funkční', 'Analytické', 'Reklamní', 'Cílení', 'Marketingové', 'Sociální sítě', 'download_stats', 'ad_storage'];
  globalThis.window = { CookieConsent: {
    acceptCategory: (cats) => accepted.push(...cats), getConfig: () => Object.fromEntries(names.map((n) => [n, {}])), hide() {}, hidePreferences() {},
  } };
  try {
    // "other" on, ads off: Czech ad categories must stay off (they used to fall through to "other"), and
    // download_stats is "other", not an ad (the old /ad/ matched "load").
    assert.equal(await applyCategories({ A: true, B: false, D: false, E: false, F: false, X: true }, 'cookieconsent3'), 'cookieconsent-v3');
    assert.deepEqual(accepted, ['necessary', 'Funkční', 'Sociální sítě', 'download_stats']);
  } finally { delete globalThis.window; }
});

test('options and background default to the same rule lists (a saved default would pin it for good)', () => {
  for (const f of ['extension/background.js', 'extension/options/options.js']) {
    assert.match(read(f), /dataUrls: __DATA_URL__ \? \[__DATA_URL__\] : \[\]/, f);
  }
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
  const { hide, posts } = JSON.parse(read('data/shorts.json'));
  for (const s of hide) assert.ok(css.includes(`html:not([data-declutter-shorts="off"]) ${s} {`), s);
  for (const s of posts) assert.ok(css.includes(`html:not([data-declutter-posts="off"]) ${s} {`), s);
  // One rule per selector: in a list, one selector a browser can't parse would drop all of them.
  assert.equal(css.match(/\{ display: none !important; \}/g).length, hide.length + posts.length);
  // Posts are hidden in feeds only: every selector is tied to a feed container, so a channel's Posts tab stays.
  for (const s of posts) assert.match(s, /^yt[dm]-rich-(item|section|grid)-renderer/, s);
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
  assert.deepEqual(m.shorts.posts, []); // lists built before posts existed
  assert.deepEqual(mergeData({ ...base, shorts: { ...base.shorts, posts: ['p'] } }, extra).shorts.posts, ['p']);
  assert.deepEqual(m.consent.walls, ['x.cz', 'y.cz']);
  assert.deepEqual(m.consent.rules.map((r) => `${r.name}${r.v ?? ''}`), ['r2', 'r12', 'r3']);
  assert.equal(m.generated, '2026-02-01');
  assert.equal(mergeData(base, null), base);
});

test('mergeData: a rule list older than the bundled data cannot override a bundled rule, but adds new ones', () => {
  const base = { schema: 1, generated: '2026-03-01', shorts: { hide: [], cards: [] },
    consent: { walls: [], disabledCmps: [], rules: [{ name: 'r1', v: 'fixed' }] } };
  const old = { schema: 1, generated: '2026-02-01', shorts: { hide: [], cards: [] },
    consent: { walls: [], disabledCmps: [], rules: [{ name: 'r1', v: 'broken' }, { name: 'r9' }] } };
  const m = mergeData(base, old);
  assert.deepEqual(m.consent.rules.map((r) => `${r.name}${r.v ?? ''}`), ['r1fixed', 'r9']);
  assert.equal(m.generated, '2026-03-01');
});

test('applyCategories: only the adapter of the CMP autoconsent detected runs', async () => {
  const calls = [];
  globalThis.window = {
    Didomi: { setUserStatus: () => calls.push('didomi'), getPurposes: () => [] },
    Cookiebot: { submitCustomConsent: (...a) => calls.push(['cookiebot', ...a]) },
  };
  try {
    // A stray Didomi global on a page whose banner is Cookiebot: answer Cookiebot, leave Didomi alone.
    assert.equal(await applyCategories({ A: true, E: true }, 'Cybotcookiebot'), 'cookiebot');
    assert.deepEqual(calls, [['cookiebot', true, false, false]], 'content (E) alone is not marketing');
    // A CMP with no adapter: nothing is touched, the background refuses instead.
    assert.equal(await applyCategories({ A: true }, 'Sourcepoint-frame'), '');
    assert.equal(calls.length, 1);
  } finally { delete globalThis.window; }
});

test('canary: baseline is the newest earlier day, never today (a rerun)', () => {
  const files = ['2026-09-25.json', '2026-09-27.json', '2026-09-30.json', 'notes.txt'];
  assert.equal(previousFile(files, '2026-09-30'), '2026-09-27.json');
  assert.equal(previousFile(['2026-09-30.json'], '2026-09-30'), null);
  assert.equal(missedDays('2026-09-27.json', '2026-09-30'), 2);
  assert.equal(missedDays('2026-09-29.json', '2026-09-30'), 0);
  assert.equal(missedDays(null, '2026-09-30'), 0);
});

test('canary: alert on change or missed days, stay quiet otherwise', () => {
  assert.equal(alertText({ summary: 's', failing: ['a'], before: ['a'] }), null);
  assert.match(alertText({ summary: 's', failing: ['a'], before: ['a'], missed: 2 }), /No canary result for 2 days/);
  const t = alertText({ summary: 's', failing: ['b'], before: ['a'] });
  assert.match(t, /Broke:\n- b/);
  assert.match(t, /Fixed:\n- a/);
  assert.match(alertText({ summary: 's', failing: ['a'], before: null }), /Broke/);
  const long = alertText({ summary: 's', failing: Array.from({ length: 200 }, (_, i) => `consent site-${i}.example.cz: done`), before: [] });
  assert.ok(long.length < 4096, 'fits a Telegram message');
  assert.match(long, /more lines/);
});

test('canary: most sites not loading is an outage, not 90 broken rules', () => {
  const r = (err) => ({ err });
  assert.ok(looksOffline([r('x'), r('x'), r('x'), r(null)]));
  assert.ok(!looksOffline([r('x'), r(null), r(null), r(null)]));
  assert.ok(!looksOffline([r('x')]), 'a one-site rerun is not an outage');
});
