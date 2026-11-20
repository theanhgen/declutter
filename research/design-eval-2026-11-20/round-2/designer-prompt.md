You are redesigning the declutter browser-extension popup so it follows the visual direction its owner picked. A previous attempt restyled the old iOS layout instead, and an independent grader failed it on 11 of 18 checks. Your job is round 2.

Repo: /Users/nguyentheanh/Desktop/bitbybit/02-personal/declutter (MV3 extension, vanilla JS; read CLAUDE.md there first). Edit ONLY extension/popup/popup.html and extension/popup/popup.js (build.mjs already copies the bundled Martian Mono from extension/fonts/). Do not commit, do not touch other files.

Read these first, in this order, with the Read tool, before writing any code:
1. The grader's feedback: /Users/nguyentheanh/.cache/arena-eval/declutter-20261120/round-1/feedback.md
2. The direction contract: /Users/nguyentheanh/Desktop/bitbybit/02-personal/declutter/research/direction-2026-11-18.json (picks with applies_to "popup: ..." or "all: ..." are in scope)
3. Every reference image named in the feedback (the image IS the reference; the words only describe it). Especially the VHS menu /Users/nguyentheanh/.cache/arena-research/declutter-20261005/board/img/19335916.jpg and the struck-through done items /Users/nguyentheanh/.cache/arena-research/declutter-20261117/check/20770715.jpg.
4. Today's settings page, whose grammar the popup should share: /Users/nguyentheanh/.cache/arena-research/declutter-20261117/today/options-light.png
5. The failed round-1 popup: /Users/nguyentheanh/.cache/arena-eval/declutter-20261120/round-1/screens/popup-new-light.png

Direction, in short: the popup becomes a plain-text menu like the VHS menu and the settings page, not an iOS settings clone. No rounded cards, no switches or pill controls on the toggles: each toggle row is label on the left, state as text in one right-aligned column. The current row (hover / keyboard focus) is marked by one solid colour band across the full row with reversed text. The this-page status is the one thing at full contrast: the handled thing struck through in full ink as the main line, on a filled colour row. Everything else is quieter (muted). Only the site choice refuse / accept / leave keeps the black-and-white segmented pill (chosen side filled in ink). Martian Mono at natural width (no font-stretch below 100%); make room by widening the popup (Chrome allows up to 800px; ~340-360px is fine) or by shortening/wrapping, not by condensing.

Open questions the owner has not decided; use these defaults and list them as assumptions in your reply: lowercase (like the settings page); both words with the current one marked, "[on] / off" like the settings page; the band is ink (fg colour) with reversed text; the handled-status fill is the brand rose at low strength (the app icon rose is #c96575 / #a84a5c; e.g. a pale rose field in light, deep muted rose in dark) with black/ink text.

Keep everything that works: element ids and data attributes the code and tests use (#shorts #posts #playables #consent #status #siteMode [data-mode] #reload #report etc. — read popup.js and test/states.mjs), role="switch" + aria-checked on the toggles, keyboard toggling (Space/Enter), every status state popup.js renders (done, choice, failed, wall, accepting, accepted, paused, acceptedSite, working, none, not-running + reload), dark mode, and the html.ios variant (bigger text, 44px rows).

Loop until you are satisfied:
- cd /Users/nguyentheanh/Desktop/bitbybit/02-personal/declutter && node build.mjs chrome && node /Users/nguyentheanh/.cache/arena-eval/declutter-20261120/shot.mjs /Users/nguyentheanh/.cache/arena-eval/declutter-20261120/round-2/screens
- Read every screenshot it writes next to the reference images and check each must / must_not in the contract yourself. Fix what doesn't hold.
- When done: npm test (unit) and node test/states.mjs must pass (states can be flaky at the 600 ms read; rerun once before concluding it's you).

Reply with: what you changed (structure, not CSS trivia), the assumptions you used, any deviation from the contract with its reason, and test results. Do not grade yourself as passing; an independent grader will.