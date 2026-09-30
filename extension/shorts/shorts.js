// www.youtube.com and m.youtube.com. shorts.css (built from data/shorts.json) does the hiding; this script:
//  - sends /shorts/<id> to /watch?v=<id>, and a channel's /shorts tab to /videos
//  - adds selectors from the remote data copy (D6)
//  - self-check: any /shorts/ link still visible gets hidden by its card and reported (red badge)
import bundled from '../../data/shorts.json';
import { redirectTarget } from '../lib.js';

const api = globalThis.browser ?? globalThis.chrome;
const html = document.documentElement;

let enabled = true;
let cards = bundled.cards;

// After an extension update, tabs opened before it keep this script but lose the extension: sendMessage then
// throws at once instead of rejecting. Never let that stop a redirect.
const send = (msg) => { try { api.runtime.sendMessage(msg).catch(() => {}); } catch { /* extension gone */ } };

function redirectIfShort() {
  if (!enabled) return false;
  const to = redirectTarget(location.href);
  if (to) { location.replace(to); send({ type: 'shortsRedirect' }); }
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
  send({ type: 'shortsRedirect' });
}

const visible = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';

let lastReported = -1;
function selfCheck() {
  if (!enabled) return;
  const leaked = [...document.querySelectorAll('a[href*="/shorts/"]')].filter(visible);
  for (const a of leaked) {
    let card = a;
    try { card = a.closest(cards.join(',')) ?? a; } catch { /* a bad selector: hide the link itself */ }
    card.setAttribute('data-declutter-hidden', '');
    card.style.setProperty('display', 'none', 'important');
  }
  if (leaked.length !== lastReported && (leaked.length > 0 || lastReported > 0)) {
    send({ type: 'shortsLeak', count: leaked.length, path: location.pathname });
  }
  lastReported = leaked.length;
}

let timer;
let lastUrl = location.href;
const scheduleCheck = () => {
  // m.youtube.com has no yt-navigate-finish; notice in-app navigation from DOM changes instead.
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    if (redirectIfShort()) return;
  }
  clearTimeout(timer);
  timer = setTimeout(selfCheck, 700);
};

// A remote selector is used only if it parses and adds no rule of its own ("{", "}"); one bad entry is skipped
// instead of dropping the rest. Each is its own rule for the same reason as the bundled CSS.
const parses = (s) => { try { document.createDocumentFragment().querySelector(s); return !/[{}]/.test(s); } catch { return false; } };

function injectRemoteSelectors(selectors) {
  const ok = (selectors ?? []).filter((s) => typeof s === 'string' && parses(s));
  if (!ok.length) return;
  const style = document.createElement('style');
  style.id = 'declutter-shorts-remote';
  style.textContent = ok.map((s) => `html:not([data-declutter-shorts="off"]) ${s} { display: none !important; }`).join('\n');
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
    cards = [...new Set([...cards, ...(remoteData.shorts.cards ?? []).filter((s) => typeof s === 'string' && parses(s))])];
  }
  document.addEventListener('click', onClick, true);
  // YouTube navigates inside the page; these fire on every in-app page change.
  document.addEventListener('yt-navigate-finish', () => {
    lastReported = -1;
    send({ type: 'shortsNav' });
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
