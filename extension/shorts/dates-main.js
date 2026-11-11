// Page world on m.youtube.com. YouTube's mobile site shows related videos under the player as "channel • views",
// without the upload date, but the same response carries the date ("3 years ago") for the first of them in the
// end-screen data. This collects videoId -> date from the page's initial data and from YouTube's in-app navigation
// responses, and hands it to dates.js (content script) as a JSON string. It only reads: responses pass through
// unchanged (a clone is read, after YouTube's own handlers had their turn). Off unless dates.js marks <html> with
// data-declutter-dates="off" (the page world can't read the extension's settings).
import { collectDates } from './dates-lib.js';

const send = (data) => {
  const map = collectDates(data);
  if (Object.keys(map).length) window.dispatchEvent(new CustomEvent('declutter-dates', { detail: JSON.stringify(map) }));
};

const WATCHED = /\/youtubei\/v1\/(get_watch|next)\b/;
// Default on: the attribute is unset until dates.js has read the settings, and YouTube's first requests come earlier.
const enabled = () => document.documentElement.getAttribute('data-declutter-dates') !== 'off';
const nativeFetch = window.fetch;
window.fetch = function fetch(...args) {
  const res = nativeFetch.apply(this, args);
  try {
    const url = String(args[0]?.url ?? args[0]);
    if (enabled() && WATCHED.test(url)) {
      res.then((r) => {
        const copy = r.clone(); // now, before YouTube reads the body; parsed later, off YouTube's critical path
        setTimeout(() => copy.json().then(send).catch(() => {}), 0);
      }).catch(() => {});
    }
  } catch { /* never get in the page's way */ }
  return res;
};

// The first page's data is inline (ytInitialData); content scripts can't see page variables, so send it from here.
// dates.js may not be listening yet at document_start, so it asks for it when it is (declutter-dates-ready).
const initial = () => {
  try {
    let data = window.ytInitialData;
    if (typeof data === 'string') data = JSON.parse(data); // m.youtube.com can hold it as a JSON string at first
    if (enabled() && location.pathname === '/watch' && data) send(data);
  } catch { /* no data */ }
};
document.addEventListener('DOMContentLoaded', initial, { once: true });
window.addEventListener('declutter-dates-ready', initial);
