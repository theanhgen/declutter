// Page-world snippets our Czech rules call with {"eval": "DECLUTTER_…"}. They live in code, not in
// data/, so a remote rule update can reference them but can never add new code.
// Registered into autoconsent's own snippet table in both the content script (so the rule step
// resolves) and the background (which runs it with scripting.executeScript, world MAIN).
export const declutterSnippets = {
  // Alza's reject link is href="javascript:…", which Alza's CSP blocks when the click comes from an extension.
  DECLUTTER_ALZA_REJECT: () => {
    const c = window.Alza?.Web?.Cookies;
    if (!c?.rejectAllCookies) return false;
    c.rejectAllCookies();
    return true;
  },
  // Mafra's wall "Souhlasím" is href="javascript:Didomi.setUserAgreeToAll();" (CSP-blocked from an extension).
  // On the consent page (/nastaveni-souhlasu?url=…) the page does not always forward afterwards; go back
  // to ?url= ourselves, but only if it is on the same site.
  DECLUTTER_DIDOMI_AGREE: () => {
    if (!window.Didomi?.setUserAgreeToAll) return false;
    window.Didomi.setUserAgreeToAll();
    if (location.pathname.includes('nastaveni-souhlasu')) {
      setTimeout(() => {
        if (!location.pathname.includes('nastaveni-souhlasu')) return;
        const site = location.hostname.split('.').slice(-2).join('.');
        let to;
        try { to = new URL(new URLSearchParams(location.search).get('url') || '/', location.origin); } catch { to = null; }
        location.href = to && (to.hostname === site || to.hostname.endsWith('.' + site)) ? to.href : '/';
      }, 1500);
    }
    return true;
  },
  // A site switched from refuse to accept in the popup: the CMP already stored "no", so it shows no banner and
  // autoconsent (now set to optIn) has nothing to answer. Open the banner of a CMP that holds an answer again, and
  // autoconsent answers it. Waits up to `ms` for the CMP to load; returns the CMP it opened, or false.
  // Didomi: the notice, not preferences.show(), whose screen has no agree button for autoconsent's optIn.
  // Not OneTrust: its only reopen (ToggleInfoDisplay) is the preference centre, which can have no accept-all button
  // and would stay open over the page. A CMP with no stored answer ends the wait: its own banner is up, and once
  // autoconsent answers it, it must not be reopened.
  DECLUTTER_REOPEN: async (ms = 10000) => {
    const end = Date.now() + ms;
    for (;;) {
      const { Cookiebot, Didomi } = window;
      if (Cookiebot?.renew && Cookiebot.hasResponse) { Cookiebot.renew(); return 'cookiebot'; }
      if (Didomi?.notice?.show && Didomi.shouldConsentBeCollected?.() === false) { Didomi.notice.show(); return 'didomi'; }
      if (Cookiebot?.renew && Cookiebot.hasResponse === false) return false;
      if (Didomi?.notice?.show && Didomi.shouldConsentBeCollected?.() === true) return false;
      if (Date.now() >= end) return false;
      await new Promise((r) => setTimeout(r, 250));
    }
  },
  // Popup: is this a CMP DECLUTTER_REOPEN can ask again? If not, the popup says the old answer stays.
  DECLUTTER_CAN_REOPEN: () => !!(window.Cookiebot?.renew || window.Didomi?.notice?.show),
};
