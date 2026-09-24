# Toolchain and packaging facts (2026-09-21)

Nothing was installed or changed during research.

## This machine

| Item | Value |
|---|---|
| Xcode | 27.0 (27A266a), macOS SDK 27.0, macOS 27.2 |
| Safari packager | `xcrun safari-web-extension-converter`, now a symlink to `safari-web-extension-packager`. Flags: `--project-location --rebuild-project --app-name --bundle-identifier --swift --objc --ios-only --macos-only --copy-resources --no-open --no-prompt --force` |
| Safari | 27.2; Safari Technology Preview 27.0 also installed |
| Node | 26.8.2, npm 11.19.1; pnpm + yarn; no bun |
| Browsers | Google Chrome 153 only (no Firefox, Edge, Brave, Arc) |
| web-ext | not installed |
| xcodegen | 2.46.0 |
| Signing | "Apple Development: the anh nguyen (G98PTTPXCN)", expires 2027-08-20. **Team `28DMV2MR8T`** (same as `pensieve/project.yml`) |
| Already installed | `/Applications/Consent-O-Matic.app` 1.1.3 (Mac App Store), `<all_urls>`. **Disable while testing** |

## Repo patterns to reuse

- `katastr-helper/`:
  - MV3, vanilla JS, no build, load `extension/` unpacked. Chrome-only.
  - Tests: `node test/background.test.mjs` (evals `background.js` with `chrome.*` + `fetch` stubbed), plus HTML
    fixtures loading the real `content.js` with `test/chrome-stub.js`. Lint is `node --check`.
- `pensieve/project.yml`: xcodegen, one app + multiple extension targets on team 28DMV2MR8T. The template for
  the Safari container app.

## Safari

- **Packager:** by default it references files rather than copying them, which suits pointing it at build output.
  `--rebuild-project` adds platforms.
- **Persistence:**
  - "Allow unsigned extensions" resets when Safari quits (Apple engineer, forum 700059).
  - Temporary extensions are removed after 24 h or on quit.
  - Build the container app in Xcode with automatic signing on the team. Apple says Safari ignores extensions not
    signed with a development certificate. **Survival across restarts not verified.**
  - A second Mac needs Developer ID + notarization, or TestFlight.
- **Background:** `service_worker` from Safari 15.4. If both `scripts` and `service_worker` are listed, Safari uses
  `scripts` as a non-persistent event page.
- **DNR redirects:**
  - `Redirect` from 15.4. WebKit implements `regexSubstitution` (requires `regexFilter`).
  - The regex parser (`URLFilterParser.cpp`) rejects `|`, `{n}`/`{n,m}`, `\d`/`\w` and lookarounds, and allows
    ASCII only; capture groups are fine.
  - WebKit replaces the **whole URL**; Chrome replaces the first match. Use a regex that matches the whole URL.
  - Forum reports of broken redirects on Safari 18 (721258, 734207). **Not verified on 27.2.**
- **`world: MAIN`:** manifest from Safari 18; `scripting.executeScript` from 15.4; registered scripts from 16.4.
- **Gaps:** no `webNavigation.onHistoryStateUpdated`. Content scripts run only after site access is granted in the
  toolbar popover.
- **Two extensions in one app:** possible in principle (each is its own app-extension target), but not documented
  by Apple and not tested. Moot after D1 (one extension).

## Chrome MV3

- DNR regex is RE2 syntax. Limits: 1,000 regex rules per ruleset type, each under 2 KB compiled; 30k guaranteed
  static rules; 100 static rulesets (50 enabled); 30k dynamic rules (5k "unsafe", e.g. redirects); 5k session rules.
- Redirects need host permission. Use `declarativeNetRequestWithHostAccess` + `host_permissions` for YouTube.
  The consent module needs `<all_urls>` anyway.
- DNR only sees requests that reach the network stack, so it never fires on YouTube's in-app navigation.
- Personal use: `chrome://extensions` → Developer mode → Load unpacked. Branded Chrome 137+ dropped
  `--load-extension`; automation needs Chrome for Testing or Chromium.

## Firefox (deferred)

- No `service_worker`; use `background.scripts` (Firefox 121+ tolerates both keys).
- `browser_specific_settings.gecko.id` is needed for signing. `data_collection_permissions` is mandatory for new AMO
  add-ons since 2025-11-03 (unlisted exemption not checked).
- Release Firefox needs a Mozilla signature (`web-ext sign`, unlisted). Developer Edition/Nightly/ESR can set
  `xpinstall.signatures.required=false`.
- Host permissions are granted at install from 127; world MAIN from 128.

## Framework vs plain files

- **WXT** 0.21.4 (pre-1.0) doesn't create the Safari wrapper app and defaults Safari/Firefox to MV2.
- **Plasmo:** last release 0.90.5, 2025-05-17. Treat as stale.
- The hard part is the Xcode wrapper and signing, and neither framework solves it.
- Decision: esbuild (autoconsent needs bundling) + per-browser manifest merge + xcodegen.

Sources: developer.apple.com (Packaging / Running / Distributing / Assessing compatibility for Safari web
extensions, Safari 26–27 release notes), developer.chrome.com DNR reference, MDN manifest/background +
host_permissions + browser-compat-data, WebKit source (`_WKWebExtensionDeclarativeNetRequestRule.mm`,
`ContentExtensionActions.cpp`, `URLFilterParser.cpp`), wxt.dev, Mozilla add-ons blog 2025-10-23.
