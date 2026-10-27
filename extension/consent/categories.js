// "Your choice" (Consent-O-Matic's categories) applied through a CMP's own API, in the page world.
// Runs via scripting.executeScript({ world: 'MAIN', func: applyCategories, args: [choice] }), so it must be
// self-contained (no imports, no outer variables). Returns the adapter name, or '' if no adapter fits, in which
// case the background falls back to refusing everything.
//
// cmp: the rule autoconsent matched. Only that CMP's adapter runs: a page can carry another CMP's script (a
// stray window.Didomi) while a different banner is the one showing, and answering the wrong one leaves the
// real banner up. An unknown CMP gets no adapter (so: refused).
//
// Categories (Consent-O-Matic's letters):
//   A preferences & functionality   B performance & analytics   D information storage & access
//   E content selection/delivery    F ad selection/delivery      X other purposes
export async function applyCategories(c, cmp = '') {
  const family = /cookiebot/i.test(cmp) ? 'cookiebot' : /didomi/i.test(cmp) ? 'didomi'
    : /cookieconsent|orestbida/i.test(cmp) ? 'cookieconsent' : /onetrust/i.test(cmp) ? 'onetrust'
    : /consentmanager/i.test(cmp) ? 'consentmanager' : /usercentrics/i.test(cmp) ? 'usercentrics' : '';
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // Category of a purpose/group/category name, by keyword. Necessary/essential is always on and never asked.
  // English and Czech (with and without diacritics) stems; ads before content so "personalizace reklam" is an ad.
  // "ad" only as a whole word, or it matches "load", "read", "shadow".
  const classify = (name) => {
    const n = String(name).toLowerCase();
    if (/necess|essential|strict|required|technical|technick|nezbyt|nutn/.test(n)) return 'necessary';
    if (/social|sociáln|socialn/.test(n)) return 'X';
    if (/analy|perform|statist|measure|audience|market_research|improve|měřen|mereni|výkon|vykon/.test(n)) return 'B';
    if (/(^|[^a-z])ads?([^a-z]|$)|advert|market|target|remarket|reklam|cílen|cilen/.test(n)) return 'F';
    if (/funct|funkč|funkc|prefer|comfort|convenien|pohodl|personaliz(ation)?$/.test(n)) return 'A';
    if (/content|obsah/.test(n)) return 'E';
    if (/cookies|storage|device|úložiš|ulozis|zaříz|zariz/.test(n)) return 'D';
    return 'X';
  };
  const want = (name) => { const k = classify(name); return k === 'necessary' || !!c[k]; };
  // Some CMP getters return objects keyed by id rather than arrays (Didomi does, depending on version).
  const list = (x) => (Array.isArray(x) ? x : Object.values(x ?? {}));

  // Cookiebot: preferences / statistics / marketing. Marketing is ad cookies: F only, not content (E).
  if (family === 'cookiebot' && window.Cookiebot?.submitCustomConsent) {
    window.Cookiebot.submitCustomConsent(!!c.A, !!c.B, !!c.F);
    try { window.Cookiebot.hide?.(); } catch { /* already hidden */ }
    return 'cookiebot';
  }

  // Didomi: IAB purposes by their Didomi ids; custom purposes by keyword. Vendors (mostly ad tech, consented to
  // wholesale) only when ads are allowed: content alone must not switch every vendor on.
  if (family === 'didomi' && window.Didomi?.setUserStatus && window.Didomi.getPurposes) {
    const iab = {
      cookies: 'D', select_basic_ads: 'F', create_ads_profile: 'F', select_personalized_ads: 'F', measure_ad_performance: 'F',
      create_content_profile: 'E', select_personalized_content: 'E', measure_content_performance: 'E',
      use_limited_data_to_select_content: 'E', market_research: 'B', improve_products: 'B',
      geolocation_data: 'X', device_characteristics: 'X',
    };
    const purposes = list(window.Didomi.getPurposes()).map((p) => p.id);
    const enabled = purposes.filter((id) => (iab[id] ? !!c[iab[id]] : want(id)));
    const disabled = purposes.filter((id) => !enabled.includes(id));
    const vendors = list(window.Didomi.getVendors?.()).map((v) => v.id);
    const vendorsOn = !!c.F;
    const now = new Date().toISOString();
    window.Didomi.setUserStatus({
      purposes: { consent: { enabled, disabled }, legitimate_interest: { enabled: [], disabled: purposes } },
      vendors: {
        consent: { enabled: vendorsOn ? vendors : [], disabled: vendorsOn ? [] : vendors },
        legitimate_interest: { enabled: [], disabled: vendors },
      },
      created: now, updated: now, source: { type: 'webpage', domain: location.hostname }, action: 'webpage',
    });
    try { window.Didomi.notice?.hide?.(); window.Didomi.preferences?.hide?.(); } catch { /* ok */ }
    return 'didomi';
  }

  // orestbida cookieconsent v3 (window.CookieConsent) and v2 (instance usually kept as window.cc).
  if (family === 'cookieconsent' && window.CookieConsent?.acceptCategory && window.CookieConsent.getConfig) {
    const cats = Object.keys(window.CookieConsent.getConfig('categories') ?? {});
    window.CookieConsent.acceptCategory(cats.filter(want));
    try { window.CookieConsent.hide(); window.CookieConsent.hidePreferences(); } catch { /* ok */ }
    return 'cookieconsent-v3';
  }
  const cc2 = family === 'cookieconsent' && [window.cc, window.cookieconsent].find((o) => o?.accept && o?.hide);
  if (cc2) {
    const cats = [...document.querySelectorAll('#s-bl input[type=checkbox]')].map((i) => i.value).filter(Boolean);
    cc2.accept((cats.length ? cats : ['necessary', 'analytics', 'functionality', 'targeting']).filter(want));
    try { cc2.hide(); cc2.hideSettings?.(); } catch { /* ok */ }
    return 'cookieconsent-v2';
  }

  // OneTrust: groups C0002 performance (B), C0003 functional (A), C0004 targeting (F), C0005 social (X);
  // anything else by its label. Set the toggles in the preference centre, then save.
  if (family === 'onetrust' && (window.OneTrust || document.querySelector('#onetrust-banner-sdk, #onetrust-pc-sdk'))) {
    const known = { C0002: 'B', C0003: 'A', C0004: 'F', C0005: 'X' };
    document.querySelector('#onetrust-pc-btn-handler')?.click();
    for (let i = 0; i < 20 && !document.querySelector('#onetrust-pc-sdk input[id^="ot-group-id-"]'); i++) await wait(150);
    const inputs = [...document.querySelectorAll('#onetrust-pc-sdk input[id^="ot-group-id-"]')].filter((el) => !el.disabled);
    if (!inputs.length) return '';
    for (const input of inputs) {
      const id = input.id.replace('ot-group-id-', '');
      const label = input.closest('.ot-accordion-layout, .category-item, li')?.querySelector('h3, h4, .ot-cat-header')?.textContent ?? id;
      const on = known[id] ? !!c[known[id]] : want(label);
      if (input.checked !== on) input.click();
    }
    await wait(200);
    const save = document.querySelector('#onetrust-pc-sdk .save-preference-btn-handler');
    if (!save) return '';
    save.click();
    return 'onetrust';
  }

  // consentmanager (window.__cmp; o2): purposes by name from getCMPData. setPurposeConsent [ids, 1|0, true] also
  // sets every vendor that has the purpose, and saves the choice. Wanted purposes first, refused ones second, so a
  // vendor that also has a refused purpose (ad tech that measures too) ends up off. The newer consentmanager-ncmp
  // banner (window.__npcmp) has no such API and gets no adapter.
  if (family === 'consentmanager' && typeof window.__cmp === 'function') {
    const purposes = list(window.__cmp('getCMPData')?.purposesList);
    if (!purposes.length) return '';
    const on = purposes.filter((p) => want(p.name)).map((p) => p.id);
    const off = purposes.map((p) => p.id).filter((id) => !on.includes(id));
    if (on.length) window.__cmp('setPurposeConsent', [on, 1, true]);
    if (off.length) window.__cmp('setPurposeConsent', [off, 0, true]);
    try { window.__cmp('close'); } catch { /* already hidden */ }
    return 'consentmanager';
  }

  // Usercentrics browser UI v2 (window.UC_UI; dm): consent is per service, each in a category. The category's label
  // decides, not its slug: dm files Google Analytics under slug "functional" labelled "Statistické cookies", and
  // custom categories have slugs like "customCategory-<uuid>". Accept the wanted services, reject the rest, close.
  if (family === 'usercentrics' && window.UC_UI?.acceptServices && window.UC_UI.rejectServices && window.UC_UI.getServicesBaseInfo) {
    const labels = Object.fromEntries(list(window.UC_UI.getSettingsLabels?.()?.categories).map((k) => [k.slug, k.label]));
    const services = list(window.UC_UI.getServicesBaseInfo()).filter((s) => !s.isEssential);
    if (!services.length) return '';
    const on = services.filter((s) => want(labels[s.categorySlug] ?? s.categorySlug)).map((s) => s.id);
    const off = services.map((s) => s.id).filter((id) => !on.includes(id));
    if (on.length) await window.UC_UI.acceptServices(on);
    if (off.length) await window.UC_UI.rejectServices(off);
    try { await window.UC_UI.closeCMP?.(); } catch { /* already closed */ }
    return 'usercentrics';
  }
  return '';
}
