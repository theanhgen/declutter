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
};
