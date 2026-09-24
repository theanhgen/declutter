# declutter

## Tech Stack

MV3 WebExtension, vanilla JS, bundled with esbuild (`build.mjs`; autoconsent is an npm package). Safari wrapper
app generated with xcodegen (team `28DMV2MR8T`). Tests and canary: Playwright's Chromium. See `PROJECT.md`.

## Architecture

- `data/`: everything that changes when a site changes — `shorts.json` (selectors), `consent.json` (walls),
  `rules-cz/*.json` (autoconsent rules). Bundled into the extension and fetched remotely (D6).
- `extension/shorts/`: generated CSS + content script on `www.youtube.com`; redirect + self-check.
- `extension/consent/`: unmodified autoconsent in every frame; `snippets.js` holds our page-world snippets.
- `extension/background.js`: settings, data merge, autoconsent `init`/`eval`, per-tab status, badge.
- `safari/project.yml`: container app + extension; a run-script copies `build/safari` into the appex.
- `canary/`: daily full run (`sites.json` holds per-site expectations), launchd job on the home Mac.

## Commands

- Build: `npm run build` (both targets) · `node build.mjs chrome`
- Unit: `npm test` (builds first)
- E2E smoke (live sites): `npm run test:e2e` · walls: `npm run test:walls` · features: `npm run test:features` · remote data: `node test/remote-data.mjs`
- Canary: `npm run canary` (all) · `node canary/run.mjs <host> …` (subset, no alert)
- Safari: `npm run safari` (build, sign, install `~/Applications/Declutter.app`)
- iPhone: `npm run ios` (build, sign, install on a paired iPhone; `IPHONE=<udid>` to pick one) · mobile test: `npm run test:mobile`
- Load in Chrome: `chrome://extensions` → Developer mode → Load unpacked → `build/chrome`
- Store: `npm run store` (store build: walls default manual; zips + 1280x800 screenshots in `dist/`); listing, permission justifications, checklist: `store/LISTING.md`
- Canary job: `scripts/canary-agent.sh install|remove`; log `/tmp/declutter-canary.log`

## Conventions

- MIT. Before copying any code from another project, check its license (`research/shorts.md` has the table).
- Selectors, walls and CZ rules are data. Page-world code is never data (D8): a rule may call a named
  `DECLUTTER_*` snippet from `extension/consent/snippets.js`.
- A new CZ rule: add `data/rules-cz/<site>.json`, add the site to `canary/sites.json`, run
  `node canary/run.mjs <host>`. Make `optOut` end with a `waitForVisible … "check": "none"` so a click that did
  nothing reports failure instead of "done".
- Redirect regexes must use the Safari-safe subset: no `|`, `{n}`, `\d`, `\w` or lookarounds; match the whole URL
  (unit-tested).
- Never add a wall domain's host to a refuse rule's `urlPattern`; wall rules are `cz-wall-*`, accept-only (`optOut: []`) (unit-tested).

## Key Patterns

- YouTube navigates in-app: react to `yt-navigate-finish` or a capture-phase click. DNR only catches
  full page loads.
- Prefer URL/`href`-based selectors over YouTube's internal element names.
- Automated runs must look like a person (desktop UA, `--disable-blink-features=AutomationControlled`) or
  CMPs behave differently — see Gotchas in `PROJECT.md`.
