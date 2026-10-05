# App Review, Guideline 2.1 "Information Needed" (macOS, 2026-10-02)

Submission `a4554d4f-f556-4bd2-a014-98cbaa19e759`. Not a bug rejection: App Review asks for information because the
account has a limited review history. Reply on the App Review page in App Store Connect (no resubmission needed) with
the text below and the screen recording attached, and keep the same text in App Review Information → Notes.

## Reply text

Hello,

thank you for the review. Here is the information you asked for.

1. Screen recording
Attached. Recorded on a physical Mac running the current macOS. It starts with launching declutter, then shows: the
container app with the steps to turn the extension on; Safari → Settings → Extensions → declutter enabled with "Always
Allow on Every Website"; youtube.com search results without the Shorts shelf and a /shorts/ link opening in the normal
player; a cookie banner refused on a website, with the toolbar popup showing what was done; the per-site choice and
the settings page; the optional tip jar in the app. The app has no account registration, login or account deletion, and
no user-generated content. The only paid items are three optional consumable tips, which unlock nothing.

2. Purpose and target audience
declutter is a Safari web extension with a small container app. It does two things: it hides YouTube Shorts (the
Shorts shelf, tab and search entries; a Shorts link opens in the normal video player), and it answers cookie-consent
banners the way the user chose (refuse by default; accept, or leave alone, per site; optionally per category). It is
for anyone who browses the web in Safari and wants fewer interruptions: people who do not want short-form video on
YouTube, and people who are tired of clicking through consent banners on every site. The value is time and attention:
the user states the choice once and the extension applies it on each site.

3. Setup and access
No account, login, credentials or sample files are needed.
- Open the declutter app once (it shows the steps below).
- Safari → Settings → Extensions → tick "declutter" → "Always Allow on Every Website". All-websites access is needed
  because cookie banners can appear on any site.
- YouTube: open youtube.com and search for anything; the Shorts shelf and Shorts tab are gone. Open a link of the form
  youtube.com/shorts/<id>; it plays in the normal player (/watch).
- Cookie banners: open a site with a consent banner, for example alza.cz, o2.cz or bbc.com. The banner is answered with
  "refuse" and disappears; the declutter toolbar button shows what was done and lets you set this site to refuse,
  accept or leave alone.
- "Agree to tracking or subscribe" walls (for example blesk.cz) are never answered automatically in this build; the
  popup shows the wall and an "Accept this wall" button.
- Tips: in the container app under "tip jar".

4. External services
- Apple StoreKit (In-App Purchase) for the optional tips. No other payment processor.
- Supabase (database hosted in the EU): receives a report only when the user presses "send to developer" in the popup
  for a site that was not handled right. The report holds the site's address (not the page), what the extension
  detected and the extension version.
- GitHub Pages: the extension downloads declutter's public rule list (JSON data: page selectors and click steps, no
  code) from theanhgen.github.io/declutter about every 12 hours, so fixes for websites arrive without an app update.
  Nothing about the user is sent.
- DuckDuckGo's open-source autoconsent library (MPL-2.0) is bundled in the extension and runs on the device; it
  contacts no service.
There is no account or authentication service, no analytics, no advertising and no AI service. The extension executes
no remote code; its rule lists are JSON data.

5. Regional differences
The app works the same in all regions and has no region-specific features or content. What differs is the websites:
cookie-consent banners appear mainly for visitors in the EU, EEA and UK, so outside those regions that part often has
nothing to do. The extra rule pack covers Czech sites in more detail; the general rules cover sites worldwide.

6. Regulated industry or third-party material
Not applicable. The app does not operate in a regulated industry and contains no protected third-party content. The
bundled open-source library (autoconsent, MPL-2.0) is used under its license. YouTube is not modified or
redistributed; the extension only changes how pages are displayed in the user's own browser, at the user's request.

Best regards,
thế anh

## Screen recording: what to show (about 90 seconds, Cmd+Shift+5 → Record Entire Screen)

1. Launch declutter from Launchpad or Finder; pause on the window (steps + tip jar).
2. Safari → Settings → Extensions: declutter ticked, "Always Allow on Every Website".
3. youtube.com → search "minecraft": no Shorts shelf. Paste a `youtube.com/shorts/<id>` link: it opens as `/watch`.
4. alza.cz (or bbc.com): banner goes away; click the declutter toolbar button to show "cookies refused" and the
   refuse / accept / leave control.
5. The extension's settings page (popup → settings).
6. Back in the app: the tip jar. If the three price buttons do not show, see the note below.

## iOS (submission `41d8448e-342e-4e84-b3c5-3fcd8f60b720`, 2026-10-03)

Same request. Reply text: `asc-2.1-reply-ios.txt` (sections 2, 4, 5, 6 as above; 1 and 3 describe the iPhone).

Both replies assume build 4 is attached to the version (2026-10-05: build 3 has no hosted rule list and no "posts"
switch). Record both screens on build 4 from TestFlight or the App Store build, not a dev build.

Screen recording on the iPhone (Control Center → Screen Recording, about 90 seconds):

1. Launch declutter from the Home Screen; pause on the window (steps + tip jar).
2. Settings → Apps → Safari → Extensions → declutter: Allow Extension on, All Websites set to Allow.
3. Safari → youtube.com → search "minecraft": no Shorts shelf. Open a `youtube.com/shorts/<id>` link: it opens as `/watch`.
4. alza.cz (or bbc.com): the banner goes away; page menu in the address bar → declutter: "cookies refused" and the
   refuse / accept / leave control.
5. The extension's settings page (popup → settings).
6. Back in the app: the tip jar.

## Check before replying

The three tips are in state "Ready to Submit", not "Waiting for Review": they were not added to the submission. A first
in-app purchase has to be submitted together with an app version (version page → "In-App Purchases and Subscriptions").
Until they are approved or in review, the tip jar may show no prices in the review build.
