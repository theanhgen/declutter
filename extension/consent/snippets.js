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
};
