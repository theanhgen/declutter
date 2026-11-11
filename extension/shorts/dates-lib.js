// Pure helpers for the upload dates on m.youtube.com (dates-main.js, dates.js); unit-tested.

// videoId -> upload date text from any renderer in a YouTube response that has both (endScreenVideoRenderer,
// videoWithContextRenderer, ...). The text is in the page's language, as YouTube would show it.
export function collectDates(data) {
  const out = {};
  const seen = new Set();
  const walk = (o, depth) => {
    if (!o || typeof o !== 'object' || depth > 60 || seen.has(o)) return;
    seen.add(o);
    if (typeof o.videoId === 'string' && o.publishedTimeText) {
      const p = o.publishedTimeText;
      const text = p.simpleText ?? (Array.isArray(p.runs) ? p.runs.map((r) => r.text ?? '').join('') : '');
      if (text) out[o.videoId] = text;
    }
    for (const v of Object.values(o)) walk(v, depth + 1);
  };
  walk(data, 0);
  return out;
}

// The video id a card links to (/watch?v=<id>&...), or null.
export function videoIdOf(href) {
  try { return new URL(href, 'https://m.youtube.com').searchParams.get('v') || null; } catch { return null; }
}
