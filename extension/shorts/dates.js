// m.youtube.com: adds the upload date to related videos under the player, which YouTube shows as "channel • views"
// only. The dates come from dates-main.js (page world); YouTube sends them for the first related videos (about 12
// per page), not for the ones loaded on scrolling, so those stay as they are. Setting: "show dates" (dates).
import { videoIdOf } from './dates-lib.js';

const api = globalThis.browser ?? globalThis.chrome;
const MARK = 'data-declutter-date';
const dates = new Map();
let on = false; // until the settings are read

// Only the watch page: elsewhere (home, search, subscriptions) YouTube shows the date itself.
const cards = () => (location.pathname === '/watch' ? document.querySelectorAll('ytm-video-with-context-renderer') : []);

function annotate() {
  if (location.pathname !== '/watch') document.querySelectorAll(`[${MARK}]`).forEach((e) => e.remove());
  for (const card of cards()) {
    const byline = card.querySelector('ytm-badge-and-byline-renderer');
    if (!byline) continue;
    const id = videoIdOf(card.querySelector('a[href*="/watch?"]')?.getAttribute('href'));
    const date = on && id ? dates.get(id) : undefined;
    const ours = byline.querySelectorAll(`[${MARK}]`);
    // YouTube reuses cards for other videos: drop a date that belongs to the previous one.
    if (ours.length && (!date || ours[ours.length - 1].getAttribute(MARK) !== id)) ours.forEach((e) => e.remove());
    else if (ours.length) continue;
    if (!date) continue;
    const items = byline.querySelectorAll('.ytmBadgeAndBylineRendererItemByline');
    if ([...items].some((s) => s.textContent.trim() === date)) continue; // YouTube shows it already
    // Fresh elements with YouTube's classes (not clones, which would carry the view count's attributes).
    const sep = Object.assign(document.createElement('span'), { className: 'ytmBadgeAndBylineRendererSeparator', textContent: '•' });
    if (!byline.querySelector('.ytmBadgeAndBylineRendererSeparator')) sep.textContent = ' • ';
    const item = Object.assign(document.createElement('span'), { className: 'ytmBadgeAndBylineRendererItemByline', dir: 'auto' });
    item.append(Object.assign(document.createElement('span'), { className: 'ytAttributedStringHost', textContent: date }));
    sep.setAttribute('aria-hidden', 'true');
    sep.setAttribute(MARK, id);
    item.setAttribute(MARK, id);
    byline.append(sep, item);
  }
}

let timer;
const schedule = () => { clearTimeout(timer); timer = setTimeout(annotate, 150); };

window.addEventListener('declutter-dates', (e) => {
  try {
    for (const [id, text] of Object.entries(JSON.parse(e.detail))) if (typeof text === 'string') dates.set(id, text);
  } catch { return; }
  schedule();
});

const setOn = (value) => {
  const was = on;
  on = value;
  document.documentElement.setAttribute('data-declutter-dates', on ? 'on' : 'off'); // read by dates-main.js
  // Switched on with the page open: the page world skipped this page's data while off, so ask for it again.
  if (on && !was) window.dispatchEvent(new Event('declutter-dates-ready'));
  annotate();
};

async function init() {
  const { settings } = await api.storage.local.get('settings');
  // href too: YouTube reuses a card for another video by changing its link.
  const observe = () => new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
  if (document.body) observe(); else document.addEventListener('DOMContentLoaded', observe, { once: true });
  setOn(settings?.dates !== false); // also asks the page world for this page's data
}

api.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.settings) return;
  setOn(changes.settings.newValue?.dates !== false);
});

init();
