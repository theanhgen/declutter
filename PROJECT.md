# declutter — kickstart

> Personal browser extension for desktop **Chrome + Safari (macOS)** that (1) hides YouTube Shorts and
> (2) answers cookie-consent banners, with Czech sites as the coverage target. One product, one extension.
> Firefox is nice-to-have. Working name, rename freely. Started 2026-09-21.

## Status (2026-09-24)

Built and passing in Chrome; Safari app built, signed and registered, **waiting on the manual Safari checks**
(see *Safari checklist*). One source tree, one data folder, one command per target:

| | Result |
|---|---|
| Chrome e2e (`npm run test:e2e`) | 16/16: Shorts hidden on search/sidebar/channel/watch, click + direct load → `/watch`, module toggle, 3 banners refused, Blesk wall left alone |
| Canary (`npm run canary`, 42 sites + YouTube) | 51/52 on the first clean run; the miss was a wrong expectation (kupi, see gotchas), since fixed |
| Czech coverage | **all 35 answerable sites** refused (target was 28 of 30); the 7 walls left alone |
| Remote data (`test/remote-data.mjs`) | a changed `data.json` on a URL changes both modules with no rebuild |
| Unit (`npm test`) | 9/9: pure helpers, rule schema, wall/rule overlap, CSS gating, manifests, Safari-safe regex |
| Safari (`npm run safari`) | app signed by team 28DMV2MR8T, installed to `~/Applications`, extension registered with Safari |
| iPhone (`npm run ios`) | iOS app + extension built, signed and installed on "Maclura" (iPhone 17 Pro) via `devicectl` |
| Mobile YouTube (`npm run test:mobile`) | 7/7 on m.youtube.com: bottom-bar Shorts tab hidden, search Shorts hidden, direct + in-app `/shorts/` → `/watch` |
| International (CZ IP, 2026-09-24) | 8 more consent-or-pay walls on the wall list (lemonde, elpais, corriere, repubblica, spiegel, zeit, bild, heise) + metro.co.uk; bbc, nu.nl (DPG Media), airbnb fixed |
| Consent-O-Matic parity (2026-09-24) | 204 CoM rules: 65 match ours/autoconsent by selector; the ~69 site-specific ones were run live: 21 refused by autoconsent, 20 showed no banner, **27 gaps → 26 new rules** (LEGO's is an age gate, not a banner). CoM features: per-site choice, local report, counters, update-now added; per-category choices not replicated (D10) |

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
| D2 | Chrome + Safari macOS, **and Safari on iPhone** (added 2026-09-24 by user); Firefox later | **decided** | chat |
| D3 | Our own code, MIT. Do not fork any Shorts blocker | **decided** (licenses leave no choice) | `research/shorts.md` |
| D4 | Consent engine = DuckDuckGo **autoconsent** (MPL-2.0, npm dep, unmodified). Consent-O-Matic's CZ coverage is taken over by our CZ rule pack (bauhaus written fresh from the live page; rozhlas is already covered by autoconsent); CoM's engine is not bundled | **decided** by user 2026-09-24 | `research/consent.md` |
| D5 | Consent-or-pay walls (Seznam, Mafra, CPEx) are never refused or hidden (refusing is impossible — verified 2026-09-24, see *Walls*). On a wall domain only the `cz-wall-*` rules run, so nothing else on the page is touched | **decided** by user 2026-09-21, refined by D9 | chat |
| D10 | Per-site choice **refuse / accept / leave** (popup segmented control; settings lists). Consent-O-Matic's per-category choices are **not** replicated: autoconsent only knows accept-all/refuse-all, and categories would mean hand-writing every provider's toggles | **decided** 2026-09-24 | chat |
| D11 | "Report this site" and counters are **local only** (settings shows them; copy the report list to get rules written). Nothing is ever sent, unlike Consent-O-Matic's report button | **decided** 2026-09-24 | chat |
| D9 | Two wall modes (Settings): **Manual** (default) = detect the wall, show a **Kč** badge, accept only when the user presses "Accept this wall" in the popup; **Auto** = click "Souhlasím" on walls only. Loop guard: ≤2 automatic accepts per wall family per tab per minute, then fall back to manual | **decided** by user 2026-09-24 | chat |
| D6 | Selectors and CZ rules live in data (JSON), fetched at runtime with a bundled fallback, so a fix is a data edit, not a Safari rebuild | **built**; needs a hosting URL (open question below) | chat, autoconsent 16.41.0 source |
| D7 | Breakage detection = in-extension self-check + a daily canary on own hardware. **No auto-rewriting of selectors** | **built**; canary runs daily on Elaeis via launchd, Telegram not configured yet | chat |
| D8 | Page-world code (snippets for rules, the open-shadow patch) lives in the extension, never in `data/`. Remote data can reference a named snippet but cannot add code | **decided** 2026-09-24 | this build |

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

## Walls (D5, D9)

Tested 2026-09-24 in Chromium on Blesk: refusing everything keeps the wall (homepage, reload, articles);
"Potvrdit moje volby" stays disabled until "Vyžadované účely pro vstup bez omezení" is accepted; accepting only
that row records consent to all 11 IAB purposes and 58 of 74 vendors. So a wall is agree-or-pay, nothing between.

| Family | Sites | What shows | Accept |
|---|---|---|---|
| CPEx | blesk, e15, reflex, zive, aktualne, lupa | modal on the page | `#cpexSubs_consentButton` |
| Seznam | seznam, novinky, seznamzpravy, sreality, sport, super, firmy | bottom bar (`szn-cwl`, no buttons); articles redirect to `cmp.seznam.cz/nastaveni-souhlasu` | bar → consent page → `cw-button-agree-with-ads` (closed shadow root, opened by `open-shadow.js`) |
| Mafra | idnes, lidovky, expres | bottom bar `a.cookie-info`; articles redirect to `/nastaveni-souhlasu` | bar → consent page → `DECLUTTER_DIDOMI_AGREE` (the link is a CSP-blocked `javascript:` URL), then back to `?url=` on the same site |

In manual mode, "Accept" on a Seznam/Mafra bar sets a 30 s hand-off so the consent page it opens accepts too.
Tests: `npm run test:walls` (both modes × 3 families, 12 checks).

## Architecture (as built)

```
declutter/
  build.mjs                  # esbuild → build/{chrome,safari}/ + build/data.json; per-browser manifest; icons
  extension/
    manifest.base.json
    lib.js                   # pure helpers (redirect target, host match, badge, data validation) — unit-tested
    background.js            # settings, data (bundled + remote), autoconsent init/eval, per-tab status, badge
    shorts/shorts.js         # redirect, remote selectors, self-check (css is generated from data/shorts.json)
    shorts/dnr-rules.json    # static /shorts/<id> → /watch redirect for full page loads
    consent/content.js       # AutoConsent in every frame
    consent/snippets.js      # our named page-world snippets (DECLUTTER_*), D8
    consent/open-shadow.js   # page world, mapy/kupi/cmp.seznam.cz only: opens Seznam's closed shadow root
    options/                 # Settings page (Safari's "Settings" button): switches, wall mode, exceptions
    popup/                   # two toggles, this site's status, "leave banners alone on this site"
  data/                      # EVERYTHING that changes when a site changes (D6)
    shorts.json              # hide selectors + card containers for the self-check
    consent.json             # wall domains, disabled CMPs
    rules-cz/*.json          # 15 refuse rules (13 sites, Liferay generic, Seznam dialog) + 5 cz-wall-* accept rules
  safari/project.yml         # xcodegen: macOS + iOS container apps and extensions; run-script copies build/safari in
  scripts/ios.sh             # build + sign + install on the first paired iPhone
  scripts/safari.sh          # build + sign + install ~/Applications/Declutter.app
  scripts/canary-agent.sh    # install/remove the daily launchd job
  test/                      # unit (node --test), e2e.mjs (smoke), remote-data.mjs, lib.mjs (shared)
  canary/                    # run.mjs, sites.json (expectations), results/ + shots/ (gitignored)
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

Planned: ≈ 30 of 39. **Built (2026-09-24): all 35 non-wall sites in `canary/sites.json` pass** — autoconsent covers
the CMPs (incl. heureka/Didomi, notino/Usercentrics); `data/rules-cz/` covers the 12 in-house banners, bauhaus,
T-Mobile's iframe dialog, and Seznam's dialog on mapy.com/kupi.cz. The 7 walls in the canary are left alone.

## Keeping it working

1. **Selectors YouTube rarely changes.** Target `a[href^="/shorts/"]` and the card around it, and the `/shorts/`
   URL. YouTube's internal element names change often, so they're only a backup.
2. **Self-check inside the extension.** After hiding, count visible `/shorts/` links. If any are left, hide them with
   the generic rule and turn the toolbar icon red. For consent: a banner is still showing after N seconds and it's
   not a known wall → mark the icon.
3. **Daily canary on own hardware** (built: `canary/run.mjs`, launchd on Elaeis at 07:30; Asparagaceae later if
   Elaeis's sleep makes it unreliable). The EU consent wall, bot checks on
   datacenter IPs and the logged-out view all change what YouTube serves. The canary loads the built
   extension in Chrome for Testing (branded Chrome dropped `--load-extension` in 137):
   - YouTube: search, sidebar, click + direct load of a Short, watch page, channel tab (logged out; the
     home/subscriptions checks need a throwaway logged-in account, not set up)
   - the 42 Czech sites, each with an expectation (`done` / `clear` / `wall`)
   - Telegram message when the set of failing checks changes (token: Keychain `declutter-telegram-token`,
     chat: `DECLUTTER_TELEGRAM_CHAT_ID`). Without them it prints the alert to the log.
4. **Fixes ship as data** (D6). An edit to the remote JSON reaches both browsers with no Xcode rebuild.

A scraper that rewrites selectors on its own was **rejected**: it can tell that something broke but not
reliably what the new element is, and a wrong guess hides the wrong content without anyone noticing.

## Milestones

| M | Scope | Done when | State 2026-09-24 |
|---|---|---|---|
| M0 | Scaffold: esbuild, manifest merge, xcodegen container app, signing on team 28DMV2MR8T | A no-op extension loads in Chrome (unpacked) and in Safari (signed), and **stays enabled after quitting Safari** | Chrome ✓. Safari built, signed, registered; **enable + restart check is yours** |
| M1 | Shorts module: CSS + redirect + self-check badge | No Shorts on search/channel/sidebar/watch in both browsers; clicking a Short opens `/watch`; Czech UI works | Chrome ✓ (cs-CZ UI). Safari: checklist |
| M2 | Consent module: autoconsent + CZ pack (bauhaus, 12 in-house, 2 Seznam banners) + wall policy | ≥28 of the 30 reachable sites clear in Chrome; walls untouched; same run in Safari by hand | Chrome ✓ 35/35, walls untouched. Safari: checklist |
| M3 | Canary + remote data | Daily run on own hardware, Telegram alert on regression, one data-only fix shipped end to end | Canary daily ✓. Remote data proven against a local URL; needs a hosting URL + Telegram chat |

## Safari checklist (manual; nothing automates Safari extensions)

1. Safari → Settings → Extensions: turn **Consent-O-Matic off**, turn **Declutter on**, and in its permissions
   choose **Always Allow on Every Website**.
2. youtube.com: search "minecraft" → no Shorts shelf, no Shorts in the sidebar; paste a `/shorts/<id>` link →
   opens `/watch?v=<id>`; click a Short somewhere → `/watch`.
3. alza.cz, o2.cz, mapy.com: banner refused (toolbar popup says "Refused cookies"). o2 and mapy exercise the
   page-world parts (`world: MAIN` eval and the open-shadow script), the M2 Safari gate.
4. blesk.cz: the wall stays with a **Kč** badge; "Accept this wall" in the popup gets you in. Optionally switch
   Settings → walls to Auto and open a novinky.cz article: it should open directly after one hop.
5. **Quit Safari (⌘Q), reopen: Declutter is still enabled** — the M0 gate. Repeat after a reboot once.

If step 5 fails, the fallback is Developer ID signing + notarization (needs the paid program's Developer ID
certificate; the team already has one for App Store work).

## Open questions / unverified (gates)

- **Safari keeps a build signed with team 28DMV2MR8T across restarts.** Signing verified
  (`codesign --verify --deep --strict`), registration verified (`pluginkit`); restart survival is checklist step 5.
- **autoconsent in Safari** (`scripting.executeScript({world:'MAIN'})`) and the manifest `world: MAIN`
  content script (Safari 18+): checklist step 3. Fallback: autoconsent's `isMainWorld: true` mode.
- **Where remote data is hosted** (D6). Mechanism done: build with `DECLUTTER_DATA_URL=<url>` and publish
  `build/data.json` there; the extension refetches every 12 h. Options: raw URL of a public GitHub repo/gist, or
  an existing server over Tailscale Funnel. Not decided — it publishes the data file.
- ~~Can autoconsent take extra rules at runtime from our background script (for D6)?~~ **Answered
  2026-09-23**: yes, via the `initResp` message. See D6 above.
- The second Mac: a development-signed build may not run there. The documented routes are Developer ID +
  notarization, or TestFlight.
- Home, subscriptions and notifications selectors need a logged-in check (canary account not set up).
- Firefox: not installed; unsigned installs need Developer Edition or Nightly. Deferred.

## Gotchas

- **The Mac App Store Consent-O-Matic 1.1.3 is installed** (`/Applications/Consent-O-Matic.app`). Disable it in
  Safari, or both extensions will answer the same banners.
- Safari "Allow unsigned extensions" resets when Safari quits. Don't rely on it; sign the build.
- Safari runs content scripts only after the user grants site access in the toolbar popover. The consent
  module needs a one-time "Always Allow on Every Website".
- Branded Chrome 137+ ignores `--load-extension`. Automated runs use Playwright's Chromium (`channel: 'chromium'`).
- **Headless tests lie unless they look like a person:** without a desktop UA many CMPs show nothing
  ("HeadlessChrome"), and without `--disable-blink-features=AutomationControlled` (`navigator.webdriver`)
  orestbida banners don't show and **Seznam switches its dialog to an open shadow root** — so a rule can pass in
  the test and fail for you. `test/lib.mjs` sets both.
- **Seznam's consent dialog uses a closed shadow root** for real browsers. `consent/open-shadow.js` (page world,
  mapy/kupi only) opens that one root; walls are on the wall list and never reach it.
- **Seznam shares the choice across its sites**: refusing on mapy.com also clears kupi.cz in the same browser.
- Some sites **reload after the choice** (T-Mobile); the background keeps "done" for the same host for 60 s.
- **Alza's reject link is `href="javascript:…"`**, which Alza's CSP blocks when an extension clicks it. The rule calls
  the page's own `Alza.Web.Cookies.rejectAllCookies()` through the `DECLUTTER_ALZA_REJECT` snippet (D8).
- **Codesign fails on ~/Desktop** ("resource fork, Finder information, or similar detritus not allowed"): iCloud
  adds xattrs. `scripts/safari.sh` builds in `~/Library/Developer/Xcode/DerivedData/declutter` and the copy phase
  runs `xattr -cr`.
- **autoconsent's code-based rules** (Sourcepoint-frame, Onetrust, TrustArc-top, … `lib/cmps/*.ts`) are always
  loaded, whatever rule bundle we pass. On wall sites they're switched off via `disabledCmps: BUILTIN_CMPS`
  (unit-tested against the installed version); before that, the generic Sourcepoint rule sometimes grabbed
  Spiegel's wall frame first (intermittent, ~1 in 2).
- **Visibility traps:** KB and Seznam hide their banners with `visibility: hidden` and leave them in the page;
  autoconsent's visible check ignores `visibility`. Match a class/inline style that only exists while shown,
  or an auto-accept rule will loop (it did on Novinky before the fix and the loop guard).
- `pensieve/project.yml` is the xcodegen reference (one app + extension targets, team 28DMV2MR8T).
