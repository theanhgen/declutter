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

Hides YouTube Shorts and answers cookie banners the way you choose. No tracking, no account.

## Long description

declutter does two things, both entirely inside your browser.

YOUTUBE SHORTS
Removes the Shorts shelf, the Shorts tab and Shorts in search and subscriptions, on desktop and mobile
YouTube. A Shorts link opens in the normal video player instead.
Community posts (pictures, polls, text) between the videos in your feeds can be hidden too; a channel's own
Posts tab stays.

COOKIE BANNERS
Answers cookie-consent banners for you. By default it refuses everything that is not strictly necessary.
You can instead allow categories (preferences, analytics, storage, content, ads, other); where the site
uses Cookiebot, Didomi, OneTrust or cookieconsent, your exact mix is applied through the banner's own
settings, and elsewhere a mix is answered by refusing.
• per site: refuse, accept, or leave the banner alone
• works on sites worldwide: hundreds of consent platforms (via DuckDuckGo's open-source autoconsent) plus
  its own rules for sites autoconsent misses
• pay walls ("agree to tracking or pay") are never hidden or refused; declutter shows a badge and
  lets you decide, or agrees automatically if you turn that on
• a short note in the corner says what was done ("cookies refused"), then goes away; it can be switched off
• a counter of clicks saved, and a "not handled right" list you keep locally
• optional: send Global Privacy Control ("do not sell or share") to every site you don't accept

PRIVACY
No account, no analytics, no tracking. Settings, counters and your reported-sites list stay in the
browser's extension storage. declutter sends something only when you ask: a site you choose to send to the
developer (the site's address only, not the page; what declutter saw; the version). It downloads its own rule
list from GitHub every 12 hours so site fixes arrive without an update; that download sends nothing about you.

Open source (MIT): https://github.com/theanhgen/declutter

## Category

Chrome: Productivity (alt: Privacy & Security is stricter to review). AMO: Privacy & Security. Edge:
Productivity.

## Single purpose (Chrome)

Reduce page clutter: hide YouTube Shorts (and community posts in YouTube feeds) and answer cookie-consent banners
according to the user's choice.

## Permission justifications (Chrome "Privacy practices" tab)

| Permission | Why |
|---|---|
| `host_permissions: <all_urls>` | Cookie-consent banners appear on any site and inside any frame; the content script must run there to detect and answer them according to the user's choice. No page content is collected or sent. |
| `scripting` | Some consent platforms can only be answered through their own page-level JavaScript API (e.g. Didomi, Cookiebot); the extension runs its own fixed, bundled functions in the page to do that. No remote code. |
| `storage` | Saves the user's settings, per-site choices, counters and the list of sites the user reported locally. |
| `alarms` | Re-checks user-added rule lists (JSON data) every 12 hours. |
| `declarativeNetRequestWithHostAccess` | Redirects youtube.com/shorts/<id> URLs to the normal video player (/watch?v=<id>). One static rule, YouTube only. |

**Remote code:** No. All executed code is in the package. Rule lists are JSON data (selectors and click
steps); they can reference bundled functions by name but cannot add code. From the version after 1.0.0, store builds
fetch declutter's own rule list (https://theanhgen.github.io/declutter/data.json, built from `data/` in the repo)
every 12 hours; it is checked against a fixed shape (`validData` in `extension/lib.js`) and the bundled copy stays
as the fallback. Say this in the reviewer notes of every store.

**Data usage** (Chrome disclosure checkboxes): "Web history", only the address of a page the user explicitly
chooses to send as a report, reduced to the site (e.g. https://www.idnes.cz). Nothing else. Not sold, not used
for anything unrelated to the single purpose, not used for creditworthiness.

**Firefox** `data_collection_permissions`: `required: ['none']`, `optional: ['browsingActivity']`; the popup asks for it before the first send.

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

## Reviewer notes

**Firefox (AMO "Notes to Reviewer"):**

```
Build: Node 22+, then `npm ci && npm run store`. Output: build/firefox (the uploaded package) and dist/.
Bundler: esbuild, no minification. The only third-party code is @duckduckgo/autoconsent (MPL-2.0, unmodified, from npm).
No remote code: rule lists are JSON data (selectors and click steps); they can name a bundled function but cannot add code.
No account or login is needed to test.
To try it: open youtube.com and search for anything (the Shorts shelf is gone; a /shorts/<id> link opens in /watch). Open a site with a cookie banner, e.g. alza.cz, o2.cz or bbc.com: the banner is refused and the toolbar popup shows what was done.
Data: nothing is sent unless the user presses "send to developer" in the popup; the popup asks for the optional browsingActivity data permission before the first send.
Source: https://github.com/theanhgen/declutter
```

AMO's privacy policy field takes text, not a URL: the text of `site/privacy.html`, plus its URL as the last line.

**App Store (App Review Information → Notes):** how to turn the extension on (iPhone/iPad: Settings → Apps → Safari →
Extensions; Mac: Safari → Settings → Extensions, Always Allow on Every Website), what to try (YouTube search and a
`/shorts/<id>` link; a cookie banner on alza.cz, o2.cz or bbc.com; per-site choice in the popup; blesk.cz as a wall
that is never answered automatically in the store build), the three consumable tips that unlock nothing, and the data
handling ("send to developer" only). The full text is in App Store Connect; contact details are not kept in the repo.

## Submissions

| Store | State (2026-11-23) | Notes |
|---|---|---|
| App Store (macOS + iOS) | 1.3.0 (14) waiting for review (submitted 2026-11-24; review submissions iOS `d43c9c8b-68da-483f-b952-cc5e4208f0e9`, macOS `22ea1624-0261-431e-8113-640027a32f85`); 1.2.2 (13) live | App `6816072545`. App Privacy: Data Not Collected. 1.3.0: per-site pay-wall choice, popup says how a banner was answered, report reasons and retry, tip-jar outcome messages, Mac app status recheck (#31), bug fixes #50–#56, more Czech rules. 1.2: popup redesign (Martian Mono, [on] / off rows, haptic switches on iOS), one-press "send to developer", Shoptet/Inspire/archa-plus rules, sharp Safari toolbar icon. Builds 9 and 10 were pulled from review and replaced the same day. Review recording `dist/declutter-app-review-ios.mp4` re-attached (attachments don't carry over). |
| Firefox AMO | 1.2.2 submitted 2026-11-23 (version id `6749729`, source zip attached, validated with no warnings); 1.2.1 listed | Listing name `declutter: shorts & cookies`, slug `declutter-shorts-and-cookies`, version id `6738193`. Compatible: Firefox + Firefox for Android. Source zip, release notes and build notes on the version page. Categories: Privacy & Security; Photos, Music & Videos. MIT. |
| Chrome Web Store | 1.2.2 pending review (submitted 2026-11-23, publishes automatically); 1.2.1 live | Item `ipggncgnmnbfbdkpgkollcpdjabfonim`, publisher `be12818b-259a-4c0a-860f-5e5ffc0fb652`. Category Tools, language English. Data usage: Web history only. Free, Public. Screenshots: the 1.0 one replaced by the five `site/screenshots/*.png` (1.2 popup), submitted 2026-11-21 (listing change, Pending review, publishes automatically). Google Analytics 4 opted in for the store listing (2026-11-21, owner's choice). |
| Edge Add-ons | Not started | Partner Center account has no Edge developer enrolment yet. |
| Opera, Whale | Not started | Same chrome zip; each needs its own developer account. |

The 1.2.0 Chrome, Firefox and source zips were built from commit `b264897`; the 1.2.1 ones (and App Store build 12) from `7c56fbb`; the 1.2.2 ones (and build 13) from `a847c0f`; App Store build 14 (1.3.0, App Store only) from `b239421`. 1.2.1: T-Mobile hidden-dialog loop in Safari, Harvest cookie wall and vilgain.cz rules, cookieconsent v3 category choice through the preferences modal (ceskatelevize.cz). 1.2.2: popup switches respond only to the on/off column; the unchosen word fainter.

Automation limits found on 2026-10-01: Google refuses sign-in in an automated browser; Chrome lets no extension
(including Claude's) read or script the Web Store dashboard; AMO's forms can be filled through the Claude extension.
Since 2026-11-20 both dashboards are driven over CDP in the agent Chrome (`chrome-agent` skill): CDP is not an
extension, so the Web Store dashboard works. Google asks the owner to "Verify it's you" and Mozilla for a 2FA code
when the session is old; both are the owner's step.
Automation note (2026-11-22): the Web Store "Upload new package" dialog's "Select file" opens a native chooser; set the file on its `input[accept=".zip,.crx"]` directly (`agent-browser upload`). The "Submit for review" confirmation needs a second click on the header button before the dialog renders.

## Before submitting (checklist)

- [x] Push the repo to GitHub (link in the description, privacy page on Pages)
- [x] Decide the public name: `declutter: shorts & cookies` (App Store, AMO); Chrome takes the manifest name `declutter`
- [x] Chrome: submitted 2026-10-02, pending review
- [ ] Edge: enrol at partner.microsoft.com/dashboard/microsoftedge (free), then upload the chrome zip
- [x] Firefox: submitted 2026-10-01, awaiting review
- [x] Safari: submitted 2026-10-01, waiting for review
- [ ] Optional: remote rule-list URL baked in (`DECLUTTER_DATA_URL`) so fixes ship without store review
