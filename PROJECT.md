# declutter — kickstart

> Personal browser extension for desktop **Chrome + Safari (macOS)** that (1) hides YouTube Shorts and
> (2) answers cookie-consent banners, with Czech sites as the coverage target. One product, one extension.
> Firefox is nice-to-have. Working name, rename freely. Started 2026-09-21.

Research behind every claim here: `research/` (three reports + the scripts and raw results from the
2026-09-21 runs). Anything marked **unverified** has not been tested yet and is a milestone gate.

## Why

- Shorts are the distraction. Mostly desktop; the YouTube iOS app is already deleted.
- Consent-O-Matic "doesn't really work on .cz pages". Measured: it cleared 13 of 39 Czech sites.
- Existing Shorts blockers either can't be reused (licenses) or don't cover Safari well. Owning it
  also avoids giving a third-party extension read access to all YouTube and all-site browsing.

## Decisions

| # | Decision | Status | Source |
|---|---|---|---|
| D1 | One combined extension (Shorts + consent), not two | **decided** by user 2026-09-21 | chat |
| D2 | Desktop only: Chrome + Safari macOS; Firefox later | **decided** | chat |
| D3 | Our own code, MIT. Do not fork any Shorts blocker | **decided** (licenses leave no choice) | `research/shorts.md` |
| D4 | Consent engine = DuckDuckGo **autoconsent** (MPL-2.0, npm dep, unmodified). Consent-O-Matic's CZ rules (bauhaus.cz, rozhlas.cz, i4wifi) get **ported into our CZ rule pack**; CoM's engine is not bundled | **proposed**. User asked "can we use both?", see below | `research/consent.md` |
| D5 | Consent-or-pay walls (Seznam, Mafra, CPEx): **leave the wall to the user**. No auto-accept, no hiding | **decided** by user 2026-09-21 | chat |
| D6 | Selectors and CZ rules live in data (JSON), fetched at runtime with a bundled fallback, so a fix is a data edit, not a Safari rebuild | **proposed**; the autoconsent half is now confirmed possible, see below | chat, autoconsent 16.41.0 source |
| D7 | Breakage detection = in-extension self-check + a daily canary on own hardware. **No auto-rewriting of selectors** | **proposed** | chat |

### D4: "can we use both?"

As **rule sources**, yes. As **two engines in one extension**, no:
- Both engines would act on the same banner at once. CoM's `unHideAll()` also un-hides after every run, so it can
  reveal what autoconsent hid.
- CoM brings its own webpack build and a mostly stalled upstream: master last changed 2025-11-07, 36 open PRs, and
  only 5 PRs merged in 12 months.
- In the 39-site run, CoM cleared exactly **one** site autoconsent missed (bauhaus.cz). A 10-minute ported rule
  covers that.
- autoconsent can't load CoM rules any more. v16.0.0 (2026-06-23) dropped that ("Drop support for
  consent-o-matic rules", PR #1393, confirmed in its CHANGELOG), so porting is by hand. It's only ~3 rules.

### D6: how rules reach autoconsent (verified 2026-09-23, source read, not run)

The rule bundle is **not** baked into the library. The content script constructs `AutoConsent`, sends
`{type:'init'}` to the background and waits; the background answers `{type:'initResp', rules, config}` and
that is what `initialize()` parses (`lib/web.ts:53-95`, `:619-627`; `lib/messages.ts:96-99` in
`@duckduckgo/autoconsent` 16.41.0). So **our background script owns the rule bundle per tab**: bundled pack
+ remotely fetched CZ rules, merged in memory, no fork and no rebuild. The reference MV3 background also
filters by domain before sending (`filterCompactRules(storageGet('rules'), {url, mainFrame})`) and ships
`rules.json`, `compact-rules.json` and a `rule-index.json` — mirror that shape so the remote payload stays small.

## Architecture (target)

```
declutter/
  extension/                 # one MV3 source tree, bundled by esbuild (autoconsent is an npm/TS package)
    manifest.base.json       # + per-browser overrides merged at build (chrome / safari / firefox)
    background.js            # autoconsent wiring, per-CMP policy (D5), remote-data fetch (D6), badge
    shorts/
      shorts.css             # :has() rules, injected at document_start, youtube.com only
      shorts.js              # /shorts/<id> -> /watch?v=<id> on yt-navigate-finish + capture-phase click; self-check
      dnr-rules.json         # static redirect for full page loads (Chrome/Firefox; Safari unreliable)
    consent/
      rules-cz/*.json        # our Czech rule pack (autoconsent JSON rule format)
  data/                      # remote-served selectors + CZ rules (D6), e.g. via raw GitHub URL
  safari/project.yml         # xcodegen: container macOS app + Safari web-extension target, team 28DMV2MR8T
  canary/                    # Playwright harness (seeded from research/consent-run-2026-09-21/harness.mjs)
  build/{chrome,safari,firefox}/
```

Separate content scripts per module: the Shorts script matches `*://www.youtube.com/*` only, so a bug in
one module can't break the other. Each module gets its own on/off toggle.

Why esbuild and not WXT/Plasmo: neither generates the Safari wrapper app (the hard part). WXT is pre-1.0
and defaults Safari to MV2, and Plasmo's last release was 2025-05. autoconsent forces *some* bundling, so
use the smallest tool that does it.

## Shorts module: what we know

Selectors checked on the live site 2026-09-21 (logged-out Chromium), full list with sources in `research/shorts.md`:

| Surface | Selector | Live? |
|---|---|---|
| Search shelf | `ytd-search grid-shelf-view-model`, `grid-shelf-view-model:has(a[href^="/shorts/"])` | ✓ |
| Channel Shorts tab | `yt-tab-shape[tab-title="Shorts"]` | ✓ |
| Sidebar entry | `ytd-guide-entry-renderer:has(> a[title="Shorts"])` (no href; **title is localized**) | ✓ |
| Mini sidebar | `ytd-mini-guide-entry-renderer:has(> a[aria-label="Shorts"])` | ✓ |
| Home shelf | `ytd-rich-section-renderer:has(> #content > ytd-rich-shelf-renderer[is-shorts])`, `ytd-rich-section-renderer:has(a[href^="/shorts/"])` | needs login |
| Subscriptions | `ytd-rich-item-renderer:has(a[href^="/shorts/"])`, `ytd-reel-shelf-renderer` | needs login |
| Notifications | `ytd-notification-renderer:has(> a[href^="/shorts/"])` | needs login |
| Related column | `#related yt-lockup-view-model:has(a[href^="/shorts/"])` (a guess; `ytd-compact-video-renderer` is gone) | untested |

Facts that shape the code:
- Clicking a Short inside YouTube is **navigation within the page, not a new page load**
  (`yt-navigate-start` → `yt-page-data-updated` → `yt-navigate-finish`). A redirect rule (DNR) only
  catches direct loads and pasted links, so the content script does the real work.
- `/watch?v=<shortId>` plays in the normal player (verified live).
- Safari's redirect patterns accept less than Chrome's: no `|`, `{n}`, `\d`, `\w` or lookarounds, and ASCII only.
  Chrome replaces only the first match; WebKit replaces the whole URL. A regex that matches the whole URL behaves
  the same in both:
  ```json
  {"id":1,"priority":1,
   "action":{"type":"redirect","redirect":{"regexSubstitution":"https://www.youtube.com/watch?v=\\1"}},
   "condition":{"regexFilter":"^https://www\\.youtube\\.com/shorts/([A-Za-z0-9_-]+).*","resourceTypes":["main_frame"]}}
  ```
  Safari DNR redirects are reported unreliable (Apple forum 734207). Rely on the content script there.
- Safari has no `webNavigation.onHistoryStateUpdated`. Another reason to use `yt-navigate-finish`.
- A UI in Czech needs the Czech "Shorts" label for the text-based checks (sidebar, filter chip).

Reusable code, license-clean for MIT:
- `anaremore/eat-my-shorts` (MIT): redirect design, static DNR rule plus a `tabs.onUpdated` fallback.
- `gijsdev/ublock-hide-yt-shorts` and `i5heu/ublock-hide-yt-shorts` (MIT): selector ideas. They are also the
  **watch source** for selector changes.
- Ideas only, **no code**: Control Panel for YouTube (no license at all), No-YouTube-Shorts-Safari (PolyForm
  Noncommercial + trademark ban), and all GPL projects (BlockTube, Vulpelo, zevnda, ShortBlock).

## Consent module: what we know

Measured 2026-09-21 on 42 Czech sites (39 conclusive), headless Chromium, no extension vs CoM vs autoconsent.
Full table in `research/consent.md`, raw results in `research/consent-run-2026-09-21/`.

| Group | Sites | CoM | autoconsent | Our plan |
|---|---|---|---|---|
| Consent-or-pay walls | Seznam family (seznam, novinky, seznamzpravy, sreality, sport, super, firmy), Mafra (idnes, lidovky, expres), CPEx (blesk, e15, reflex, zive, aktualne, lupa) | wall stays | wall stays | **Leave alone (D5).** Refusing the Didomi underneath is fine; don't click "Souhlasím", don't hide the wall |
| Seznam's own banner (shadow DOM) | mapy.com, kupi.cz | no | no | CZ rule (it isn't a pay wall; verify there's a free refuse) |
| Standard CMPs | Didomi, Funding Choices, Cookie-Script, OneTrust, Cookiebot, orestbida v2 | ✓ | ✓ | autoconsent as-is |
| CoM gaps | ceskatelevize (orestbida v3), rohlik + dm (Usercentrics in shadow DOM), o2 (consentmanager in shadow DOM), bazos (TermsFeed) | ✗ | ✓ | autoconsent as-is |
| bauhaus.cz | in-house | ✓ | ✗ | port the CoM rule |
| In-house banners | alza, czc, kosik, lekarna, cd, regiojet, ceskaposta, kb, vodafone, mironet, pilulka, bonprix | ✗ | ✗ | **write CZ rules**, the main work in M2 |
| Untested | heureka, notino (Cloudflare check), t-mobile (dialog in an iframe) | — | — | test manually |

Result at the end of M2: 17 (autoconsent) + 1 (bauhaus) + up to 12 in-house + 2 Seznam banners ≈ **30 of 39**. The other
9 are the walls we're choosing to leave alone.

## Keeping it working

1. **Selectors YouTube rarely changes.** Target `a[href^="/shorts/"]` and the card around it, and the `/shorts/`
   URL. YouTube's internal element names change often, so they're only a backup.
2. **Self-check inside the extension.** After hiding, count visible `/shorts/` links. If any are left, hide them with
   the generic rule and turn the toolbar icon red. For consent: a banner is still showing after N seconds and it's
   not a known wall → mark the icon.
3. **Daily canary on own hardware** (Asparagaceae or the Pi, not the cloud). The EU consent wall, bot checks on
   datacenter IPs and the logged-out view all change what YouTube serves. The canary loads the built
   extension in Chrome for Testing (branded Chrome dropped `--load-extension` in 137):
   - YouTube: search, channel, watch page, and home/subscriptions using a throwaway logged-in account
   - the 42 Czech sites
   - alerts to Telegram when a result changes. `research/consent-run-2026-09-21/harness.mjs` is the seed.
4. **Fixes ship as data** (D6). An edit to the remote JSON reaches both browsers with no Xcode rebuild.

A scraper that rewrites selectors on its own was **rejected**: it can tell that something broke but not
reliably what the new element is, and a wrong guess hides the wrong content without anyone noticing.

## Milestones

| M | Scope | Done when |
|---|---|---|
| M0 | Scaffold: esbuild, manifest merge, xcodegen container app, signing on team 28DMV2MR8T | A no-op extension loads in Chrome (unpacked) and in Safari (signed), and **stays enabled after quitting Safari** |
| M1 | Shorts module: CSS + redirect + self-check badge | No Shorts on search/channel/sidebar/watch in both browsers; clicking a Short opens `/watch`; Czech UI works |
| M2 | Consent module: autoconsent + CZ pack (bauhaus, 12 in-house, 2 Seznam banners) + wall policy | ≥28 of the 30 reachable sites clear in Chrome; walls untouched; same run in Safari by hand |
| M3 | Canary + remote data | Daily run on own hardware, Telegram alert on regression, one data-only fix shipped end to end |

## Open questions / unverified (gates)

- **Safari keeps a build signed with team 28DMV2MR8T across restarts.** Apple docs imply it; not tested (M0 gate).
- **autoconsent in Safari:** it runs some steps with `chrome.scripting.executeScript({world:'MAIN'})`
  (`addon/background.ts:40-45`). Not tested in Safari. Fallback: its `isMainWorld: true` mode (M2 gate).
- ~~Can autoconsent take extra rules at runtime from our background script (for D6)?~~ **Answered
  2026-09-23**: yes, via the `initResp` message. See D6 above.
- The second Mac: a development-signed build may not run there. The documented routes are Developer ID +
  notarization, or TestFlight.
- Home, subscriptions and notifications selectors need a logged-in check.
- Firefox: not installed; unsigned installs need Developer Edition or Nightly. Deferred.

## Gotchas for day one

- **The Mac App Store Consent-O-Matic 1.1.3 is installed** (`/Applications/Consent-O-Matic.app`). Disable it in
  Safari while testing, or both extensions will answer the same banners.
- Safari "Allow unsigned extensions" resets when Safari quits. Don't rely on it; sign the build.
- Safari runs content scripts only after the user grants site access in the toolbar popover. The consent
  module needs a one-time "Always Allow on Every Website".
- Branded Chrome 137+ ignores `--load-extension`. Automated runs use Chrome for Testing / Playwright's
  Chromium.
- `pensieve/project.yml` is the xcodegen reference (one app + extension targets, team 28DMV2MR8T).
