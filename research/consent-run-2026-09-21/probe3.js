(() => {
  const res = performance.getEntriesByType('resource').map(e => e.name);
  const pats = {
    'seznam-cmp': /cmp\.seznam\.cz|h\.seznam\.cz\/js\/cmp|scmp|szn-cmp|cmp\.[a-z]+\.cz\//i,
    didomi: /didomi/i, onetrust: /onetrust|cookielaw\.org/i, cookiebot: /cookiebot/i,
    'cookie-script': /cookie-script\.com/i, orestbida: /orestbida|cookieconsent/i,
    usercentrics: /usercentrics/i, 'quantcast/inmobi': /quantcast|inmobi/i,
    sourcepoint: /sourcepoint|privacy-mgmt\.com|sp-prod\.net/i, consentmanager: /consentmanager/i,
    iubenda: /iubenda/i, cookieyes: /cookieyes/i, complianz: /complianz|cmplz/i, fastcmp: /fastcmp/i,
    'funding-choices': /fundingchoicesmessages/i, cookiefirst: /cookiefirst/i, cookiehub: /cookiehub/i,
    cookieinformation: /cookieinformation/i, trustarc: /trustarc|truste/i, termly: /termly/i,
    klaro: /klaro/i, ketch: /ketchcdn|ketch\.com/i, piwikpro: /piwik\.pro|piwikpro/i, borlabs: /borlabs/i,
    osano: /osano/i, axeptio: /axeptio/i, cookielab: /cookielab/i, ccm19: /ccm19/i,
    'cpex/cmp': /cpex|cmp\.cpex/i,
  };
  const hits = {};
  for (const [k, p] of Object.entries(pats)) {
    const m = res.filter(u => p.test(u)); if (m.length) hits[k] = m.slice(0, 2).map(u => u.slice(0, 120));
  }
  const sels = {
    'szn-cmp': 'szn-cmp-dialog-container, .szn-cmp-dialog-container', 'szn-cwl': 'szn-cwl', 'cpex-subs': '#cpexSubs_modalWrapper', termsfeed: '#termsfeed-com---nb', 'cc-v2-cm': '#cc_div #cm, #cm.box, #cm.cloud, #cm.bar', didomi: '#didomi-host, #didomi-popup, #didomi-notice',
    onetrust: '#onetrust-banner-sdk, #onetrust-consent-sdk', cookiebot: '#CybotCookiebotDialog',
    'cc-v3': '#cc-main', 'cc-v2': '#cc--main, #cc_div', usercentrics: '#usercentrics-root, #usercentrics-cmp-ui',
    'funding-choices': '.fc-consent-root', quantcast: '.qc-cmp2-container, #qc-cmp2-container',
    'cookie-script': '#cookiescript_injected', consentmanager: '#cmpbox, #cmpwrapper', sourcepoint: '[id^=sp_message_container]',
    iubenda: '#iubenda-cs-banner', cookieyes: '.cky-consent-container', complianz: '.cmplz-cookiebanner',
    cookiefirst: '.cookiefirst-root, [data-cookiefirst-widget]', fastcmp: '#fast-cmp-root, .fast-cmp-home',
  };
  const dom = {};
  for (const [k, s] of Object.entries(sels)) {
    const els = document.querySelectorAll(s);
    if (els.length) dom[k] = [...els].map(e => (e.offsetHeight > 0 || e.shadowRoot ? 'vis' : 'hid') + (e.shadowRoot ? '+shadow' : '')).join(',');
  }
  const ce = [...new Set([...document.querySelectorAll('*')].filter(e => e.tagName.includes('-') && e.shadowRoot).map(e => e.tagName.toLowerCase()))];
  const iframes = [...document.querySelectorAll('iframe')].map(f => f.src).filter(s => s && /consent|cmp|cookie|privacy|souhlas/i.test(s)).map(s => s.slice(0, 120));
  const fixed = [];
  const all = []; const walk = (r) => { for (const e of r.querySelectorAll('*')) { all.push(e); if (e.shadowRoot) walk(e.shadowRoot); } }; walk(document.body || document);
  for (const e of all) {
    const cs = getComputedStyle(e);
    if ((cs.position === 'fixed' || cs.position === 'sticky') && e.offsetHeight > 40) {
      const t = (e.innerText || '').replace(/\s+/g, ' ');
      if (/cookie|souhlas|soukromí|personaliz|consent/i.test(t)) fixed.push(`${e.tagName.toLowerCase()}#${e.id}.${String(e.className).slice(0, 60)} :: ${t.slice(0, 160)}`);
    }
    if (fixed.length > 3) break;
  }
  const globals = { Didomi: !!window.Didomi, didomiNoticeVisible: (() => { try { return window.Didomi && window.Didomi.notice && window.Didomi.notice.isVisible(); } catch (e) { return 'err'; } })(), CookieConsent_v3: !!(window.CookieConsent && window.CookieConsent.run), initCookieConsent_v2: typeof window.initCookieConsent === 'function', Cookiebot: !!window.Cookiebot, OneTrust: !!window.OneTrust, UC_UI: !!window.UC_UI, cmp_seznam: !!(window.scmp || window.__scmp) };
  return JSON.stringify({ globals, lang: navigator.language, url: location.href.slice(0, 150), title: document.title.slice(0, 60), tcfapi: typeof window.__tcfapi, hits, dom, shadowCE: ce.slice(0, 10), iframes, fixed });
})()
