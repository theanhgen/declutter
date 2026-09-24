(async () => {
  const all = []; const walk = (r) => { for (const e of r.querySelectorAll('*')) { all.push(e); if (e.shadowRoot) walk(e.shadowRoot); } }; walk(document.body || document);
  const banners = [];
  for (const e of all) {
    const cs = getComputedStyle(e);
    if (/^(HEADER|NAV|FOOTER)$/.test(e.tagName) || e.closest('header, nav, aside, #guide, tp-yt-app-drawer')) continue;
    if ((cs.position === 'fixed' || cs.position === 'sticky') && e.offsetHeight > 40 && cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0') {
      const r = e.getBoundingClientRect(); if (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) continue;
      const t = (e.innerText || '').replace(/\s+/g, ' ');
      if (/cookie|souhlas(em|u)? se? |soukromí|personaliz|consent/i.test(t) && t.length >= 40 && t.length < 5000) banners.push(`${e.tagName.toLowerCase()}#${e.id}.${String(e.className).slice(0, 40)} :: ${t.slice(0, 90)}`);
    }
    if (banners.length > 3) break;
  }
  let tcf = null;
  if (typeof window.__tcfapi === 'function') {
    tcf = await new Promise(res => { const to = setTimeout(() => res('timeout'), 3000); try { window.__tcfapi('getTCData', 2, (d, ok) => { clearTimeout(to); if (!ok || !d) return res('noData'); const pc = d.purpose && d.purpose.consents || {}; res({ status: d.eventStatus, cmpId: d.cmpId, consented: Object.keys(pc).filter(k => pc[k]).join(','), hasTC: !!d.tcString }); }); } catch (e) { clearTimeout(to); res('err ' + e.message); } });
  }
  const com = !!document.querySelector('.ConsentOMatic-Progress-Dialog, [class*=ConsentOMatic]');
  return JSON.stringify({ url: location.href.slice(0, 80), banners, tcf, comMarkup: com, cookies: document.cookie.split(';').map(c => c.trim().split('=')[0]).filter(n => /consent|cmp|cookie|didomi|euconsent|cc_|szn|OptanonAlert|CookieConsent|uc_|cookiescript/i.test(n)).join(',') });
})()
