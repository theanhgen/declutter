// YouTube only. shorts.css (built from data/shorts.json) does the hiding; this script:
//  - sends /shorts/<id> to /watch?v=<id>, and a channel's /shorts tab to /videos
//  - adds selectors from the remote data copy (D6)
//  - self-check: any /shorts/ link still visible gets hidden by its card and reported (red badge)
import bundled from '../../data/shorts.json';

const api = globalThis.browser ?? globalThis.chrome;
const html = document.documentElement;

const SHORT = /^\/shorts\/([A-Za-z0-9_-]+)/;
const CHANNEL_SHORTS = /^(\/(?:@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+))\/shorts\/?$/;

export function redirectTarget(url) {
  const u = new URL(url);
  let m = u.pathname.match(SHORT);
  if (m) return `${u.origin}/watch?v=${m[1]}`;
  m = u.pathname.match(CHANNEL_SHORTS);
  if (m) return `${u.origin}${m[1]}/videos`;
  return null;
}

let enabled = true;
let cards = bundled.cards;

function redirectIfShort() {
  if (!enabled) return false;
  const to = redirectTarget(location.href);
  if (to) location.replace(to);
  return !!to;
}

// Capture phase, before YouTube's own router sees the click: open the normal player instead.
function onClick(e) {
  if (!enabled || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest?.('a[href]');
  if (!a) return;
  const to = redirectTarget(a.href);
  if (!to) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  location.assign(to);
}

const visible = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';

let lastReported = -1;
function selfCheck() {
  if (!enabled) return;
  const leaked = [...document.querySelectorAll('a[href^="/shorts/"]')].filter(visible);
  for (const a of leaked) {
    const card = a.closest(cards.join(',')) ?? a;
    card.setAttribute('data-declutter-hidden', '');
    card.style.setProperty('display', 'none', 'important');
  }
  if (leaked.length !== lastReported && (leaked.length > 0 || lastReported > 0)) {
    api.runtime.sendMessage({ type: 'shortsLeak', count: leaked.length, path: location.pathname }).catch(() => {});
  }
  lastReported = leaked.length;
}

let timer;
const scheduleCheck = () => { clearTimeout(timer); timer = setTimeout(selfCheck, 700); };

function injectRemoteSelectors(selectors) {
  if (!selectors?.length) return;
  const style = document.createElement('style');
  style.id = 'declutter-shorts-remote';
  style.textContent = selectors.map((s) => `html:not([data-declutter-shorts="off"]) ${s}`).join(',\n') +
    ' { display: none !important; }';
  document.getElementById(style.id)?.remove();
  (document.head ?? html).append(style);
}

async function init() {
  const { settings, remoteData } = await api.storage.local.get(['settings', 'remoteData']);
  enabled = settings?.shorts !== false;
  if (!enabled) {
    html.setAttribute('data-declutter-shorts', 'off');
    return;
  }
  if (redirectIfShort()) return;
  if (remoteData?.schema === 1 && Array.isArray(remoteData.shorts?.hide)) {
    injectRemoteSelectors(remoteData.shorts.hide.filter((s) => !bundled.hide.includes(s)));
    cards = [...new Set([...cards, ...(remoteData.shorts.cards ?? [])])];
  }
  document.addEventListener('click', onClick, true);
  // YouTube navigates inside the page; these fire on every in-app page change.
  document.addEventListener('yt-navigate-finish', () => {
    lastReported = -1;
    api.runtime.sendMessage({ type: 'shortsNav' }).catch(() => {});
    if (!redirectIfShort()) scheduleCheck();
  });
  window.addEventListener('popstate', redirectIfShort);
  const observe = () => new MutationObserver(scheduleCheck).observe(document.body, { childList: true, subtree: true });
  if (document.body) observe(); else document.addEventListener('DOMContentLoaded', observe, { once: true });
}

api.storage.onChanged.addListener((changes, area) => {
  const c = changes.settings;
  if (area === 'local' && c && (c.oldValue?.shorts !== false) !== (c.newValue?.shorts !== false)) location.reload();
});

init();
