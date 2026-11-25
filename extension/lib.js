// Pure helpers shared by the background and content scripts; unit-tested in test/unit.test.mjs.

import { PALETTE } from './palette.js';
import { LANG, t } from './i18n.js';
export const STUCK_AFTER_MS = 15000;

export const hostMatches = (host, domains) =>
  domains.some((d) => host === d || host.endsWith('.' + d));

// Per-site choice for cookie banners, one model for the popup, Settings and the background. Three lists of domains:
// acceptSites (accept), exceptions (leave alone) and refuseSites (refuse; only needed to override a parent domain on
// one of the other two, absent in older settings). A domain covers its subdomains; the most specific entry that
// covers a host wins; no entry means refuse (or "your mix" from Settings → your choice).
const SITE_LISTS = [['acceptSites', 'accept'], ['exceptions', 'ignore'], ['refuseSites', 'refuse']];
const SITE_LIST_OF = Object.fromEntries(SITE_LISTS.map(([key, mode]) => [mode, key]));
export function siteEntry(host, s = {}) {
  let best = null;
  for (const [key, mode] of SITE_LISTS) {
    for (const domain of s[key] ?? []) {
      if (hostMatches(host, [domain]) && (!best || domain.length > best.domain.length)) best = { domain, mode };
    }
  }
  return best;
}
export const siteMode = (host, s) => siteEntry(host, s)?.mode ?? 'refuse';
// The settings patch that gives host this mode. Only host's own entry changes: an entry for a parent domain stays,
// so the choice for the parent's other subdomains is kept. host gets an entry only where it differs from what it
// would inherit, so "refuse" without a parent just takes the host off the lists.
export function siteModePatch(host, mode, s = {}) {
  const lists = Object.fromEntries(SITE_LISTS.map(([key]) => [key, (s[key] ?? []).filter((d) => d !== host)]));
  if (siteMode(host, lists) !== mode) lists[SITE_LIST_OF[mode]].push(host);
  return lists;
}
// A site typed into Settings ("idnes.cz", "https://www.idnes.cz/zpravy") -> its host without "www.", or null.
export function siteHost(input) {
  const t = String(input ?? '').trim().toLowerCase();
  if (!t) return null;
  try {
    const h = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(t) ? t : `https://${t}`).hostname.replace(/^www\./, '');
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h) ? h : null;
  } catch { return null; }
}

// A remote data.json is only used if it has this shape (and is newer than the bundled one). Every rule needs a name
// and a urlPattern that compiles: the background builds a RegExp from it on every frame's init.
const compiles = (re) => { try { new RegExp(re ?? ''); return true; } catch { return false; } };
const validRule = (r) => !!r && typeof r.name === 'string' && compiles(r.runContext?.urlPattern);
export function validData(d) {
  return !!d && d.schema === 1 && typeof d.generated === 'string' &&
    Array.isArray(d.shorts?.hide) && Array.isArray(d.shorts?.cards) &&
    (d.shorts.posts === undefined || Array.isArray(d.shorts.posts)) && // lists built before posts existed have none
    (d.shorts.playables === undefined || Array.isArray(d.shorts.playables)) && // ...or before playables
    Array.isArray(d.consent?.walls) && Array.isArray(d.consent?.rules) &&
    Array.isArray(d.consent?.disabledCmps) && d.consent.rules.every(validRule);
}

// The rule lists to keep after a refresh, by URL: a fresh copy if the fetch worked, else the last good one (so being
// offline never drops rules); URLs no longer in settings drop out.
export function keepRemoteLists(urls, previous = {}, fetched = {}) {
  return Object.fromEntries(urls.map((u) => [u, fetched[u] ?? (validData(previous[u]) ? previous[u] : null)]).filter(([, d]) => d));
}

// Fetches one rule list; never throws: { data } or { error } in words a person can act on. res.ok is checked before
// the body is parsed, so a 404 page says "server error 404", not "Unexpected token '<'".
// A stalled server times out instead of holding up the other lists and leaving settings on "checking…".
export const RULE_LIST_TIMEOUT_MS = 15000;
export async function fetchRuleList(url, fetchFn = fetch, timeoutMs = RULE_LIST_TIMEOUT_MS) {
  const signal = AbortSignal.timeout(timeoutMs);
  let res;
  try { res = await fetchFn(url, { cache: 'no-store', signal }); } catch { return { error: signal.aborted ? 'timed out' : 'offline' }; }
  if (!res.ok) return { error: `server error ${res.status}` };
  try {
    const d = await res.json();
    if (validData(d)) return { data: d };
  } catch { if (signal.aborted) return { error: 'timed out' }; /* not JSON */ }
  return { error: 'not a rule list' };
}

// A rule list's status after a refresh. A failed fetch keeps the last good date, version and rule count: those
// rules still apply (keepRemoteLists), so settings says so instead of only the error. Statuses saved before
// lastOkAt existed count their last ok check as it.
export function ruleListStatus(prev, result, now = Date.now()) {
  if (result.data) return { ok: true, at: now, lastOkAt: now, generated: result.data.generated, rules: result.data.consent.rules.length };
  const lastOkAt = prev?.lastOkAt ?? (prev?.ok ? prev.at : undefined);
  return { ok: false, at: now, error: result.error, ...(lastOkAt && { lastOkAt, generated: prev.generated, rules: prev.rules }) };
}

// Settings' line for one rule list: its text and dot. Amber once the rules in use are more than a week old.
export const RULES_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const shortDate = (at) => new Date(at).toLocaleDateString(LANG, { month: 'short', day: 'numeric' });
// A fetch error (fetchRuleList's words, kept in storage in English) in the UI language.
const errorText = (e = '') => {
  const server = /^server error (\d+)$/.exec(e);
  if (server) return t('error.server', { status: server[1] });
  return { offline: t('error.offline'), 'timed out': t('error.timeout'), 'not a rule list': t('error.notList') }[e] ?? e;
};
export function ruleListLine(st, now = Date.now()) {
  if (!st) return { text: t('lists.notChecked'), dot: PALETTE.neutral };
  const lastOkAt = st.lastOkAt ?? (st.ok ? st.at : undefined);
  const dot = !lastOkAt ? PALETTE.bad : now - lastOkAt > RULES_STALE_MS ? PALETTE.wall : PALETTE.ok;
  if (st.ok) return { text: t('lists.ok', { n: st.rules, at: new Date(st.at).toLocaleString() }), dot };
  const rest = lastOkAt ? t('lists.stillUsing', { n: st.rules, date: shortDate(lastOkAt) }) : t('lists.noneYet');
  return { text: t('lists.unreachable', { error: errorText(st.error), rest }), dot };
}

// What "update rules now" ended in, from the statuses before and after: the error, the new rules, or up to date.
export function updateOutcome(urls, before = {}, after = {}) {
  const errors = [...new Set(urls.filter((u) => after[u] && !after[u].ok).map((u) => after[u].error))];
  if (errors.length) return t('update.unreachable', { error: errors.map(errorText).join(' / ') });
  const added = urls.reduce((n, u) => n + Math.max(0, (after[u]?.rules ?? 0) - (before[u]?.rules ?? 0)), 0);
  if (added) return t('update.newRules', { n: added });
  const latest = urls.map((u) => after[u]?.generated).filter(Boolean).sort().pop();
  return latest ? t('update.upToDateOn', { date: shortDate(latest) }) : t('update.upToDate');
}

// The pay-wall badge shows the site's own currency, read from its country domain. Consent-or-pay walls are a
// GDPR-era European pattern, so a .com or unknown domain falls back to the euro.
const CURRENCY = { cz: 'Kč', uk: '£', pl: 'zł', ch: 'CHF', hu: 'Ft', se: 'kr', dk: 'kr', no: 'kr', ro: 'lei', bg: 'лв', us: '$', ca: '$', au: '$' };
export const currencyFor = (host = '') => CURRENCY[host.split('.').pop()] ?? '€';

// A pay-wall site's own per-site choice (never refuse: walls are never refused or hidden, D5): 'agree' (accept it for
// me; acceptSites), 'ask' (detect it and wait for the popup; wallAskSites) or 'ignore' (leave alone; exceptions).
// The most specific entry wins, as in siteEntry; a site with no choice of its own (or only a refuse) follows the
// global walls mode.
export function wallMode(host, s = {}) {
  const own = siteEntry(host, s);
  const ask = (s.wallAskSites ?? []).filter((d) => hostMatches(host, [d])).sort((a, b) => b.length - a.length)[0];
  if (ask && (!own || ask.length >= own.domain.length)) return 'ask';
  if (own?.mode === 'accept') return 'agree';
  if (own?.mode === 'ignore') return 'ignore';
  return s.walls === 'auto' ? 'agree' : 'ask';
}
// The settings patch that gives a wall host this wall mode: only host's own entries change, like siteModePatch.
export function wallModePatch(host, mode, s = {}) {
  const lists = siteModePatch(host, { agree: 'accept', ignore: 'ignore' }[mode] ?? 'refuse', s);
  const wallAskSites = (s.wallAskSites ?? []).filter((d) => d !== host);
  if (wallMode(host, { ...s, ...lists, wallAskSites }) !== mode) wallAskSites.push(host);
  return { ...lists, wallAskSites };
}

// One status per tab state, shared by the popup, the chip and the toolbar badge (#21): the same label and the same
// tone (colour) on every surface. chip: what the chip adds after the label to say where to act; next: the same for
// the badge tooltip.
// The badge's colours. Wall and bad carry white text there, so they use the palette's darker badge shades.
export const TONE_COLOR = { ok: PALETTE.ok, wall: PALETTE.wallBadge, bad: PALETTE.badBadge, neutral: PALETTE.neutral };
export const STATUS = {
  done: { label: 'cookies refused', tone: 'ok' },
  hidden: { label: 'banner hidden', tone: 'ok' },
  fallback: { label: "refused all: your mix isn't supported here", tone: 'ok' },
  choice: { label: 'your choice applied', tone: 'ok' },
  acceptedSite: { label: 'cookies accepted', tone: 'neutral' },
  accepted: { label: 'pay wall accepted', tone: 'wall' },
  wall: { label: 'pay wall: agree to tracking or pay', tone: 'wall', chip: 'agree from the declutter button', next: 'decide from this menu' },
  accepting: { label: 'accepting the pay wall…', tone: 'wall' },
  failed: { label: 'banner not answered', tone: 'bad', chip: 'see the declutter button', next: 'answer it on the page' },
  working: { label: 'answering the banner…', tone: 'neutral' },
  paused: { label: 'banners left alone here', tone: 'neutral' },
};
// The same words in Czech (#25), field for field.
export const STATUS_CS = {
  done: { label: 'cookies odmítnuty' },
  hidden: { label: 'lišta skryta' },
  fallback: { label: 'vše odmítnuto: vaše volba tu nejde nastavit' },
  choice: { label: 'vaše volba použita' },
  acceptedSite: { label: 'cookies přijaty' },
  accepted: { label: 'placená zeď přijata' },
  wall: { label: 'placená zeď: souhlas se sledováním, nebo platba', chip: 'souhlaste přes tlačítko declutter', next: 'rozhodněte v této nabídce' },
  accepting: { label: 'přijímá se placená zeď…' },
  failed: { label: 'lišta nezodpovězena', chip: 'viz tlačítko declutter', next: 'odpovězte na ni na stránce' },
  working: { label: 'odpovídá se na lištu…' },
  paused: { label: 'lišty se tu nechávají být' },
};
// One status in the UI language; statusWords: the whole map.
export const statusOf = (key) => (LANG === 'cs' ? { ...STATUS[key], ...STATUS_CS[key] } : STATUS[key]);
export const statusWords = () => Object.fromEntries(Object.keys(STATUS).map((k) => [k, statusOf(k)]));
// The STATUS key for a tab state, or null (nothing to say): a stuck answer is a failure, a cosmetic rule only hid.
export function statusKey(state = {}, now = Date.now()) {
  const c = state.consent;
  if (c === 'failed' || (c === 'working' && now - (state.since ?? now) > STUCK_AFTER_MS)) return 'failed';
  if (c === 'done') return state.cosmetic ? 'hidden' : state.choiceFallback ? 'fallback' : 'done';
  if (c === 'acceptedSite' && state.cosmetic) return 'hidden';
  return STATUS[c] ? c : null;
}

export function badgeFor(state, now = Date.now()) {
  const key = statusKey(state, now);
  // Shorts the backup check caught say more than "answering…" or "left alone": those two give way to the leak line.
  if (key && !(state.shortsLeak > 0 && (key === 'working' || key === 'paused'))) {
    const { label, tone, next } = statusOf(key);
    const text = key === 'failed' ? '!' : key === 'wall' ? currencyFor(state.host) : '';
    // A failure names no rule: "cz-alza" means nothing to the user (#11).
    const via = key === 'failed' ? '' : key === 'choice' ? state.adapter : state.cmp;
    return { text, color: TONE_COLOR[tone], title: `declutter: ${label}${via ? ` (${via})` : ''}${next ? ` — ${next}` : ''}` };
  }
  // Shorts the backup check caught are already hidden: worth a line, not an alarm.
  if (state.shortsLeak > 0) return { text: '', color: TONE_COLOR.neutral, title: t('badge.leak', { n: state.shortsLeak }) };
  return { text: '', color: TONE_COLOR.neutral, title: 'declutter' };
}

// A banner declutter doesn't know yet: autoconsent's heuristic detection (top frame only, never on wall sites) found
// cookie-banner wording in the page text, and no rule did anything on this page. A banner a rule handled matches the
// same wording, so any consent state wins. report: autoconsent's own 'report' message (sent on every state change).
export function bannerSuspected(tab = {}, report = {}, mainFrame = false) {
  if (!mainFrame || tab.consent || !report.state?.heuristicPatterns?.length) return false;
  try {
    return new URL(report.url).hostname === tab.host;
  } catch { return false; }
}

// What a sent report carries of the page address: the site only (scheme, host, port). Paths, query strings and
// fragments can hold tokens, emails or account names. null for anything that is not a web page.
export function reportUrl(url) {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? u.origin : null;
  } catch { return null; }
}

// A report the user chose to send waits on its local report as sendPending { url, body, reason, at } until it goes
// out (offline, server down): retried on the 12 h data alarm and on every popup open, for a week. body is what the
// popup showed when the user pressed send; a retry sends exactly that. sentAt once it went out.
export const SEND_RETRY_MS = 7 * 24 * 60 * 60 * 1000;
export const sendsDue = (reports, now) => reports.filter((r) => r.sendPending && now - r.sendPending.at < SEND_RETRY_MS);
// Drops pending sends older than the retry window (given up).
export const expireSends = (reports, now) => reports.map(({ sendPending, ...r }) =>
  sendPending && now - sendPending.at < SEND_RETRY_MS ? { ...r, sendPending } : r);
// The reports after one try of `pending` for host. Sent: sentAt, and nothing pending. Failed: still pending, with
// the reason. Only the pending send that was tried is touched: one cancelled or replaced meanwhile stays that way.
export function afterSend(reports, host, pending, { ok, reason }, now) {
  return reports.map((r) => {
    if (r.host !== host) return r;
    const tried = r.sendPending?.at === pending.at;
    if (ok) {
      const { sendPending, ...rest } = r;
      return { ...(tried ? rest : r), sentAt: now };
    }
    return tried ? { ...r, sendPending: { ...r.sendPending, reason } } : r;
  });
}

// Reported sites: what the rules knew about a site when it was reported, so a later rule list that adds a rule or a
// wall entry for it can say "fixed" (computed here, from the rule list already fetched; nothing is asked of a server).
// A rule counts only if its urlPattern names the site: one without a pattern runs everywhere and says nothing.
export function siteRules(data, url) {
  return {
    names: data.consent.rules.filter((r) => r.runContext?.urlPattern && new RegExp(r.runContext.urlPattern).test(url)).map((r) => r.name),
    wall: hostMatches(new URL(url).hostname, data.consent.walls),
  };
}
// fixedAt is set once, when a rule or wall entry the report did not see first matches. Reports saved before
// rulesAtReport existed have nothing to compare against and stay reported.
export function markFixed(reports, data, now = Date.now()) {
  return reports.map((r) => {
    if (r.fixedAt || !r.rulesAtReport) return r;
    const { names, wall } = siteRules(data, r.url);
    const fixed = names.some((n) => !r.rulesAtReport.names.includes(n)) || (wall && !r.rulesAtReport.wall);
    return fixed ? { ...r, fixedAt: now } : r;
  });
}

// The chip (consent/chip.js) says what just happened to the banner: only when the outcome changes, and not again
// for the same outcome on the same site within a minute (sites reload themselves after the choice is saved).
// A page that reloads while the chip is still up (reloaded: the new page's init) gets it once more.
export const CHIP_REPEAT_MS = 60000;
export const CHIP_VISIBLE_MS = 2500;
// The chip speaks only for outcomes (not for answering in progress or left alone), in the STATUS words and tone.
const CHIP_KEYS = ['done', 'hidden', 'fallback', 'choice', 'acceptedSite', 'accepted', 'wall', 'failed'];
export function chipFor(prev, next, last = {}, now = Date.now(), reloaded = false) {
  // Only a recorded failure: an answer still running (even a slow one) gets no chip.
  const key = next.consent === 'working' ? null : statusKey(next, now);
  if (!CHIP_KEYS.includes(key)) return null;
  const s = statusOf(key);
  // The label, and where to act on a second line (sub) when there is something to do (#11).
  const chip = { text: s.label, tone: s.tone, ...(s.chip && { sub: s.chip }) };
  const same = last.host === next.host && last.consent === next.consent;
  if (reloaded && same && now - last.at < CHIP_VISIBLE_MS) return chip;
  if (prev.consent === next.consent) return null;
  if (last.host === next.host && last.consent === next.consent && now - last.at < CHIP_REPEAT_MS) return null;
  return chip;
}

// What a newly found banner resets in the tab state (setTab merges, so the previous answer would otherwise show).
// What went wrong, picked in the popup after a report is sent (#18): fixed words, never free text. The reports table
// checks the same set (supabase/migrations/20261124000000_reports_reason.sql). The words here are the ones on
// popup, settings, privacy.html and bye.html.
export const REASONS = {
  banner: 'banner still there',
  broken: 'site broke after declutter answered',
  shorts: 'shorts got through',
  other: 'something else',
};
export const REASONS_CS = {
  banner: 'lišta tam pořád je',
  broken: 'web se po odpovědi declutteru rozbil',
  shorts: 'shorty prošly',
  other: 'něco jiného',
};
// A reason in the UI language (the word sent is always the key).
export const reasonText = (k) => (LANG === 'cs' ? REASONS_CS : REASONS)[k];
export const REASON_WORD = /^(banner|broken|other|shorts:(home|search|channel|watch|other))$/;
// The reasons that fit what declutter saw on the page, most likely first.
export function reasonsFor(state = {}) {
  const answered = ['done', 'choice', 'acceptedSite', 'accepted'].includes(state.consent);
  return [...new Set([
    ...(state.shortsLeak > 0 ? ['shorts'] : []),
    ...(answered ? ['broken', 'banner'] : ['banner']),
    'other',
  ])];
}
// The word that is sent: a Shorts report names the YouTube page type, never the path.
export function reasonWord(reason, leakPath = '') {
  if (reason !== 'shorts') return reason;
  const type = leakPath === '/results' ? 'search' : leakPath === '/' || leakPath.startsWith('/feed') ? 'home'
    : /^\/(@|channel\/|c\/|user\/)/.test(leakPath) ? 'channel' : leakPath === '/watch' ? 'watch' : 'other';
  return `shorts:${type}`;
}

export const FRESH_OUTCOME = { kept: false, choiceFallback: false, clicks: 0, doneAt: 0, adapter: '', cosmetic: false };

// The popup's line under an answered banner: which banner (and adapter, for your choice), the local time it was
// answered and how many clicks it took ("Cookiebot · 14:02 · 3 clicks"). kept: the state carried over a reload the
// site did itself (background init), so the line says it happened before that. time formats a timestamp.
const localTime = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
export function outcomeDetail(state, time = localTime) {
  const parts = [state.consent === 'choice' && state.adapter ? t('detail.via', { cmp: state.cmp, adapter: state.adapter }) : state.cmp];
  if (state.doneAt) parts.push(time(state.doneAt));
  if (state.clicks > 0) parts.push(t('detail.clicks', { n: state.clicks }));
  return parts.filter(Boolean).join(' · ') + (state.kept ? t('detail.kept') : '');
}

// Global Privacy Control (opt-in): the Sec-GPC request header as one dynamic declarativeNetRequest rule. skip = sites
// the user accepts or leaves alone, and pay walls: an automatic "no" there fights the user's own "yes" (the banner
// comes back, the wall locks). Excluded both as the request's site and as the page making it (its third parties).
export const GPC_RULE_ID = 1;
const GPC_TYPES = ['main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font', 'xmlhttprequest', 'ping', 'media', 'websocket', 'other'];
export function gpcRule(skip = []) {
  return {
    id: GPC_RULE_ID,
    priority: 1,
    action: { type: 'modifyHeaders', requestHeaders: [{ header: 'Sec-GPC', operation: 'set', value: '1' }] },
    condition: { resourceTypes: GPC_TYPES, ...(skip.length && { excludedRequestDomains: skip, excludedInitiatorDomains: skip }) },
  };
}
// The same sites as match patterns, for the page-world script (consent/gpc.js).
export const gpcExcludeMatches = (skip = []) => skip.flatMap((d) => [`*://${d}/*`, `*://*.${d}/*`]);

const SHORT = /^\/shorts\/([A-Za-z0-9_-]+)/;
const CHANNEL_SHORTS = /^(\/(?:@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+))\/shorts\/?$/;

// Where a YouTube URL should go instead: a Short -> the normal player, a channel's Shorts tab -> its videos.
export function redirectTarget(url) {
  const u = new URL(url);
  let m = u.pathname.match(SHORT);
  if (m) return `${u.origin}/watch?v=${m[1]}`;
  m = u.pathname.match(CHANNEL_SHORTS);
  if (m) return `${u.origin}${m[1]}/videos`;
  return null;
}

// Shorts the stylesheet hides, counted for the popup and Settings: each Short once (seen holds video ids), so a
// shelf matched by several selectors, a card nested in a hidden shelf, or YouTube re-rendering never counts it
// again. Hidden nav entries (sidebar, tabs, chips) link to /shorts/ with no id and count nothing.
// A selector this browser can't parse counts nothing.
const SHORT_ID = /\/shorts\/([^/?#]+)/;
export function countNewlyHidden(root, selectors, seen) {
  let added = 0;
  for (const s of selectors) {
    let found = [];
    try { found = root.querySelectorAll(s); } catch { /* unparsable here: the CSS skips it too */ }
    for (const el of found) {
      for (const a of el.querySelectorAll('a[href*="/shorts/"]')) {
        const id = a.getAttribute('href')?.match(SHORT_ID)?.[1];
        if (id && !seen.has(id)) { seen.add(id); added++; }
      }
    }
  }
  return added;
}

// Popup row on YouTube: shorts hidden on this page, and shorts opened in the normal player in this tab.
export function shortsSummary({ shortsHidden = 0, shortsRedirects = 0 } = {}) {
  return [shortsHidden ? t('shorts.hiddenOnPage', { n: shortsHidden }) : t('shorts.noneOnPage'),
    ...(shortsRedirects ? [t('shorts.opened', { n: shortsRedirects })] : [])].join(' · ');
}
// Settings → youtube.
export const shortsStatsText = ({ shortsHidden = 0, shortsPages = 0 } = {}) =>
  shortsHidden ? t('shorts.stats', { n: shortsHidden, pages: shortsPages }) : t('shorts.noStats');

// Settings → about: banners answered (a banner a cosmetic rule only hid is in `refused` too) and shorts hidden first,
// clicks saved beneath. Only what declutter did, never a "trackers blocked" figure. A fresh install says what to try.
// shortsHidden is the YouTube counter (shorts.js counts each hidden short once per page; background.js bumps it).
export function aboutSummary(stats = {}, locale = undefined) {
  if (!stats.since) return { headline: t('about.empty'), clicks: '' };
  const n = (k) => stats[k] ?? 0;
  const banners = n('refused') + n('choice') + n('accepted') + n('walls');
  const since = new Date(stats.since).toLocaleDateString(locale ?? (LANG === 'cs' ? 'cs' : undefined), { month: 'short', day: 'numeric' });
  return { headline: t('about.headline', { since, banners, shorts: n('shortsHidden') }), clicks: t('about.clicks', { n: n('clicks') }) };
}

// Consent-O-Matic's categories -> how to answer: all off = refuse, all on = accept, anything else = mix.
export const CATEGORY_KEYS = ['A', 'B', 'D', 'E', 'F', 'X'];
export function choiceMode(categories = {}) {
  const on = CATEGORY_KEYS.filter((k) => categories[k]).length;
  return on === 0 ? 'refuse' : on === CATEGORY_KEYS.length ? 'accept' : 'mix';
}

// Merge a rule list over a base: rules by name, walls / selectors / disabled CMPs as unions. On a name clash the
// newer rule wins: a rule list built before this extension version must not undo a rule fixed in it, but its
// new rules still apply. Each rule is dated by the list it came from (ruleDates, kept in the result), not by the
// merged data's `generated`: several rule lists merged together take the newest one's date, and an old list's
// rule in that aggregate must still lose to a newer bundled fix.
export function mergeData(base, extra) {
  if (!base) return extra;
  if (!extra) return base;
  const union = (a = [], b = []) => [...new Set([...a, ...b])];
  const dates = (d) => new Map(d.consent.rules.map((r) => [r.name, d.ruleDates?.[r.name] ?? d.generated]));
  const baseDates = dates(base);
  const extraDates = dates(extra);
  const extraWins = (name) => extraDates.get(name) >= baseDates.get(name);
  const fromBase = base.consent.rules.filter((r) => !extraDates.has(r.name) || !extraWins(r.name));
  const fromExtra = extra.consent.rules.filter((r) => !baseDates.has(r.name) || extraWins(r.name));
  return {
    schema: 1,
    generated: extra.generated > base.generated ? extra.generated : base.generated,
    shorts: { hide: union(base.shorts.hide, extra.shorts.hide), cards: union(base.shorts.cards, extra.shorts.cards),
      posts: union(base.shorts.posts, extra.shorts.posts), playables: union(base.shorts.playables, extra.shorts.playables) },
    consent: {
      walls: union(base.consent.walls, extra.consent.walls),
      disabledCmps: union(base.consent.disabledCmps, extra.consent.disabledCmps),
      rules: [...fromBase, ...fromExtra],
    },
    ruleDates: Object.fromEntries([...fromBase.map((r) => [r.name, baseDates.get(r.name)]),
      ...fromExtra.map((r) => [r.name, extraDates.get(r.name)])]),
  };
}

// Settings: a removal or a clear can be taken back for UNDO_MS. Each restore merges what was taken into what is
// stored now, so anything changed meanwhile (the popup choosing for a site, a banner counted, a site reported) stays.
export const UNDO_MS = 10000;
// A removed site or rule list goes back where it was, unless it is back already or, for a site, on the other list
// (the popup has chosen for it since).
export function restoreItem(list = [], item, index, elsewhere = []) {
  if (list.includes(item) || elsewhere.includes(item)) return list;
  return [...list.slice(0, index), item, ...list.slice(index)];
}
// Cleared counters are added to whatever was counted since the clear, and keep their original start date.
export function restoreStats(old = {}, now = {}) {
  const out = { ...now, since: old.since ?? now.since };
  for (const [k, v] of Object.entries(old)) if (k !== 'since' && typeof v === 'number') out[k] = (now[k] ?? 0) + v;
  if (old.byCmp) {
    out.byCmp = { ...now.byCmp };
    for (const [cmp, r] of Object.entries(old.byCmp)) {
      const c = now.byCmp?.[cmp] ?? { filled: 0, clicks: 0 };
      out.byCmp[cmp] = { filled: c.filled + r.filled, clicks: c.clicks + r.clicks };
    }
  }
  if (out.since === undefined) delete out.since;
  return out;
}
// Cleared reports go back behind any made since: newest first, one per site, at most 100 (as the background keeps them).
export const restoreReports = (old = [], now = []) =>
  [...now, ...old.filter((r) => !now.some((n) => n.host === r.host))].slice(0, 100);
