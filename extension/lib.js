// Pure helpers shared by the background and content scripts; unit-tested in test/unit.test.mjs.

export const STUCK_AFTER_MS = 15000;

export const hostMatches = (host, domains) =>
  domains.some((d) => host === d || host.endsWith('.' + d));

// A remote data.json is only used if it has this shape (and is newer than the bundled one).
export function validData(d) {
  return !!d && d.schema === 1 && typeof d.generated === 'string' &&
    Array.isArray(d.shorts?.hide) && Array.isArray(d.shorts?.cards) &&
    Array.isArray(d.consent?.walls) && Array.isArray(d.consent?.rules) &&
    Array.isArray(d.consent?.disabledCmps);
}

export function badgeFor(state, now = Date.now()) {
  const stuck = state.consent === 'working' && now - (state.since ?? now) > STUCK_AFTER_MS;
  if (state.shortsLeak > 0) return { text: '!', color: '#d93025', title: `Declutter: ${state.shortsLeak} Shorts link(s) got past the selectors` };
  if (state.consent === 'failed' || stuck) return { text: '!', color: '#d93025', title: `Declutter: cookie banner (${state.cmp}) not answered` };
  if (state.consent === 'wall') return { text: 'Kč', color: '#e37400', title: 'Declutter: consent-or-pay wall — agree or pay; accept from this menu' };
  if (state.consent === 'accepted') return { text: '', color: '#777', title: `Declutter: accepted the pay wall (${state.cmp})` };
  if (state.consent === 'done') return { text: '', color: '#1e8e3e', title: `Declutter: refused ${state.cmp}` };
  return { text: '', color: '#777', title: 'Declutter' };
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
