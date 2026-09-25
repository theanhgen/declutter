# Store listing: every browser

| Store | Browsers it reaches | Upload |
|---|---|---|
| Chrome Web Store | Chrome, Brave, Vivaldi, Arc, Dia, Comet, Yandex, Orion | `dist/declutter-chrome-<v>.zip` |
| Edge Add-ons (Partner Center) | Edge (desktop) | same chrome zip |
| Opera add-ons | Opera, Opera GX | same chrome zip |
| Naver Whale store | Whale | same chrome zip |
| Firefox AMO | Firefox desktop + Android, LibreWolf, Zen, Waterfox, Floorp | `dist/declutter-firefox-<v>.zip` + `dist/declutter-source-<v>.zip` (AMO asks for source of bundled code; build: `npm ci && npm run store`) |
| App Store | Safari on Mac, iPhone, iPad | Xcode archive (`node build.mjs --store safari` first) |

Not possible: Chrome on Android, Samsung Internet (no third-party extensions of this kind).
Firefox build verified in real Firefox 156 (2026-09-24): banners answered, Shorts hidden, /shorts/ redirect.

## Tip jar

Free everywhere, tips optional. Chrome/Edge/Opera/Whale/Firefox: a link (AMO has a "contributions URL"
field; build with `DECLUTTER_TIP_URL=…`). Safari: Apple rule 3.1.1 requires in-app purchase for tips, so the
container apps carry a StoreKit tip jar (consumables `com.theanhgen.declutter.tip.small|medium|large`, create
them in App Store Connect; `safari/Shared/Declutter.storekit` for local testing) and the Safari build must not
show the outside link.

Everything a submission form asks for, in one place. Build the uploads with `npm run store`:
`dist/declutter-chrome-<v>.zip` (Chrome **and** Edge), `dist/declutter-firefox-<v>.zip` (AMO),
`dist/screenshots/*.png` (1280x800). Safari goes through Xcode → Archive → App Store Connect.

Store builds default pay walls to **manual** (personal builds: auto). A stranger should opt in to accepting
tracking, and reviewers read "clicks agree to tracking by default" as a dark pattern.

## Name

`declutter: shorts & cookies` (the bare name "declutter" is likely taken on at least one store; check
before submitting. The manifest `name` stays `declutter`.)

## Short description (≤132 chars, Chrome "summary")

Hides YouTube Shorts and answers cookie banners the way you choose. Nothing leaves your browser.

## Long description

declutter does two things, both entirely inside your browser.

YOUTUBE SHORTS
Removes the Shorts shelf, the Shorts tab and Shorts in search and subscriptions, on desktop and mobile
YouTube. A Shorts link opens in the normal video player instead.

COOKIE BANNERS
Answers cookie-consent banners for you. By default it refuses everything that is not strictly necessary.
You can instead allow categories (preferences, analytics, storage, content, ads, other); where the site
uses Cookiebot, Didomi, OneTrust or cookieconsent, your exact mix is applied through the banner's own
settings, and elsewhere a mix is answered by refusing.
• per site: refuse, accept, or leave the banner alone
• works on sites worldwide: hundreds of consent platforms (via DuckDuckGo's open-source autoconsent) plus
  its own rules for sites autoconsent misses
• pay walls ("agree to tracking or subscribe") are never hidden or refused; declutter shows a badge and
  lets you decide, or agrees automatically if you turn that on
• a counter of clicks saved, and a "not handled right" list you keep locally

PRIVACY
No account, no analytics, no servers. Settings, counters and your reported-sites list stay in the
browser's extension storage. The only network request declutter itself makes is fetching rule lists you add
yourself in settings.

Open source (MIT): https://github.com/theanhgen/declutter

## Category

Chrome: Productivity (alt: Privacy & Security is stricter to review). AMO: Privacy & Security. Edge:
Productivity.

## Single purpose (Chrome)

Reduce page clutter: hide YouTube Shorts and answer cookie-consent banners according to the user's choice.

## Permission justifications (Chrome "Privacy practices" tab)

| Permission | Why |
|---|---|
| `host_permissions: <all_urls>` | Cookie banners appear on any site, inside any frame; the content script must run there to detect and answer them. |
| `scripting` | Some consent platforms can only be answered through their own page-level JavaScript API (e.g. Didomi, Cookiebot); the extension runs its own fixed, bundled functions in the page to do that. No remote code. |
| `storage` | Saves the user's settings, per-site choices, counters and locally reported sites. |
| `alarms` | Re-checks user-added rule lists every 12 hours. |
| `declarativeNetRequestWithHostAccess` | Redirects youtube.com/shorts/… URLs to the normal video player. |

**Remote code:** No. All executed code is in the package. Rule lists are JSON data (selectors and click
steps); they can reference bundled functions by name but cannot add code.

**Data usage** (Chrome disclosure checkboxes): collects none of the listed data types. Not sold, not used
for anything unrelated to the single purpose, not used for creditworthiness.

**Firefox** `data_collection_permissions: none` is set in the manifest.

## Privacy policy URL

https://theanhgen.github.io/declutter/privacy.html (source `site/privacy.html`, deployed by `.github/workflows/pages.yml`).
Needs the repo pushed and Pages enabled first.

## Screenshots

`dist/screenshots/`: 1-popup, 2-choice, 3-youtube, 4-walls, 5-about. Regenerate with `npm run store`.
Chrome also wants a 440x280 promo tile (optional) and the 128px icon (in the zip).

## Safari / App Store

- Needs a paid Apple Developer Program membership (the machine only has an "Apple Development"
  certificate; distribution needs "Apple Distribution", which Xcode creates on first archive if the team is
  paid).
- App Store Connect: one app record, platforms iOS + macOS, bundle ID `com.theanhgen.declutter` on both
  (universal purchase; the extensions are `….extension` on both). Privacy "nutrition label": Data Not Collected.
- Build the store variant first (`node build.mjs --store safari`), then Archive in Xcode.

## Before submitting (checklist)

- [ ] Push the repo to GitHub (link in the description, privacy page on Pages)
- [ ] Decide the public name; check it is free on each store
- [ ] Chrome: developer account ($5 one-off), upload zip, fill the tabs above
- [ ] Edge: Partner Center account (free), same zip
- [ ] Firefox: AMO account (free); test the Firefox build in real Firefox first (only linted so far)
- [ ] Safari: paid Apple Developer membership, archive, App Store Connect
- [ ] Optional: remote rule-list URL baked in (`DECLUTTER_DATA_URL`) so fixes ship without store review
