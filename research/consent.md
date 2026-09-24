# Cookie consent on Czech sites: engines, coverage, walls (2026-09-21)

Method:
- Consent-O-Matic (CoM) and DuckDuckGo autoconsent were built from source.
- Each ran against 42 Czech sites alongside a no-extension baseline.
- Browser: headless Chromium 148, desktop Chrome UA, `cs-CZ` locale, one run per site, from this Mac's network.

Raw data in `consent-run-2026-09-21/`:
- `H_none.jsonl`, `H_com.jsonl`, `H_ac.jsonl`: per-site outcome per configuration
- `dbg2_*.log`: which rule fired, from the engines' debug logs
- `probe_*.jsonl`: which CMP each site loads
- `harness.mjs` + `outcome.js`: the runner (seed for the canary)
- `hidetest.mjs`: the CSS-hide test on pay walls
- `screenshots/scmp-*.png`: Seznam's wall and its refusal

`harness.mjs` now takes its paths from the environment (the 2026-09-21 scratchpad builds are gone):
`PLAYWRIGHT_MODULE`, `COM_BUILD`, `AC_BUILD`.

## Update 2026-09-23

- autoconsent is at **16.41.0** (2026-09-22); the only change since the run is a Sourcepoint hiding rule (#1546).
  Consent-O-Matic, both uBO Shorts lists and eat-my-shorts have had no commits since 2026-09-21, so the tables
  below still hold.
- **Rules are supplied at runtime by the background script** (source read of 16.41.0, not run): content script
  sends `init`, background answers `{type:'initResp', rules, config}`, `initialize()` parses it
  (`lib/web.ts:53-95`, `:619-627`, `lib/messages.ts:96-99`). The reference addon filters per domain first
  (`filterCompactRules`) and ships `rules.json` + `compact-rules.json` + `rule-index.json`. This closes the
  D6 extension-point question: no fork needed.

## Why CoM does badly on .cz

1. **Consent-or-pay walls** on the biggest publishers:
   - **Seznam** (seznam, novinky, seznamzpravy, sreality, sport, super, firmy): a shadow-DOM teaser leads to
     `cmp.seznam.cz/nastaveni-souhlasu`. The choices are Agree, untargeted ads for 49 Kč/month, or ad-free from 125 Kč.
     Saving with every purpose off is refused: "The choice is required to continue without payment."
   - **Mafra** (idnes, lidovky, expres): `/nastaveni-souhlasu`, Premium 199 Kč.
   - **CPEx** (blesk, e15, reflex, zive, aktualne, lupa): `#cpexSubs_modalWrapper` ("Souhlasím" or subscribe for 99 Kč).
     Didomi underneath says ad purposes can't be refused.
   - Both engines refused everything in Didomi on Blesk, Aktuálně and Lupa (0 consented purposes); the wall stayed.
   - CSS-hiding works on homepages only. Opening an article redirects to the consent page (Novinky, iDNES), and Blesk
     shows the wall again.
2. **Missing or outdated generic CoM rules:**
   - orestbida cookieconsent **v3** only has a rozhlas-scoped rule, so ceskatelevize.cz shows "No CMP detected".
   - **Usercentrics** rule targets the old `.uc-banner-wrapper`; current versions render in a shadow root (rohlik, dm fail).
   - **consentmanager** rule queries `#cmpbox` from the document, but on o2.cz it's inside `#cmpwrapper`'s shadow root.
   - No **TermsFeed** rule (bazos). PR #466 has been open since 2024-07.
3. **CoM engine limits** (`Extension/`):
   - Hard 5 s stop (`ConsentEngine.js:140-162`). Issue #123 reports it on seznam.cz; the maintainer says late banners can't be handled.
   - Shadow DOM is entered only when a rule names the host as `parent` (`Tools.js:40-48`).
   - `unHideAll()` un-hides after a run, so a hide-only rule isn't possible.
   - No per-site accept policy.
4. **In-house banners** on 12 sampled sites (alza, czc, kosik, lekarna, cd, regiojet, ceskaposta, kb, vodafone,
   mironet, pilulka, bonprix): neither tool has rules. autoconsent's generated rules are crawled by country
   (DE 119, NL 81, CH 79, GB 74, FR 72, …) with none for CZ. Its heuristics contain one Czech reject phrase and one accept phrase.

## Per-site results (CoM / autoconsent)

| Site | Banner | CoM | autoconsent |
|---|---|---|---|
| seznam, novinky, sreality (+ seznamzpravy, super, firmy, sport from detection) | Seznam wall (`szn-cwl`, shadow DOM) | not handled | "no CMP found" |
| mapy.com, kupi.cz | Seznam's own banner, lite and full versions (shadow DOM) | no | no |
| idnes, lidovky, expres | Mafra pay wall, with Didomi + CPEx underneath | wall stays | wall stays |
| blesk, e15, reflex, zive, aktualne, lupa | CPEx pay wall over Didomi | Didomi refused, wall stays | same |
| denik, csfd, tn.nova, idos | Didomi | ✓ | ✓ |
| forum24 | Google Funding Choices | ✓ (`bbc_fc.json`) | ✓ |
| irozhlas | orestbida v3 | ✓ (`rozhlas.cz.json`) | ✓ |
| ceskatelevize (+ct24) | orestbida v3 | **✗** | ✓ |
| jobs, datart, info.cz | orestbida v2 | ✓ (`gls.json` acts as a generic v2 rule) | ✓ |
| rohlik, dm | Usercentrics (shadow DOM) | **✗** | ✓ |
| o2 | consentmanager (shadow DOM) | **✗** | ✓ |
| bazos | TermsFeed | **✗** | ✓ |
| tescoma / csob, ikea / bezrealitky | Cookie-Script / OneTrust / Cookiebot | ✓ | ✓ |
| bauhaus | in-house | ✓ (`bauhaus.cz.json`) | **✗** |
| alza, czc, kosik, lekarna, cd, regiojet, ceskaposta, kb, vodafone, mironet, pilulka, bonprix | in-house | ✗ | ✗ |

Totals over the 39 conclusive sites: CoM 13, autoconsent 17, neither 21 (9 pay walls + 12 in-house).
Untested: heureka and notino (Cloudflare check), t-mobile (dialog in an iframe). mall.cz now redirects to allegro.cz.

## Candidate bases

| | Consent-O-Matic | autoconsent | I Still Don't Care About Cookies |
|---|---|---|---|
| License | MIT | MPL-2.0 (per-file copyleft; fine as an unmodified npm dependency of MIT code) | GPL-3.0 |
| Activity | master 2025-11-07; v1.1.5 2025-06-17; Chrome Web Store + Mac App Store still 1.1.3 (2024) | commit 2026-09-21; v16.40.0 2026-09-16; 413 PRs merged in 12 months | 1 commit since March (2026-06-21); v1.1.9 Dec 2025 |
| Backlog | 36 open PRs (oldest 2023-12), 125 issues; 5 PRs merged in 12 months | 18 open PRs | 14,822 open issues, 292 about .cz |
| Rules | 204 files, only 5 tied to a URL; CZ: bauhaus, rozhlas, i4wifi | 380 hand-written + 567 generated (843 deduped) + 11 in code; no CZ, Seznam or CPEx | 254 .cz domains; hides and blocks instead of answering |
| Can be embedded | fork only | npm package + reference MV3 addon; background script can decide opt-in or opt-out per CMP | fork |
| Safari | on the Mac App Store; `xcode/` included | tested against WebKit (runs in DuckDuckGo's apps); Safari extension build not verified | not on the App Store |

autoconsent v16.0.0 (2026-06-23) **dropped CoM rule support** (#1393) and EasyList/filter-list support (#1399).
Confirmed in its CHANGELOG.

Filter lists barely help:
- **EasyList Cookie:** 288 .cz lines, ships in uBO Lite (off by default); its Seznam selector is outdated, and it has nothing for the CPEx or Seznam walls.
- **EasyList Czech and Slovak** (tomasko126): an ad list, only 2 cookie lines.

## Options considered

- **(A) Fork CoM.** You own its engine limits against a mostly stalled upstream, and start 4 sites behind autoconsent.
- **(B) Stock CoM + a hosted CZ rule-list URL** added in its options. No code, and Safari works via the App Store build.
  It can fix ČT, Usercentrics, consentmanager, TermsFeed and the in-house banners, but not the walls, the 5 s stop or
  per-site policy. It also stays a separate extension, which conflicts with D1.
- **(C) Our own extension + autoconsent + a CZ rule pack.** Chosen (D4). Costs:
  - Xcode packaging and signing.
  - autoconsent runs some steps via `chrome.scripting.executeScript({world:'MAIN'})` (`addon/background.ts:40-45`),
    **not verified in Safari**. Fallback: `isMainWorld: true` mode.

Not verified:
- anything running in Safari
- IDCAC (not run)
- legitimate-interest settings (only consented purposes checked)
- whether Seznam teasers stay hidden across many pages
- whether results repeat across runs
