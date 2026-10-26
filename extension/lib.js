// Pure helpers shared by the background and content scripts; unit-tested in test/unit.test.mjs.

export const STUCK_AFTER_MS = 15000;

export const hostMatches = (host, domains) =>
  domains.some((d) => host === d || host.endsWith('.' + d));

// A remote data.json is only used if it has this shape (and is newer than the bundled one). Every rule needs a name
// and a urlPattern that compiles: the background builds a RegExp from it on every frame's init.
const compiles = (re) => { try { new RegExp(re ?? ''); return true; } catch { return false; } };
const validRule = (r) => !!r && typeof r.name === 'string' && compiles(r.runContext?.urlPattern);
export function validData(d) {
  return !!d && d.schema === 1 && typeof d.generated === 'string' &&
    Array.isArray(d.shorts?.hide) && Array.isArray(d.shorts?.cards) &&
    (d.shorts.posts === undefined || Array.isArray(d.shorts.posts)) && // lists built before posts existed have none
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
const shortDate = (t) => new Date(t).toLocaleDateString('en', { month: 'short', day: 'numeric' });
export function ruleListLine(st, now = Date.now()) {
  if (!st) return { text: '(not checked yet)', dot: '#8d8d8d' };
  const lastOkAt = st.lastOkAt ?? (st.ok ? st.at : undefined);
  const dot = !lastOkAt ? '#e5484d' : now - lastOkAt > RULES_STALE_MS ? '#f76b15' : '#30a46c';
  if (st.ok) return { text: `(${st.rules} rules, checked ${new Date(st.at).toLocaleString()})`, dot };
  return { text: `(couldn't reach it (${st.error}); ${lastOkAt ? `still using ${st.rules} rules from ${shortDate(lastOkAt)}` : 'no rules from it yet'})`, dot };
}

// What "update rules now" ended in, from the statuses before and after: the error, the new rules, or up to date.
export function updateOutcome(urls, before = {}, after = {}) {
  const errors = [...new Set(urls.filter((u) => after[u] && !after[u].ok).map((u) => after[u].error))];
  if (errors.length) return `couldn't reach it (${errors.join(' / ')})`;
  const added = urls.reduce((n, u) => n + Math.max(0, (after[u]?.rules ?? 0) - (before[u]?.rules ?? 0)), 0);
  if (added) return `${added} new rule${added === 1 ? '' : 's'}`;
  const latest = urls.map((u) => after[u]?.generated).filter(Boolean).sort().pop();
  return latest ? `up to date (${shortDate(latest)})` : 'up to date';
}

// The pay-wall badge shows the site's own currency, read from its country domain. Consent-or-pay walls are a
// GDPR-era European pattern, so a .com or unknown domain falls back to the euro.
const CURRENCY = { cz: 'Kč', uk: '£', pl: 'zł', ch: 'CHF', hu: 'Ft', se: 'kr', dk: 'kr', no: 'kr', ro: 'lei', bg: 'лв', us: '$', ca: '$', au: '$' };
export const currencyFor = (host = '') => CURRENCY[host.split('.').pop()] ?? '€';

export function badgeFor(state, now = Date.now()) {
  const stuck = state.consent === 'working' && now - (state.since ?? now) > STUCK_AFTER_MS;
  if (state.shortsLeak > 0) return { text: '!', color: '#d93025', title: `declutter: ${state.shortsLeak} Shorts link(s) got past the selectors` };
  if (state.consent === 'failed' || stuck) return { text: '!', color: '#d93025', title: `declutter: cookie banner (${state.cmp}) not answered` };
  if (state.consent === 'wall') return { text: currencyFor(state.host), color: '#e37400', title: 'declutter: consent-or-pay wall — agree or pay; accept from this menu' };
  if (state.consent === 'choice') return { text: '', color: '#1e8e3e', title: `declutter: applied your choice (${state.adapter})` };
  if (state.consent === 'accepted') return { text: '', color: '#777', title: `declutter: accepted the pay wall (${state.cmp})` };
  if (state.consent === 'done') return { text: '', color: '#1e8e3e', title: `declutter: ${state.cosmetic ? 'hid' : 'refused'} ${state.cmp}` };
  return { text: '', color: '#777', title: 'declutter' };
}

// What a sent report carries of the page address: the site only (scheme, host, port). Paths, query strings and
// fragments can hold tokens, emails or account names. null for anything that is not a web page.
export function reportUrl(url) {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? u.origin : null;
  } catch { return null; }
}

// The chip (consent/chip.js) says what just happened to the banner: only when the outcome changes, and not again
// for the same outcome on the same site within a minute (sites reload themselves after the choice is saved).
// A page that reloads while the chip is still up (reloaded: the new page's init) gets it once more.
export const CHIP_REPEAT_MS = 60000;
export const CHIP_VISIBLE_MS = 2500;
const CHIPS = {
  done: ['cookies refused', 'ok'], acceptedSite: ['cookies accepted', 'ok'], choice: ['your choice applied', 'ok'],
  accepted: ['pay wall accepted', 'ok'], wall: ['pay wall: your choice', 'wait'], failed: ['banner not answered', 'bad'],
};
export function chipFor(prev, next, last = {}, now = Date.now(), reloaded = false) {
  const chip = next.cosmetic && CHIPS[next.consent]?.[1] === 'ok' ? ['banner hidden', 'ok'] : CHIPS[next.consent];
  if (!chip) return null;
  const same = last.host === next.host && last.consent === next.consent;
  if (reloaded && same && now - last.at < CHIP_VISIBLE_MS) return { text: chip[0], tone: chip[1] };
  if (prev.consent === next.consent) return null;
  if (last.host === next.host && last.consent === next.consent && now - last.at < CHIP_REPEAT_MS) return null;
  return { text: chip[0], tone: chip[1] };
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

// Consent-O-Matic's categories -> how to answer: all off = refuse, all on = accept, anything else = mix.
export const CATEGORY_KEYS = ['A', 'B', 'D', 'E', 'F', 'X'];
export function choiceMode(categories = {}) {
  const on = CATEGORY_KEYS.filter((k) => categories[k]).length;
  return on === 0 ? 'refuse' : on === CATEGORY_KEYS.length ? 'accept' : 'mix';
}

// Merge a rule list over a base: rules by name, walls / selectors / disabled CMPs as unions. On a name clash the
// newer side wins: a rule list built before this extension version must not undo a rule fixed in it, but its
// new rules still apply.
export function mergeData(base, extra) {
  if (!base) return extra;
  if (!extra) return base;
  const union = (a = [], b = []) => [...new Set([...a, ...b])];
  const extraWins = extra.generated >= base.generated;
  const names = new Set((extraWins ? extra : base).consent.rules.map((r) => r.name));
  return {
    schema: 1,
    generated: extra.generated > base.generated ? extra.generated : base.generated,
    shorts: { hide: union(base.shorts.hide, extra.shorts.hide), cards: union(base.shorts.cards, extra.shorts.cards),
      posts: union(base.shorts.posts, extra.shorts.posts) },
    consent: {
      walls: union(base.consent.walls, extra.consent.walls),
      disabledCmps: union(base.consent.disabledCmps, extra.consent.disabledCmps),
      rules: extraWins
        ? [...base.consent.rules.filter((r) => !names.has(r.name)), ...extra.consent.rules]
        : [...base.consent.rules, ...extra.consent.rules.filter((r) => !names.has(r.name))],
    },
  };
}
