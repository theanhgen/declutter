# Open-source Shorts blockers: landscape and current selectors (2026-09-21)

Method: repos cloned and read; stars, issues and dates from `gh api` on 2026-09-21; selectors
checked in a live headless Chromium (logged out) on search, channel, watch and `/shorts/` pages.
The home feed, subscriptions and notifications need a login and were **not** checked live.
Probe script: `shorts-probe/probe.js` (paste into DevTools on a YouTube page; prints how many elements each selector matches).

## Repos

| Repo | License | Stars / issues | Last commit | Browsers, Safari packaging | How it blocks |
|---|---|---|---|---|---|
| [insin/control-panel-for-youtube](https://github.com/insin/control-panel-for-youtube) | **None** (no LICENSE, `license: null`; NOTICE covers 2 MIT snippets). All rights reserved | 375 / 154 | 2026-09-19 | Chrome, Edge, Firefox, Safari macOS + iOS (App Store). Hand-kept Xcode project whose file refs point at the root JS | One `display:none` rule from a selector list; Shorts labels localized for ~80 languages. Rewrites the link's internal `webCommandMetadata.url` to `/watch?v=` on click; `location.replace` when you land on `/shorts/`. Watches `<title>` to detect navigation. `page.js` is 6,283 lines |
| [gijsdev/ublock-hide-yt-shorts](https://github.com/gijsdev/ublock-hide-yt-shorts) | MIT | 2,489 / 8 | 2026-04-29 | uBO list | uBO procedural filters (`:upward`, `:has-text`, `:matches-path`). No redirect. Maintainer silent ~6 months (#76); list broke Apr 2026 (#77) |
| [i5heu/ublock-hide-yt-shorts](https://github.com/i5heu/ublock-hide-yt-shorts) (fork) | MIT | 867 / 0 | 2026-06-09 | uBO list | Mostly `:has(a[href^="/shorts/"])` + `:has-text`; adds notifications. Has diverged from gijsdev |
| [Guillaume351/No-YouTube-Shorts-Safari](https://github.com/Guillaume351/No-YouTube-Shorts-Safari) | **PolyForm-Noncommercial-1.0.0** since 2025-12-18 + TRADEMARKS.md ban on republishing | 93 / 0 | 2026-07-10 | Safari only (macOS, iOS, visionOS), standard converter layout | CSS at document_start + JS sweeps; no redirect. Navigation: `yt-navigate-finish`, `yt-page-data-updated`, `popstate`, debounced MutationObserver, `pushState` wrapper |
| [amitbl/blocktube](https://github.com/amitbl/blocktube) | GPL-3.0 | 1,403 / 496 | 2026-02-07 | Chrome, Firefox | Filters YouTube's JSON before render (hooks fetch/XHR on `/youtubei/v1/*` and `ytInitialData`); drops `shortsLockupViewModel`, `reelItemRenderer`, `gridShelfViewModel`. Redirects `/shorts/` to the **home page** |
| [lawrencehook/remove-youtube-suggestions](https://github.com/lawrencehook/remove-youtube-suggestions) | MPL-2.0 | 580 / 52 | 2026-09-06 | Chrome MV3, Firefox MV2 | JS tags `is_short`, CSS hides. `url.replace('shorts','watch')`; `/watch/<id>` resolves live. Includes Mixpanel + premium-license code |
| [Vulpelo/hide-youtube-shorts](https://github.com/Vulpelo/hide-youtube-shorts) | GPL-3.0 | 305 / 9 | 2026-06-04 | Chrome, Firefox | MutationObservers; background `tabs.onUpdated` → `tabs.update` to `/watch?v=` |
| [anaremore/eat-my-shorts](https://github.com/anaremore/eat-my-shorts) | **MIT** | 2 / 0 | 2026-09-13 | Chrome, www only | **Best redirect design:** static DNR `regexSubstitution` for full page loads + `tabs.onUpdated` fallback for in-app navigation; MutationObserver + `yt-navigate-finish` + `popstate`. 389 lines with tests |
| [tn3w/YouTube-Shorts-Blocker](https://github.com/tn3w/YouTube-Shorts-Blocker) | Apache-2.0 | 7 / 0 | 2025-12-20 | Chrome, Firefox | 35 lines, querySelectorAll + MutationObserver |
| [vordenken/ShortBlock](https://github.com/vordenken/ShortBlock) | GPL-3.0 | 5 / 0 | 2026-04-10 | Safari macOS, not notarized | CSS `:has()` list; redirects `/shorts/` to the home page |
| [zevnda/hide-youtube-shorts](https://github.com/zevnda/hide-youtube-shorts) | GPL-3.0 | 113 / 0 | 2025-10-29 | Chrome, Firefox | CSS file |
| [Mr-Comand/youtube-shorts-remover-tampermonkey](https://github.com/Mr-Comand/youtube-shorts-remover-tampermonkey) | MIT | 74 / 3 | 2026-01-27 | Userscript | Removes elements, handles the channel `/shorts` tab |
| [code-charity/youtube](https://github.com/code-charity/youtube) (ImprovedTube) | Custom + AGPL-3.0 contributions | 4,593 / 1,489 | 2026-09-16 | | Not analysed; license rules it out |

**License rule for this repo (MIT):** copy only from MIT or Apache-2.0 sources, with attribution; keep the
Apache LICENSE/NOTICE. Never copy from GPL/AGPL, PolyForm or unlicensed code (CPFY); ideas only.

## Current desktop selectors (www.youtube.com)

Sources: CPFY 2026-09-19, i5heu 2026-06-09, gijsdev 2026-04-29, eat-my-shorts 2026-09-13.
"Live ✓" = matched on 2026-09-21. `:has()` works in Chrome 105+, Safari 15.4+ and Firefox 121+.

**Home feed shelf** (not live-verified; logged-out home is empty)
- `ytd-rich-section-renderer:has(> #content > ytd-rich-shelf-renderer[is-shorts])` (CPFY)
- `ytd-browse[page-subtype="home"] ytd-rich-grid-group`, `ytd-browse[page-subtype="home"] ytd-rich-item-renderer[is-slim-media][rendered-from-rich-grid]` (CPFY)
- `ytd-rich-item-renderer[rendered-from-rich-grid]:has(ytm-shorts-lockup-view-model)` (gijsdev, rewritten from `:upward`)
- `ytd-rich-section-renderer:has(a[href^="/shorts/"])` (i5heu)

**Search results**
- `ytd-search grid-shelf-view-model` / `grid-shelf-view-model:has(a[href^="/shorts/"])`. Live ✓ (3 shelves).
  DOM: `a < ytm-shorts-lockup-view-model < ytm-shorts-lockup-view-model-v2 < grid-shelf-view-model < ytd-item-section-renderer < … < ytd-search`
- `ytd-search ytd-video-renderer:has(a[href^="/shorts"])`, `ytd-video-renderer:has(ytd-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"])`: no match in sample
- `ytd-search ytd-reel-shelf-renderer`: 0 live, looks legacy
- Shelf title class is now `.ytShelfHeaderLayoutTitle` (live ✓); `.yt-shelf-header-layout__title` and `.shelf-header-layout-wiz__title` are stale
- Shorts filter chip: `yt-chip-cloud-chip-renderer:has(> #chip-container > yt-formatted-string[title="Shorts"])` (localized). Not verified

**Subscriptions** (not live-verified)
- CPFY home-shelf rule + `ytd-browse:not([page-subtype="history"]) ytd-reel-shelf-renderer`, `ytd-browse:not([page-subtype="history"]) ytd-video-renderer:has(a[href^="/shorts"])`
- `ytd-rich-item-renderer:has(a[href^="/shorts/"])`

**Channel Shorts tab**
- `yt-tab-shape[tab-title="Shorts"]`. Live ✓ on `/@MrBeast`
- URL form `/@handle/shorts`

**Sidebar**
- `ytd-guide-entry-renderer:has(> a[title="Shorts"])`. Live ✓. The link is `a#endpoint[title="Shorts"]` with **no href**, so href selectors miss it. Title is localized
- `ytd-mini-guide-entry-renderer:has(> a[aria-label="Shorts"])`. Live ✓ at a narrow viewport

**Watch page**
- `#related ytd-reel-shelf-renderer`, `#structured-description ytd-reel-shelf-renderer` (CPFY)
- `#related ytd-compact-video-renderer:has(...)` is **outdated**: the related column is now 26 × `yt-lockup-view-model`
- `#related yt-lockup-view-model:has(a[href^="/shorts/"])`: guess, untested

**Notifications** (not live-verified)
- `ytd-notification-renderer:has(> a[href^="/shorts/"])` (i5heu)

**Shorts player**
- URL `^/shorts/([A-Za-z0-9_-]+)`; elements `ytd-shorts`, `ytd-reel-video-renderer`, `#shorts-player` (live ✓)
- `/watch?v=<shortId>` plays in the normal player (`#movie_player`, `ytd-watch-flexy`), live ✓

## Navigation (live)

- Clicking a Short from search is navigation inside the app, not a page load (a `window` marker survived).
- Event order: `yt-navigate-start` (still `/results`) → `yt-page-data-updated` → `yt-navigate-finish` (on `/shorts/<id>`).
- So a `main_frame` DNR rule catches only direct loads and pasted links. In-app clicks need the content script
  (`yt-navigate-start`/`-finish`, or a capture-phase click on `a[href^="/shorts/"]`) or a `tabs.onUpdated` hook.
- Wrapping `history.pushState` from an isolated content script can't see YouTube's own calls. This is standard
  isolated-world behaviour, not tested here.

## Recommendation (adopted as D3)

Write our own: ~150–250 lines of JS + CSS.
- Static CSS at `document_start` using the selectors above.
- A small JS pass for the localized labels.
- Redirect via DNR on Chrome/Firefox, and a content-script `location.replace` or click rewrite everywhere.
- Don't use a filter list at runtime: its uBO syntax needs an interpreter, it went stale for months, and the
  forks diverged. Use the lists as a **watch source** only.
