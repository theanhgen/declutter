Handoff from the arena-eval session (popup design). The owner asked me to pass the design choices to you so you carry them with your own changes, then commit and push to the App Store.

What's in the working tree from the design work (all uncommitted, on top of your one-button report change, which I didn't touch):
- `extension/popup/popup.html` + `popup.js`: the popup redesign. Plain-text menu like the settings page: toggles as `[on] / off` in one right column, no cards, no switches; the hovered/focused row gets one ink band; this page's status is the one loud thing (handled = the thing struck through on a pale rose row); Martian Mono at 100% width, popup 352px wide.
- Owner's decisions today: site-choice pill = **soft grey fill at rest, full ink on hover/focus** (option 2); everything except the status quieter by **font-weight 300** (not a paler grey: --muted is already the lightest grey with 4.5:1 contrast). Both are CSS in popup.html, applied a few minutes ago.
- `build.mjs` (copies the font) and `extension/fonts/` (Martian Mono, OFL).
- `research/direction-2026-11-18.json`: the design contract (picks → checks, decisions recorded). `research/arena-ui-2026-11-17.md`: the picks. `research/design-eval-2026-11-20/`: every round's comparison page (open `round-2/index.html`), screenshots and the screenshot scripts.

Status: round 2 passed 16/18 checks with an independent grader; the 2 failures were the pill clash the owner just decided. Round 3 (the two CSS changes above) has screenshots in `research/design-eval-2026-11-20/round-3/screens/` but is **not graded yet**. Unit 26/26 and test:states 9/9 pass with round 3 applied (run before your merge settled; rerun).

Please:
1. Rerun the tests on the combined tree (yours + the design).
2. Before the store build: grade round 3 with the arena-eval skill (load it; step 3 with round dir `~/.cache/arena-eval/declutter-20261120/round-3`, then `report.py`). If anything fails, show the owner the page instead of uploading.
3. Check the popup in real Safari on the Mac and iPhone (`npm run safari` / `npm run ios`); not done yet.
4. Store screenshots and App Store screenshots still show the old popup: regenerate them (`npm run store` etc.).
5. Your open user reports (3queens.cz, bruxx.cz, archa-plus.cz) still block `scripts/archive.sh`.
6. Commit (only declutter's files; `research/user-acquisition-plan-2026-11-17.md` is the owner's, ask before including it), then release through `UPLOAD=1 scripts/archive.sh` and the `app-store-submit` skill, as the owner asked.