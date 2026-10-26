// Pure logic + build output. Run: npm test (builds first).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { alertText, looksOffline, missedDays, previousFile } from '../canary/alert.mjs';
import { applyCategories } from '../extension/consent/categories.js';
import { collectDates, videoIdOf } from '../extension/shorts/dates-lib.js';
import { badgeFor, chipFor, currencyFor, gpcExcludeMatches, gpcRule, reportUrl, choiceMode, hostMatches, keepRemoteLists, mergeData, redirectTarget, validData, siteEntry, siteHost, siteMode, siteModePatch, outcomeDetail, FRESH_OUTCOME, fetchRuleList, ruleListLine, ruleListStatus, updateOutcome, REASONS, REASON_WORD, reasonsFor, reasonWord, markFixed, siteRules, restoreItem, restoreReports, restoreStats, bannerSuspected, countNewlyHidden, shortsStatsText, shortsSummary } from '../extension/lib.js';
import { declutterSnippets } from '../extension/consent/snippets.js';

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

test('per-site choice: one model for popup, Settings and background; most specific entry wins', () => {
  // #51: a parent on accept shows as accept on its subdomains, and refuse on a subdomain stops the accept there only.
  let s = { acceptSites: ['example.com'], exceptions: [] };
  assert.equal(siteMode('shop.example.com', s), 'accept');
  s = { ...s, ...siteModePatch('shop.example.com', 'refuse', s) };
  assert.deepEqual(s.acceptSites, ['example.com']);
  assert.deepEqual(s.refuseSites, ['shop.example.com']);
  assert.equal(siteMode('shop.example.com', s), 'refuse');
  assert.equal(siteMode('www.example.com', s), 'accept');
  assert.equal(siteMode('a.shop.example.com', s), 'refuse');
  // #23 finding 1: changing a subdomain never deletes the parent; siblings keep the parent's choice.
  s = { exceptions: ['idnes.cz'], acceptSites: [] };
  s = { ...s, ...siteModePatch('www.idnes.cz', 'accept', s) };
  assert.deepEqual(s.exceptions, ['idnes.cz']);
  assert.equal(siteMode('www.idnes.cz', s), 'accept');
  assert.equal(siteMode('sport.idnes.cz', s), 'ignore');
  // Back to what it inherits: the override goes, nothing new is added.
  s = { ...s, ...siteModePatch('www.idnes.cz', 'ignore', s) };
  assert.deepEqual(s, { exceptions: ['idnes.cz'], acceptSites: [], refuseSites: [] });
  // No parent: refuse just takes the host off; older settings without refuseSites work as before.
  assert.equal(siteMode('o2.cz', { acceptSites: ['www.o2.cz'] }), 'refuse');
  assert.deepEqual(siteModePatch('www.o2.cz', 'refuse', { acceptSites: ['www.o2.cz'] }), { acceptSites: [], exceptions: [], refuseSites: [] });
  assert.deepEqual(siteEntry('www.o2.cz', { acceptSites: ['o2.cz'], exceptions: ['www.o2.cz'] }), { domain: 'www.o2.cz', mode: 'ignore' });
  // #23 finding 2: a patch built from what is stored at write time keeps a choice made elsewhere meanwhile.
  const stored = { exceptions: ['seznam.cz'], acceptSites: [] }; // set in the popup after Settings rendered
  assert.deepEqual(siteModePatch('o2.cz', 'accept', stored).exceptions, ['seznam.cz']);
  // "Add a site" takes a host or an address.
  assert.equal(siteHost(' https://www.iDnes.cz/zpravy?x=1 '), 'idnes.cz');
  assert.equal(siteHost('sport.idnes.cz'), 'sport.idnes.cz');
  for (const bad of ['', 'idnes', 'not a site', 'http://']) assert.equal(siteHost(bad), null, bad);
});

test('per-site choice: popup, Settings and background all go through siteMode, and say "leave alone"', () => {
  const bg = read('extension/background.js');
  assert.doesNotMatch(bg, /hostMatches\(tabHost, settings\.(exceptions|acceptSites)|hostMatches\([^)]*acceptSites/);
  assert.match(bg, /siteMode\(tabHost, settings\) === 'ignore'/);
  for (const p of ['extension/popup/popup.js', 'extension/options/options.js']) {
    assert.match(read(p), /siteModePatch\(host, [^,]+, (current|cur)\)/, p);
    assert.doesNotMatch(read(p), /exceptions\.includes\(host\)|acceptSites\.includes\(host\)/, p);
  }
  assert.match(read('extension/popup/popup.html'), /data-mode="ignore">leave alone</);
  for (const p of ['extension/options/options.html', 'extension/welcome/welcome.html', 'site/index.html']) {
    assert.match(read(p), /leave alone/, p);
    assert.doesNotMatch(read(p), /refuse \/ accept \/ leave[^ ]|choice-word">leave<|Set exceptions/, p);
  }
});

test('report reasons: fixed words that fit the page, same set as the database check', () => {
  assert.deepEqual(reasonsFor({ consent: 'failed' }), ['banner', 'other']);
  assert.deepEqual(reasonsFor({ consent: 'done' }), ['broken', 'banner', 'other']);
  assert.deepEqual(reasonsFor({ shortsLeak: 2 }), ['shorts', 'banner', 'other']);
  assert.equal(reasonWord('shorts', '/results'), 'shorts:search');
  assert.equal(reasonWord('shorts', '/@somechannel/videos'), 'shorts:channel');
  assert.equal(reasonWord('shorts', '/feed/subscriptions'), 'shorts:home');
  assert.equal(reasonWord('shorts', '/playlist?list=x'), 'shorts:other');
  assert.equal(reasonWord('broken'), 'broken');
  for (const k of Object.keys(REASONS)) assert.ok(REASON_WORD.test(reasonWord(k, '/')), k);
  assert.ok(!REASON_WORD.test('free text') && !REASON_WORD.test('shorts:/watch?v=x'));
  // The migration's check constraint is the same pattern.
  const sql = read('supabase/migrations/20261124000000_reports_reason.sql');
  assert.ok(sql.includes(`reason ~ '${REASON_WORD.source}'`), 'migration check = REASON_WORD');
  for (const p of ['site/privacy.html', 'site/bye.html']) for (const w of ['banner still there', 'shorts got through']) assert.match(read(p), new RegExp(w), p);
});

test('shorts hidden: each element counted once, however often YouTube re-renders', () => {
  const shelf = {}, a = {}, b = {}, c = {};
  let dom = { 'ytd-reel-shelf-renderer': [shelf], 'yt-lockup-view-model:has(a[href^="/shorts/"])': [a, b] };
  const root = { querySelectorAll: (s) => { if (s === 'bad(') throw new SyntaxError(s); return dom[s] ?? []; } };
  const selectors = ['ytd-reel-shelf-renderer', 'yt-lockup-view-model:has(a[href^="/shorts/"])', 'bad('];
  const seen = new Set();
  assert.equal(countNewlyHidden(root, selectors, seen), 3);
  assert.equal(countNewlyHidden(root, selectors, seen), 0, 're-render of the same elements');
  dom = { ...dom, 'yt-lockup-view-model:has(a[href^="/shorts/"])': [a, b, c] };
  assert.equal(countNewlyHidden(root, selectors, seen), 1, 'only the new one (more results scrolled in)');
  // two selectors matching one element: still one
  assert.equal(countNewlyHidden({ querySelectorAll: () => [c] }, ['x', 'y'], new Set()), 1);
});

test('shorts popup row and Settings line say what was hidden and redirected', () => {
  assert.equal(shortsSummary({ shortsHidden: 12, shortsRedirects: 2 }), '12 shorts hidden on this page · 2 opened in the normal player');
  assert.equal(shortsSummary({ shortsHidden: 1 }), '1 short hidden on this page');
  assert.equal(shortsSummary({ shortsRedirects: 1 }), 'no shorts on this page · 1 opened in the normal player');
  assert.equal(shortsSummary({}), 'no shorts on this page');
  assert.equal(shortsStatsText({ shortsHidden: 1204, shortsPages: 57 }), '1,204 shorts hidden on 57 youtube pages');
  assert.equal(shortsStatsText({ shortsHidden: 1, shortsPages: 1 }), '1 short hidden on 1 youtube page');
  assert.equal(shortsStatsText({}), 'no shorts hidden yet.');
});

test('hostMatches: exact host and subdomains only', () => {
  assert.ok(hostMatches('www.seznam.cz', ['seznam.cz']));
  assert.ok(hostMatches('seznam.cz', ['seznam.cz']));
  assert.ok(!hostMatches('notseznam.cz', ['seznam.cz']));
  assert.ok(!hostMatches('seznam.cz.evil.com', ['seznam.cz']));
});

test('badgeFor: problems are red, everything else is quiet', () => {
  // Shorts the backup check caught are already hidden: a tooltip line, not a red badge.
  assert.equal(badgeFor({ shortsLeak: 2 }).text, '');
  assert.match(badgeFor({ shortsLeak: 2 }).title, /2 shorts caught/);
  assert.equal(badgeFor({ shortsLeak: 2, consent: 'failed' }).text, '!');
  assert.equal(badgeFor({ consent: 'failed', cmp: 'x' }).text, '!');
  assert.equal(badgeFor({ consent: 'working', since: 0 }, 20000).text, '!');
  assert.equal(badgeFor({ consent: 'working', since: 10000 }, 20000).text, '');
  assert.equal(badgeFor({ consent: 'done', cmp: 'x' }).text, '');
  assert.equal(badgeFor({ consent: 'wall', host: 'www.seznam.cz' }).text, 'Kč');
  assert.equal(badgeFor({ consent: 'wall', host: 'www.spiegel.de' }).text, '€');
  assert.equal(badgeFor({ consent: 'accepted', cmp: 'x' }).text, '');
});

test('badgeFor: a site set to accept says so, not the plain idle state', () => {
  const b = badgeFor({ consent: 'acceptedSite', cmp: 'x' });
  assert.equal(b.text, '');
  assert.equal(b.color, '#1e8e3e');
  assert.match(b.title, /cookies accepted on this site \(x\)/);
  assert.notDeepEqual(b, badgeFor({}));
});

test('chipFor: once per outcome, not on a reload of the same site', () => {
  assert.deepEqual(chipFor({ consent: 'working' }, { consent: 'done', host: 'a.cz' }), { text: 'cookies refused', tone: 'ok' });
  assert.equal(chipFor({}, { consent: 'acceptedSite' }).text, 'cookies accepted');
  assert.equal(chipFor({}, { consent: 'choice' }).text, 'your choice applied');
  assert.equal(chipFor({}, { consent: 'wall' }).tone, 'wait');
  // a cosmetic rule answers nothing: say hidden, never refused or accepted
  assert.equal(chipFor({}, { consent: 'done', cosmetic: true }).text, 'banner hidden');
  assert.equal(chipFor({}, { consent: 'acceptedSite', cosmetic: true }).text, 'banner hidden');
  assert.equal(chipFor({}, { consent: 'failed', cosmetic: true }).text, 'banner not answered: see the declutter button');
  assert.equal(chipFor({}, { consent: 'failed' }).tone, 'bad');
  for (const consent of ['working', 'paused', 'accepting', undefined]) assert.equal(chipFor({}, { consent }), null);
  assert.equal(chipFor({ consent: 'done' }, { consent: 'done', host: 'a.cz' }), null);
  const last = { host: 'a.cz', consent: 'done', at: 1000 };
  assert.equal(chipFor({ consent: 'working' }, { consent: 'done', host: 'a.cz' }, last, 30000), null);
  assert.ok(chipFor({ consent: 'working' }, { consent: 'done', host: 'a.cz' }, last, 70000));
  assert.ok(chipFor({ consent: 'working' }, { consent: 'done', host: 'b.cz' }, last, 30000));
  assert.ok(chipFor({ consent: 'working' }, { consent: 'failed', host: 'a.cz' }, last, 30000));
  // the site reloaded itself while the chip was up: show it again on the new page, but not after it is gone
  assert.ok(chipFor({ consent: 'done' }, { consent: 'done', host: 'a.cz' }, last, 2000, true));
  assert.equal(chipFor({ consent: 'done' }, { consent: 'done', host: 'a.cz' }, last, 2000, false), null);
  assert.equal(chipFor({ consent: 'done' }, { consent: 'done', host: 'a.cz' }, last, 9000, true), null);
});

test('when and how the choice was made: popup line and fallback chip', () => {
  const time = (t) => `t${t}`;
  assert.equal(outcomeDetail({ consent: 'done', cmp: 'Cookiebot', doneAt: 5, clicks: 3 }, time), 'Cookiebot · t5 · 3 clicks');
  assert.equal(outcomeDetail({ consent: 'acceptedSite', cmp: 'Onetrust', doneAt: 5, clicks: 1 }, time), 'Onetrust · t5 · 1 click');
  assert.equal(outcomeDetail({ consent: 'accepted', cmp: 'cz-wall-seznam', doneAt: 5, clicks: 0 }, time), 'cz-wall-seznam · t5');
  assert.equal(outcomeDetail({ consent: 'choice', cmp: 'Cookiebot', adapter: 'Cookiebot API', doneAt: 5 }, time), 'Cookiebot via Cookiebot API · t5');
  // kept over a reload the site did itself
  assert.equal(outcomeDetail({ consent: 'done', cmp: 'Cookiebot', doneAt: 5, clicks: 3, kept: true }, time), 'Cookiebot · t5 · 3 clicks (before the page reloaded)');
  // a state from before doneAt/clicks were stored: just the banner
  assert.equal(outcomeDetail({ consent: 'done', cmp: 'Cookiebot' }), 'Cookiebot');
  assert.match(outcomeDetail({ consent: 'done', cmp: 'x', doneAt: Date.UTC(2026, 0, 1, 14, 2) }), /^x · \S/);
  // a mix the banner can't take was refused outright: the chip says so
  assert.equal(chipFor({ consent: 'working' }, { consent: 'done', choiceFallback: true }).text, "refused all: your mix isn't supported here");
  assert.equal(chipFor({ consent: 'working' }, { consent: 'done', choiceFallback: true, cosmetic: true }).text, 'banner hidden');
  assert.equal(chipFor({ consent: 'working' }, { consent: 'choice', choiceFallback: false }).text, 'your choice applied');
  // consecutive answers on one tab (setTab merges): a kept refusal, then a new banner answered through an adapter,
  // shows none of the first answer's clicks or kept mark
  const first = { consent: 'done', cmp: 'Onetrust', doneAt: 5, clicks: 3, cosmetic: true, kept: true, choiceFallback: true };
  const second = { ...first, ...FRESH_OUTCOME, consent: 'working', cmp: 'Cookiebot', ...{ consent: 'choice', cmp: 'Cookiebot', adapter: 'Cookiebot API', doneAt: 9 } };
  assert.equal(outcomeDetail(second, time), 'Cookiebot via Cookiebot API · t9');
  const wall = { ...first, ...FRESH_OUTCOME, consent: 'accepting', cmp: 'cz-wall-seznam' };
  assert.equal(outcomeDetail(wall, time), 'cz-wall-seznam');
  const bg = read('extension/background.js');
  assert.equal(bg.match(/\.\.\.FRESH_OUTCOME, consent: '(working|accepting|wall)'/g)?.length, 3, 'every popupFound resets the outcome');
  assert.match(bg, /\['done', 'acceptedSite', 'choice', 'accepted'\]\.includes\(prev\.consent\)/, 'a pay-wall accept is kept over a reload');
  assert.match(read('extension/popup/popup.js'), /state\.choiceFallback && !state\.cosmetic/, 'a hidden banner is not called refused');
});

test('pay walls: one name and one definition everywhere, no Czech-only button', () => {
  assert.equal(chipFor({}, { consent: 'wall' }).text, 'pay wall: accept from the declutter button');
  assert.equal(badgeFor({ consent: 'wall', host: 'www.spiegel.de' }).title, 'declutter: pay wall — agree or pay, from this menu');
  assert.match(read('extension/popup/popup.js'), /'pay wall: agree to tracking or pay'/);
  assert.match(read('extension/popup/popup.html'), />agree to tracking on this site</);
  // user-facing copy; research and review notes keep their own words
  const copy = ['extension/popup/popup.html', 'extension/popup/popup.js', 'extension/options/options.html',
    'extension/welcome/welcome.html', 'extension/welcome/welcome.js', 'site/index.html', 'store/LISTING.md', 'store/asc-setup.mjs'];
  for (const f of copy) assert.doesNotMatch(read(f), /consent-or-pay|souhlasím|\bsubscribe\b|agree or pay" walls/i, f);
  for (const f of ['extension/welcome/welcome.html', 'site/index.html', 'store/LISTING.md', 'store/asc-setup.mjs']) {
    assert.match(read(f).replace(/[“”]/g, '"'), /pay walls \("agree to tracking or pay"\) are never hidden or refused/i, f);
  }
});

test('bannerSuspected: banner wording in the top frame, only when no rule did anything', () => {
  const report = (url, heuristicPatterns = ['/accept all/gi']) => ({ type: 'report', url, mainFrame: true, state: { heuristicPatterns } });
  assert.equal(bannerSuspected({ host: 'www.a.cz' }, report('https://www.a.cz/clanek'), true), true);
  // no wording, a sub-frame, or another page's late report
  assert.equal(bannerSuspected({ host: 'www.a.cz' }, report('https://www.a.cz/', []), true), false);
  assert.equal(bannerSuspected({ host: 'www.a.cz' }, report('https://www.a.cz/'), false), false);
  assert.equal(bannerSuspected({ host: 'www.a.cz' }, report('https://www.b.cz/'), true), false);
  assert.equal(bannerSuspected({ host: 'www.a.cz' }, {}, true), false);
  // a banner a rule found or answered has the same wording: that state wins
  for (const consent of ['working', 'done', 'failed', 'wall', 'paused', 'acceptedSite', 'choice']) {
    assert.equal(bannerSuspected({ host: 'www.a.cz', consent }, report('https://www.a.cz/'), true), false);
  }
});

test('background: a heuristic report racing popupFound never drops the consent state', async () => {
  // The built background with a fake chrome whose session writes land late, so unserialized read/merge/writes of
  // the tab record interleave (report read -> popupFound read -> popupFound write -> report write).
  const session = {};
  const later = (ms) => new Promise((r) => setTimeout(r, ms));
  const listeners = [];
  const event = () => ({ addListener: (f) => listeners.push(f) });
  const chrome = {
    runtime: { onMessage: { addListener: (f) => { chrome.onMessage = f; } }, onInstalled: event(), onStartup: event(), getURL: (p) => `chrome-extension://x/${p}` },
    storage: {
      onChanged: event(),
      local: { get: async () => ({}), set: async () => {} },
      session: {
        get: async (k) => { const v = session[k]; await later(1); return v === undefined ? {} : { [k]: structuredClone(v) }; },
        set: async (o) => { await later(5); Object.assign(session, structuredClone(o)); },
        remove: async () => {},
      },
    },
    tabs: { onRemoved: event(), sendMessage: async () => {} },
    alarms: { onAlarm: event(), create() {}, clear() {}, get: async () => null },
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {}, setTitle: async () => {} },
  };
  vm.runInNewContext(read('build/chrome/background.js'), { chrome, console, URL, setTimeout, structuredClone, fetch: () => Promise.reject(new Error('offline')) });
  session['tab-7'] = { host: 'www.a.cz' };
  const sender = { tab: { id: 7, url: 'https://www.a.cz/' }, frameId: 0, url: 'https://www.a.cz/' };
  chrome.onMessage({ type: 'report', url: 'https://www.a.cz/', mainFrame: true, state: { heuristicPatterns: ['/accept all/gi'] } }, sender, () => {});
  chrome.onMessage({ type: 'popupFound', cmp: 'Onetrust' }, sender, () => {});
  await later(100);
  assert.equal(session['tab-7'].consent, 'working');
  assert.equal(session['tab-7'].cmp, 'Onetrust');
  // On its own, the same report marks the tab.
  session['tab-8'] = { host: 'www.a.cz' };
  chrome.onMessage({ type: 'report', url: 'https://www.a.cz/', mainFrame: true, state: { heuristicPatterns: ['/accept all/gi'] } }, { ...sender, tab: { id: 8, url: 'https://www.a.cz/' } }, () => {});
  await later(50);
  assert.deepEqual(session['tab-8'], { host: 'www.a.cz', banner: 'suspected' });
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

test('failed report send: kept with the approved body, retried for a week, cancel and sent end it (#17)', async () => {
  const { afterSend, expireSends, sendsDue, SEND_RETRY_MS } = await import('../extension/lib.js');
  const body = { url: 'https://www.idnes.cz', consent: 'failed', cmp: 'x', version: '1.0', browser: 'chrome' };
  const pending = { url: body.url, body, at: 1000 };
  const other = { host: 'www.alza.cz', url: 'https://www.alza.cz/', at: 1 };
  const reports = [{ host: 'www.idnes.cz', url: 'https://www.idnes.cz/a', at: 900, sendPending: pending }, other];
  // Offline: still pending, with why; the body is the one the popup showed, unchanged.
  const failed = afterSend(reports, 'www.idnes.cz', pending, { ok: false, reason: 'offline? Failed to fetch' }, 2000);
  assert.deepEqual(failed[0].sendPending, { ...pending, reason: 'offline? Failed to fetch' });
  assert.equal(failed[1], other);
  assert.deepEqual(sendsDue(failed, 2000).map((r) => r.sendPending.body), [body]);
  // Back online: sent, nothing left to retry.
  const sent = afterSend(failed, 'www.idnes.cz', pending, { ok: true, reason: '' }, 3000);
  assert.equal(sent[0].sendPending, undefined);
  assert.equal(sent[0].sentAt, 3000);
  assert.deepEqual(sendsDue(sent, 3000), []);
  // Cancelled in Settings while a retry was in flight: the failed retry must not bring it back.
  const { sendPending, ...cancelled } = failed[0];
  assert.equal(afterSend([cancelled], 'www.idnes.cz', pending, { ok: false, reason: 'x' }, 4000)[0].sendPending, undefined);
  // A week on: no longer retried, and dropped.
  assert.deepEqual(sendsDue(failed, 1000 + SEND_RETRY_MS), []);
  assert.equal(expireSends(failed, 1000 + SEND_RETRY_MS)[0].sendPending, undefined);
  assert.deepEqual(expireSends(failed, 2000)[0].sendPending, failed[0].sendPending);
  // background.js keeps the send before trying, retries it on the data alarm and on popup open.
  const bg = read('extension/background.js');
  assert.match(bg, /sendPending: pending/);
  assert.match(bg, /a\.name === 'data'[\s\S]*retrySends\(\)/);
  assert.match(read('extension/popup/popup.js'), /type: 'retrySends'/);
});

test('markFixed: a reported site is fixed once a later rule list adds a rule or wall entry for it', () => {
  const list = (rules, walls = []) => ({ consent: { walls, rules: rules.map(([name, urlPattern]) => ({ name, ...(urlPattern && { runContext: { urlPattern } }) })) } });
  const a = list([['cz-shop-old', '^https?://([a-z0-9-]+\\.)*shop\\.cz/'], ['cz-other', '^https?://other\\.cz/'], ['generic']]);
  const url = 'https://www.shop.cz/kosik';
  const report = { url, host: 'www.shop.cz', at: 1, rulesAtReport: siteRules(a, url) };
  assert.deepEqual(report.rulesAtReport, { names: ['cz-shop-old'], wall: false }, 'a rule without a urlPattern does not count');
  // list B adds a rule for the site
  const b = list([...a.consent.rules.map((r) => [r.name, r.runContext?.urlPattern]), ['cz-shop', '^https?://www\\.shop\\.cz/']]);
  assert.equal(markFixed([report], b, 50)[0].fixedAt, 50);
  // a wall entry for the site counts too
  assert.equal(markFixed([report], list([], ['shop.cz']), 50)[0].fixedAt, 50);
  // no new matching rule: still just reported (same list, a rule for another site, a new generic rule)
  const c = list([...a.consent.rules.map((r) => [r.name, r.runContext?.urlPattern]), ['cz-elsewhere', '^https?://elsewhere\\.cz/'], ['generic-2']], ['other.cz']);
  for (const d of [a, c]) assert.equal(markFixed([report], d, 50)[0], report);
  // set once, and never on a report saved before rulesAtReport existed
  assert.equal(markFixed([{ ...report, fixedAt: 9 }], b, 50)[0].fixedAt, 9);
  assert.equal(markFixed([{ url, host: 'www.shop.cz', at: 1 }], b, 50)[0].fixedAt, undefined);
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

test('rule lists: a failed refresh keeps the last-good status and says what went wrong', async () => {
  const d = { schema: 1, generated: '2026-10-26T12:00:00Z', shorts: { hide: [], cards: [] }, consent: { walls: [], rules: [{ name: 'r' }, { name: 's' }], disabledCmps: [] } };
  const res = (status, body) => ({ ok: status < 400, status, json: async () => (typeof body === 'string' ? JSON.parse(body) : body) });
  assert.deepEqual(await fetchRuleList('u', async () => { throw new TypeError('Failed to fetch'); }), { error: 'offline' });
  // a 404 page is HTML: the status is checked before the body is parsed
  assert.deepEqual(await fetchRuleList('u', async () => res(404, '<!doctype html>')), { error: 'server error 404' });
  assert.deepEqual(await fetchRuleList('u', async () => res(200, '<!doctype html>')), { error: 'not a rule list' });
  assert.deepEqual(await fetchRuleList('u', async () => res(200, { schema: 2 })), { error: 'not a rule list' });
  assert.deepEqual(await fetchRuleList('u', async () => res(200, d)), { data: d });
  // a stalled server times out instead of hanging the refresh
  const stall = (u, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
  assert.deepEqual(await fetchRuleList('u', stall, 20), { error: 'timed out' });

  const oct24 = Date.UTC(2026, 9, 24, 12), oct25 = Date.UTC(2026, 9, 25, 12), nov5 = Date.UTC(2026, 10, 5, 12);
  const good = ruleListStatus(undefined, { data: d }, oct24);
  assert.deepEqual(good, { ok: true, at: oct24, lastOkAt: oct24, generated: d.generated, rules: 2 });
  const offline = ruleListStatus(good, { error: 'offline' }, oct25);
  assert.deepEqual(offline, { ok: false, at: oct25, error: 'offline', lastOkAt: oct24, generated: d.generated, rules: 2 });
  assert.deepEqual(ruleListStatus(offline, { error: 'server error 404' }, nov5).lastOkAt, oct24, 'kept across repeated failures');
  assert.equal(ruleListStatus({ ok: true, at: oct24, rules: 2 }, { error: 'offline' }, oct25).lastOkAt, oct24, 'a status saved before lastOkAt');
  assert.deepEqual(ruleListStatus(undefined, { error: 'offline' }, oct25), { ok: false, at: oct25, error: 'offline' });

  assert.deepEqual(ruleListLine(offline, oct25), { text: "(couldn't reach it (offline); still using 2 rules from Oct 24)", dot: '#30a46c' });
  assert.equal(ruleListLine(offline, nov5).dot, '#f76b15', 'amber once the rules in use are over a week old');
  assert.equal(ruleListLine(good, nov5).dot, '#f76b15');
  assert.equal(ruleListLine({ ok: false, at: oct25, error: 'offline' }, oct25).text, "(couldn't reach it (offline); no rules from it yet)");
  assert.equal(ruleListLine({ ok: false, at: oct25, error: 'offline' }, oct25).dot, '#e5484d');
  assert.equal(ruleListLine(undefined).text, '(not checked yet)');

  assert.equal(updateOutcome(['u'], { u: good }, { u: { ...good, at: oct25 } }), 'up to date (Oct 26)');
  assert.equal(updateOutcome(['u'], { u: { ...good, rules: 1 } }, { u: good }), '1 new rule');
  assert.equal(updateOutcome(['u'], {}, { u: { ...good, rules: 3 } }), '3 new rules');
  assert.equal(updateOutcome(['u'], { u: good }, { u: ruleListStatus(good, { error: 'server error 404' }, oct25) }), "couldn't reach it (server error 404)");
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
  const { hide, posts, playables } = JSON.parse(read('data/shorts.json'));
  for (const s of hide) assert.ok(css.includes(`html:not([data-declutter-shorts="off"]) ${s} {`), s);
  for (const s of posts) assert.ok(css.includes(`html:not([data-declutter-posts="off"]) ${s} {`), s);
  for (const s of playables) assert.ok(css.includes(`html:not([data-declutter-playables="off"]) ${s} {`), s);
  // One rule per selector: in a list, one selector a browser can't parse would drop all of them.
  assert.equal(css.match(/\{ display: none !important; \}/g).length, hide.length + posts.length + playables.length);
  // Posts are hidden in feeds only: every selector is tied to a feed container, so a channel's Posts tab stays.
  for (const s of posts) assert.match(s, /^yt[dm]-rich-(item|section|grid)-renderer/, s);
  // Playables: the home shelf and the menu entries only, never a single card, so the /playables page stays.
  for (const s of playables) assert.match(s, /^(yt[dm]-rich-section-renderer|ytd-(mini-)?guide-entry-renderer):has\(/, s);
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

test('wall sites: agree for me / ask me / leave alone per site, never refuse (#13)', async () => {
  // Imported here so the rest of this file still runs against a lib.js without it.
  const { wallMode } = await import('../extension/lib.js');
  assert.equal(typeof wallMode, 'function', 'lib.js exports wallMode');
  const h = 'www.blesk.cz';
  assert.equal(wallMode(h, { walls: 'auto' }), 'agree');
  assert.equal(wallMode(h, { walls: 'manual' }), 'ask');
  // "ask me" overrides auto mode for that site only
  assert.equal(wallMode(h, { walls: 'auto', wallAskSites: [h] }), 'ask');
  assert.equal(wallMode('www.novinky.cz', { walls: 'auto', wallAskSites: [h] }), 'agree');
  // "agree for me" (acceptSites, dead on wall sites before) overrides manual mode for that site
  assert.equal(wallMode(h, { walls: 'manual', acceptSites: [h] }), 'agree');
  assert.equal(wallMode(h, { walls: 'auto', exceptions: [h], acceptSites: ['blesk.cz'] }), 'ignore');
  // The popup's wall patch: each choice reads back, and "agree" on a host under an "ask me" parent wins for that host.
  const { wallModePatch } = await import('../extension/lib.js');
  for (const m of ['agree', 'ask', 'ignore']) for (const walls of ['auto', 'manual']) {
    const s = { walls, wallAskSites: ['blesk.cz'], acceptSites: [], exceptions: [], refuseSites: [] };
    assert.equal(wallMode(h, { ...s, ...wallModePatch(h, m, s) }), m, `${m} in ${walls}`);
  }
  assert.equal(wallMode(h, { walls: 'auto', wallAskSites: ['blesk.cz'] }), 'ask', 'subdomains, like every other site list');
  // The background's wall autoAction (init and popupFound) follows the site's mode, not the global mode alone.
  const bg = read('extension/background.js');
  assert.equal(bg.match(/wallMode\(tabHost, settings\) === 'agree'/g)?.length, 2);
  assert.doesNotMatch(bg, /walls === 'auto'/);
  // The popup's wall control has no "refuse".
  const html = read('extension/popup/popup.html');
  const wallButtons = html.match(/id="wallMode">([\s\S]*?)<\/div>/)?.[1] ?? '';
  assert.deepEqual([...wallButtons.matchAll(/data-mode="(\w+)"/g)].map((m) => m[1]), ['agree', 'ask', 'ignore']);
});

test('walls: a pending teaser accept carries over to its own consent page only, not to another wall', async () => {
  // The background as built, with an in-memory extension API. Manual mode: walls wait for "Accept" in the popup.
  const store = { local: { settings: { walls: 'manual', chip: false } }, session: {} };
  const area = (s) => ({
    get: async (k) => Object.fromEntries([k].flat().filter((x) => x in s).map((x) => [x, structuredClone(s[x])])),
    set: async (o) => { Object.assign(s, structuredClone(o)); },
    remove: async (k) => { for (const x of [k].flat()) delete s[x]; },
  });
  const sent = [];
  let onMessage;
  const on = { addListener: () => {} };
  const chrome = {
    storage: { local: area(store.local), session: area(store.session), onChanged: on },
    runtime: { onMessage: { addListener: (f) => { onMessage = f; } }, onInstalled: on, onStartup: on, getURL: (p) => `chrome-extension://x/${p}` },
    tabs: { onRemoved: on, sendMessage: async (tabId, msg, opts) => { sent.push(msg); } },
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {}, setTitle: async () => {} },
    alarms: { onAlarm: on },
  };
  vm.runInNewContext(read('build/chrome/background.js'), { chrome, console, URL, setTimeout, structuredClone });
  const settle = () => new Promise((r) => setTimeout(r, 20));
  const fromPage = async (url, msg) => { onMessage(msg, { tab: { id: 1 }, frameId: 0, url }, () => {}); await settle(); };
  const tab = () => store.session['tab-1'];
  const init = async (url) => { sent.length = 0; await fromPage(url, { type: 'init' }); return sent.find((m) => m.type === 'initResp').config; };

  // Seznam's bottom bar, accepted from the popup: its consent page may accept on its own for 30 s.
  assert.equal((await init('https://www.novinky.cz/')).autoAction, null);
  await fromPage('https://www.novinky.cz/', { type: 'popupFound', cmp: 'cz-wall-seznam-teaser' });
  assert.equal(tab().consent, 'wall');
  await new Promise((r) => onMessage({ type: 'acceptWall', tabId: 1 }, { url: 'chrome-extension://x/popup/popup.html' }, r));
  assert.equal((await init('https://cmp.seznam.cz/nastaveni-souhlasu?service=novinky')).autoAction, 'optIn');
  await fromPage('https://cmp.seznam.cz/nastaveni-souhlasu?service=novinky', { type: 'popupFound', cmp: 'cz-wall-seznam-page' });
  assert.equal(tab().consent, 'accepting');

  // Same accept, but the hand-off is interrupted and the tab reaches a CPEx wall within the 30 s: not accepted.
  await fromPage('https://www.novinky.cz/', { type: 'popupFound', cmp: 'cz-wall-seznam-teaser' });
  await new Promise((r) => onMessage({ type: 'acceptWall', tabId: 1 }, { url: 'chrome-extension://x/popup/popup.html' }, r));
  assert.equal((await init('https://www.blesk.cz/')).autoAction, null, 'another wall family gets no optIn at init');
  await fromPage('https://www.blesk.cz/', { type: 'popupFound', cmp: 'cz-wall-cpex' });
  assert.equal(tab().consent, 'wall', 'and stays a wall when found');
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
  assert.deepEqual(m.shorts.playables, []); // ...or before playables
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

test('DECLUTTER_REOPEN: a refused Cookiebot/Didomi banner is opened again for the accept', async () => {
  const { DECLUTTER_REOPEN: reopen, DECLUTTER_CAN_REOPEN: canReopen } = declutterSnippets;
  const calls = [];
  try {
    // Stored answers, as the live CMPs report them after a refuse and a reload.
    globalThis.window = { Cookiebot: { hasResponse: true, renew: () => calls.push('cookiebot') } };
    assert.equal(await reopen(0), 'cookiebot');
    // Didomi's notice, not preferences.show(): autoconsent's optIn clicks the notice's agree button.
    globalThis.window = { Didomi: { shouldConsentBeCollected: () => false, notice: { show: () => calls.push('didomi') },
      preferences: { show: () => calls.push('didomi-preferences') } } };
    assert.equal(await reopen(0), 'didomi');
    assert.deepEqual(calls, ['cookiebot', 'didomi']);
    assert.ok(canReopen());
    // OneTrust's reopen is the preference centre, which can leave a modal with no accept button: not reopened.
    globalThis.window = { OneTrust: { IsAlertBoxClosed: () => true, ToggleInfoDisplay: () => calls.push('onetrust') } };
    assert.equal(await reopen(0), false);
    assert.equal(canReopen(), false);
    // No stored answer yet: the banner shows by itself, nothing is reopened, and the wait ends at once, so the
    // banner is not reopened after autoconsent answers it.
    const cb = { hasResponse: false, renew: () => calls.push('again') };
    globalThis.window = { Cookiebot: cb };
    setTimeout(() => { cb.hasResponse = true; }, 100);
    const t0 = Date.now();
    assert.equal(await reopen(2000), false);
    assert.ok(Date.now() - t0 < 100);
    await new Promise((r) => setTimeout(r, 150));
    // A CMP that loads late is waited for.
    globalThis.window = {};
    setTimeout(() => { globalThis.window.Cookiebot = { hasResponse: true, renew: () => calls.push('late') }; }, 100);
    assert.equal(await reopen(2000), 'cookiebot');
    // Any other CMP: nothing to reopen, the popup explains instead.
    globalThis.window = { __tcfapi: () => {} };
    assert.equal(await reopen(0), false);
    assert.equal(canReopen(), false);
    assert.deepEqual(calls, ['cookiebot', 'didomi', 'late']);
  } finally { delete globalThis.window; }
});

test('applyCategories: consentmanager and Usercentrics get the mix, not refuse-all', async () => {
  const MIX = { A: true, B: true, D: false, E: false, F: false, X: false };
  const calls = [];
  // o2's purposes, as getCMPData returned them live.
  globalThis.window = { __cmp: (cmd, arg) => {
    if (cmd === 'getCMPData') return { purposesList: [{ id: 'c51', name: 'Nezbytné' }, { id: 'c52', name: 'Marketingové' }, { id: 'c54', name: 'Analytické' }] };
    calls.push([cmd, arg]);
  } };
  try {
    assert.equal(await applyCategories(MIX, 'consentmanager.net'), 'consentmanager');
    // Wanted first, refused last: a vendor with both an analytics and a marketing purpose ends up off.
    assert.deepEqual(calls, [['setPurposeConsent', [['c51', 'c54'], 1, true]], ['setPurposeConsent', [['c52'], 0, true]], ['close', undefined]]);
  } finally { delete globalThis.window; }
  // dm's categories: the label decides (Google Analytics sits under slug "functional", labelled as statistics).
  const accepted = [], rejected = [];
  globalThis.window = { UC_UI: {
    getSettingsLabels: () => ({ categories: [
      { slug: 'essential', label: 'Nezbytné cookies' }, { slug: 'functional', label: 'Statistické cookies' },
      { slug: 'customCategory-1f59', label: 'Pokročilé funkce' }, { slug: 'marketing', label: 'Marketingové cookies' }] }),
    getServicesBaseInfo: () => [
      { id: 'uc', categorySlug: 'essential', isEssential: true }, { id: 'ga', categorySlug: 'functional', isEssential: false },
      { id: 'yt', categorySlug: 'customCategory-1f59', isEssential: false }, { id: 'fb', categorySlug: 'marketing', isEssential: false }],
    acceptServices: async (ids) => accepted.push(...ids), rejectServices: async (ids) => rejected.push(...ids), closeCMP: async () => true,
  } };
  try {
    assert.equal(await applyCategories(MIX, 'usercentrics-api'), 'usercentrics');
    assert.deepEqual({ accepted, rejected }, { accepted: ['ga', 'yt'], rejected: ['fb'] });
  } finally { delete globalThis.window; }
});

test('applyCategories: measuring ads or content is not analytics', async () => {
  const calls = [];
  globalThis.window = { __cmp: (cmd, arg) => {
    if (cmd === 'getCMPData') return { purposesList: [
      { id: '7', name: 'Measure advertising performance' }, { id: '8', name: 'Measure content performance' },
      { id: '9', name: 'Understand audiences through statistics' }, { id: 'c1', name: 'Měření výkonu reklamy' }] };
    calls.push([cmd, arg]);
  } };
  try {
    // Analytics only (B on, E and F off): ad and content measurement stay off.
    assert.equal(await applyCategories({ A: false, B: true, D: false, E: false, F: false, X: false }, 'consentmanager.net'), 'consentmanager');
    assert.deepEqual(calls.slice(0, 2), [['setPurposeConsent', [['9'], 1, true]], ['setPurposeConsent', [['7', '8', 'c1'], 0, true]]]);
  } finally { delete globalThis.window; }
});

test('GPC: one header rule, skipped sites excluded both ways', () => {
  const r = gpcRule(['o2.cz', 'seznam.cz']);
  assert.deepEqual(r.action.requestHeaders, [{ header: 'Sec-GPC', operation: 'set', value: '1' }]);
  assert.ok(r.condition.resourceTypes.includes('main_frame') && r.condition.resourceTypes.includes('sub_frame'));
  assert.deepEqual(r.condition.excludedRequestDomains, ['o2.cz', 'seznam.cz']);
  assert.deepEqual(r.condition.excludedInitiatorDomains, ['o2.cz', 'seznam.cz']);
  // An empty exclusion list is left out, not sent as [] (Chrome rejects an empty domain list).
  assert.ok(!('excludedRequestDomains' in gpcRule([]).condition));
  assert.deepEqual(gpcExcludeMatches(['o2.cz']), ['*://o2.cz/*', '*://*.o2.cz/*']);
});

test('build: welcome page, GPC script and store-only URLs', () => {
  const bg = read('build/chrome/background.js');
  assert.ok(fs.existsSync(path.join(root, 'build/chrome/welcome/welcome.html')));
  assert.ok(fs.existsSync(path.join(root, 'build/chrome/consent/gpc.js')));
  // npm test builds without --store: no baked-in rule list, no uninstall page.
  assert.ok(!bg.includes('theanhgen.github.io/declutter/data.json') && !bg.includes('bye.html'));
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

test('dates: upload dates by video id from any renderer, in the page language', () => {
  const data = { playerOverlays: { endScreen: { results: [
    { endScreenVideoRenderer: { videoId: 'a', publishedTimeText: { simpleText: '3 years ago' } } },
    { endScreenVideoRenderer: { videoId: 'b', publishedTimeText: { runs: [{ text: 'před 2 ' }, { text: 'dny' }] } } },
    { endScreenVideoRenderer: { videoId: 'c' } },
  ] } }, contents: [{ videoWithContextRenderer: { videoId: 'a', shortViewCountText: { simpleText: '1M views' } } }] };
  assert.deepEqual(collectDates(data), { a: '3 years ago', b: 'před 2 dny' });
  const loop = { videoId: 'x', publishedTimeText: { simpleText: 'now' } };
  loop.self = loop;
  assert.deepEqual(collectDates(loop), { x: 'now' });
  assert.equal(videoIdOf('/watch?v=y6nn4p5JOBM&pp=ugUH'), 'y6nn4p5JOBM');
  assert.equal(videoIdOf('/@channel'), null);
  assert.equal(videoIdOf(undefined), null);
});

test('site: every link on index.html resolves; tip worded like the Safari tip jar', () => {
  const html = read('site/index.html');
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  // External links are https store/GitHub URLs (not fetched here); the rest must point at the page or a site/ file.
  for (const [, href] of html.matchAll(/\shref="([^"]+)"/g)) {
    if (href.startsWith('#')) assert.ok(ids.has(href.slice(1)), `${href} points at nothing on the page`);
    else if (!href.startsWith('https://')) assert.ok(fs.existsSync(path.join(root, 'site', href)), `${href} is not in site/`);
  }
  // Tips exist only as StoreKit purchases in the Safari app; the site and settings use its sentence.
  const tip = read('safari/Shared/TipJar.swift').match(/"(declutter is free\.[^"]+)"/)[1];
  const text = (p) => read(p).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
  assert.ok(text('site/index.html').includes(tip), `site: "${tip}"`);
  assert.ok(text('extension/options/options.html').includes(tip), `settings: "${tip}"`);
});

test('settings undo: restores exactly, keeps what changed meanwhile', () => {
  // A removed site or rule list goes back in its place; not twice, and not over the popup's newer choice for it.
  assert.deepEqual(restoreItem(['a.cz', 'c.cz'], 'b.cz', 1), ['a.cz', 'b.cz', 'c.cz']);
  assert.deepEqual(restoreItem(['a.cz'], 'b.cz', 5), ['a.cz', 'b.cz']);
  assert.deepEqual(restoreItem(undefined, 'b.cz', 0), ['b.cz']);
  assert.deepEqual(restoreItem(['b.cz', 'a.cz'], 'b.cz', 1), ['b.cz', 'a.cz']);
  assert.deepEqual(restoreItem(['a.cz'], 'b.cz', 1, ['b.cz']), ['a.cz'], 'popup moved it to the other list');

  const old = { refused: 40, walls: 2, clicks: 90, since: 1000, byCmp: { didomi: { filled: 42, clicks: 90 } } };
  assert.deepEqual(restoreStats(old, {}), old);
  assert.deepEqual(restoreStats(old, { refused: 1, clicks: 3, since: 5000, byCmp: { didomi: { filled: 1, clicks: 3 }, x: { filled: 1, clicks: 0 } } }),
    { refused: 41, walls: 2, clicks: 93, since: 1000, byCmp: { didomi: { filled: 43, clicks: 93 }, x: { filled: 1, clicks: 0 } } });

  const r = (host, at) => ({ host, url: `https://${host}/`, at });
  const reports = [r('b.cz', 2), r('a.cz', 1)];
  assert.deepEqual(restoreReports(reports, []), reports);
  assert.deepEqual(restoreReports(reports, [r('a.cz', 9), r('c.cz', 8)]), [r('a.cz', 9), r('c.cz', 8), r('b.cz', 2)]);
  assert.equal(restoreReports(Array.from({ length: 100 }, (_, i) => r(`${i}.cz`, i)), [r('new.cz', 999)]).length, 100);
});

test('settings undo: every removal and both clear links offer one, shown where it happened', () => {
  const js = read('extension/options/options.js');
  for (const [offer, shown] of [['offerUndo(key,', 'undoNotes(key)'], ["offerUndo('ruleLists',", "undoLine('ruleLists')"],
    ["offerUndo('byCmp',", "undoLine('byCmp')"], ["offerUndo('reports',", "undoLine('reports')"]]) {
    assert.ok(js.includes(offer), offer);
    assert.ok(js.includes(shown), shown);
  }
});

// The background loaded as built, with an in-memory extension API whose storage answers asynchronously like the real one.
async function loadBackground({ settings = {}, session = {} } = {}) {
  const vm = await import('node:vm');
  const tick = () => new Promise((r) => setTimeout(r, 1));
  const area = (data) => ({
    data,
    async get(keys) {
      await tick();
      const list = keys == null ? Object.keys(data) : [keys].flat();
      return JSON.parse(JSON.stringify(Object.fromEntries(list.filter((k) => k in data).map((k) => [k, data[k]]))));
    },
    async set(items) { await tick(); Object.assign(data, JSON.parse(JSON.stringify(items))); },
    async remove(keys) { await tick(); for (const k of [keys].flat()) delete data[k]; },
  });
  const listeners = {};
  const on = (name) => ({ addListener: (fn) => { (listeners[name] ??= []).push(fn); } });
  const sent = [];
  const chrome = {
    storage: { local: area({ settings }), session: area(session), onChanged: on('storage') },
    runtime: { onMessage: on('message'), onInstalled: on('installed'), onStartup: on('startup'),
      getURL: (p) => `chrome-extension://x/${p}`, getManifest: () => ({ version: '0' }) },
    tabs: { onRemoved: on('removed'), sendMessage: async (tabId, msg, opts) => { sent.push({ tabId, msg, frameId: opts?.frameId }); } },
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {}, setTitle: async () => {} },
    alarms: { onAlarm: on('alarm'), create() {}, clear() {}, get: async () => null },
  };
  vm.runInNewContext(read('build/chrome/background.js'), { chrome, console, setTimeout, clearTimeout, URL, fetch });
  const send = (msg, sender) => listeners.message.forEach((fn) => fn(msg, sender, () => {}));
  // Until done() holds, then a little longer for any write still in flight (5 s at most).
  const settle = async (done) => {
    for (const end = Date.now() + 5000; !done() && Date.now() < end;) await new Promise((r) => setTimeout(r, 10));
    await new Promise((r) => setTimeout(r, 100));
  };
  return { chrome, sent, send, settle };
}

test('background: a sub-frame on the new site gets the new site\'s choice, not the previous one\'s (#50)', async () => {
  // a.cz is accepted; the tab navigates to b.cz (refused) and its CMP iframe inits before frame 0 has recorded b.cz.
  const bg = await loadBackground({ settings: { acceptSites: ['a.cz'] }, session: { 'tab-7': { host: 'a.cz' } } });
  const tab = { id: 7, url: 'https://a.cz/' };
  bg.send({ type: 'init' }, { tab, frameId: 0, url: 'https://b.cz/' });
  bg.send({ type: 'init' }, { tab, frameId: 3, url: 'https://cmp.example/frame' });
  await bg.settle(() => bg.sent.filter((m) => m.msg.type === 'initResp').length === 2);
  const action = (frameId) => bg.sent.find((m) => m.frameId === frameId && m.msg.type === 'initResp').msg.config.autoAction;
  assert.equal(action(0), 'optOut');
  assert.equal(action(3), 'optOut');
});

test('background: concurrent tab-state and counter updates keep every field (#50)', async () => {
  const bg = await loadBackground();
  const sender = { tab: { id: 7, url: 'https://b.cz/' }, frameId: 0, url: 'https://b.cz/' };
  bg.send({ type: 'shortsLeak', count: 2, path: '/x' }, sender);
  bg.send({ type: 'optOutResult', result: false, cmp: 'c' }, sender);
  bg.send({ type: 'shortsRedirect' }, sender);
  bg.send({ type: 'shortsRedirect' }, sender);
  await bg.settle(() => bg.chrome.storage.local.data.stats?.shorts === 2 && bg.chrome.storage.session.data['tab-7']?.shortsLeak === 2
    && bg.chrome.storage.session.data['tab-7']?.consent === 'failed');
  const state = bg.chrome.storage.session.data['tab-7'];
  assert.equal(state.shortsLeak, 2);
  assert.equal(state.consent, 'failed');
  assert.equal(bg.chrome.storage.local.data.stats.shorts, 2);
});
