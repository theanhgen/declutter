(() => {
  const sels = [
    'ytd-reel-shelf-renderer','grid-shelf-view-model','ytd-search grid-shelf-view-model',
    'grid-shelf-view-model:has(a[href^="/shorts/"])','ytm-shorts-lockup-view-model','ytm-shorts-lockup-view-model-v2',
    'ytd-video-renderer:has(a[href^="/shorts/"])','ytd-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"]',
    'ytd-video-renderer','yt-lockup-view-model','yt-lockup-view-model:has(a[href^="/shorts/"])',
    'a[href^="/shorts/"]','yt-chip-cloud-chip-renderer','yt-chip-cloud-chip-renderer:has(yt-formatted-string[title="Shorts"])',
    'ytd-guide-entry-renderer','ytd-guide-entry-renderer:has(> a[title="Shorts"])','ytd-guide-entry-renderer:has(a[title="Shorts"])',
    'ytd-guide-entry-renderer:has(.ytd-guide-entry-renderer[title="Shorts"])','ytd-mini-guide-entry-renderer',
    'ytd-mini-guide-entry-renderer:has(> a[aria-label="Shorts"])','ytd-mini-guide-entry-renderer:has(a[title="Shorts"])',
    'ytd-rich-section-renderer','ytd-rich-shelf-renderer[is-shorts]','ytd-rich-item-renderer','ytd-rich-item-renderer:has(a[href^="/shorts/"])',
    'ytd-rich-item-renderer[is-slim-media]','ytd-rich-grid-group','yt-tab-shape[tab-title="Shorts"]','ytd-shelf-renderer',
    '.ytShelfHeaderLayoutTitle','.yt-shelf-header-layout__title','.shelf-header-layout-wiz__title','ytd-notification-renderer'
  ];
  const out = {url: location.pathname + location.search, lang: document.documentElement.lang};
  for (const s of sels) { try { out[s] = document.querySelectorAll(s).length } catch (e) { out[s] = 'ERR ' + e.message } }
  const chips = [...document.querySelectorAll('yt-chip-cloud-chip-renderer')].map(c => c.innerText.trim()).slice(0,12);
  out.chips = chips.join('|');
  const g = document.querySelector('grid-shelf-view-model');
  out.gridShelfSample = g ? g.outerHTML.replace(/\s+/g,' ').slice(0, 900) : null;
  const gl = document.querySelector('ytd-guide-entry-renderer a[title="Shorts"], ytd-guide-entry-renderer a[href="/shorts/"]');
  out.guideShorts = gl ? gl.closest('ytd-guide-entry-renderer').outerHTML.replace(/\s+/g,' ').slice(0,500) : null;
  return JSON.stringify(out, null, 1);
})()
