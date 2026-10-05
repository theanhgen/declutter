# Improvement research via NotebookLM (2026-10-02/03)

Notebook: https://notebooklm.google.com/notebook/eb090df8-0113-47ae-98d8-63be2c2a054c (account theanh.gen),
~300 sources: this repo's docs, a "current state" note, and web research in three rounds.

| Round | Searches | New sources | Already in notebook |
|---|---|---|---|
| 1 | 3 deep (cookie tools, Shorts blockers, launch/growth) | 137 | n/a |
| 2 | 3 fast + 9 fast (deep refused: Google error 8, then the 5-hour quota ran out) | 120 | 10 (11%) |
| 3 | 7 fast (gaps left by round 2) | 50 | 20 (29%) |

Stopped after round 3: the round-3 top list repeats round 2's conclusions, new material is implementation
detail, and source overlap keeps rising. Evidence ratings below are the notebook's, checked against the code
where noted. Claims marked *unverified* rest on weak sources and need a test before acting on them.

## Ranked improvements

| # | What | Why (strongest evidence) | Effort | Notes |
|---|---|---|---|---|
| 1 | Turn on the built-in remote rule list (`DECLUTTER_DATA_URL`) in store builds | Chrome allows remote JSON that only names bundled code; AdGuard was rejected for remote scriptlet *parameters* and passed once code was bundled (policy text: strong; AdGuard case: medium) | S–M | Validate against a strict schema, drop unknown keys, keep the bundled copy as fallback, say it in reviewer notes. uBlock Origin Lite ships rules via store updates instead. |
| 2 | Fix gaps in YouTube's home grid after hiding Shorts shelves | Known YouTube behaviour: `ytd-rich-grid-row` wrappers and `[is-in-first-column]` margins stay behind (medium: several filter-list maintainers) | S | **Not built.** Checked 2026-10-03: current YouTube has no `ytd-rich-grid-row` (home and channel grids are one flex-wrap `#contents`), so the researched fix targets old markup; a hidden item only shifts the 8px first-column margin. Needs a logged-in feed with Shorts shelves to reproduce. |
| 3 | First-run page in Chrome/Firefox (what it does, pin it, how to choose per site) | Only guaranteed touchpoint after install (medium: vendor UX guides) | S | `onInstalled` only calls `start` today. |
| 4 | Safari: detect missing site access and say how to grant it | `permissions.contains({origins:['<all_urls>']})` reflects "Always Allow on Every Website"; no deep link to Settings exists (strong: Apple/MDN docs) | S | In the popup, plus the container app (already shows steps). |
| 5 | Exact per-category choices on more CMPs | consentmanager `__cmp('setPurposeConsent', …)` (strong: vendor docs); Usercentrics `UC_UI`/`__ucCmp`, TrustArc `truste.cma.callApi('setConsentLevels', …)`, Sourcepoint (medium) | M | `consent/categories.js` covers Cookiebot, Didomi, OneTrust, cookieconsent only. Usercentrics and consentmanager matter most in CZ (Rohlík, dm, O2). |
| 6 | Global Privacy Control as an opt-in setting | Easy: `Sec-GPC` via DNR `modifyHeaders` + `navigator.globalPrivacyControl` in the MAIN world at `document_start`, no new permissions (strong). Low effect in the EU today: CMPs act on it only if the publisher enables it for GDPR (strong: OneTrust/Usercentrics docs); the EU rule that would make sites honour it (Digital Omnibus, GDPR Art. 88b) is a stalled proposal, earliest application ~2028 (strong) | S | Must skip sites set to accept and wall sites (else banners return / wall loops); adds a fingerprint bit. Default off. |
| 7 | Keep the listing honest about privacy effect | Peer-reviewed: refusing does not cut tracking requests vs doing nothing (Demir et al. PoPETs 2024, 15.4 vs 15.5/page); 50–66% of sites keep tracking after "reject all" (Bouhoula USENIX 2024, Bollinger USENIX 2022); accepting raises tracking 1.6–5.5x (strong) | S | Current listing claims no tracking reduction, good. Pitch: saves clicks, answers with your choice, never "accept all" by accident. Never "stops tracking". |
| 8 | Distribution and visibility | Edge/Opera take the chrome zip; Firefox Recommended (nominate by email) and Chrome Featured (nominate via support) after first ratings; first users of similar tools came from Show HN and subreddits (medium) | S each | After the current reviews pass. |
| 9 | Optional uninstall survey (`setUninstallURL`) | Only churn signal stores don't give (medium) | S | Static page, no parameters or IDs, mentioned in the privacy policy; otherwise it contradicts "nothing leaves your browser". Lowest priority. |

## Considered and rejected

- Tracker/network blocking, cookie deletion: breaks sites, outside "two things", uBlock's job.
- ML or generic banner detector: misclicks, heavy on iPhone, against the "no auto-rewrite" rule.
- Pre-seeding opt-out cookies (Firefox's approach): stale TC strings (TCF 2.3 changed the format in 2026) break CMPs.
- Hiding comments, related videos, home feed: user demand is real, but it is scope creep and a single-purpose risk.
- Setting consent through `__tcfapi` (notebook's #4): the TCF API reads consent, it has no setter. Wrong.
- Wall "legality" labels in the popup, CI policy checker, "aligning with Art. 88b": weak value, nothing concrete to build yet.
- Changing wall handling: national regulators incl. ÚOOÚ treat publisher consent-or-pay as lawful case by case; accepting at the user's request is not a store-policy risk (strong). Keep D5/D9.
- YouTube's own Shorts controls (0-minute Shorts timer, April 2026) hide Shorts only in the mobile-app home feed, so they don't replace declutter.

## Unverified, test before relying on it

- An iOS Safari extension memory cap of 6 MB (one Reddit source).
- DuckDuckGo limiting `Sec-GPC` header changes on iOS because of back-navigation failures (one source).
- The grid CSS above on current YouTube, desktop and mobile.
- The Usercentrics and Sourcepoint API calls (vendor integration guides, not the APIs' own docs).
