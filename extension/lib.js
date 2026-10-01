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
  if (state.consent === 'done') return { text: '', color: '#1e8e3e', title: `declutter: refused ${state.cmp}` };
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
