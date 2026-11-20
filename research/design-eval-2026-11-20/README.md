# Popup design vs the picked direction (arena-eval, 2026-11-20)

Open the `index.html` of each round in a browser.

- `picks-vs-built-2026-11-20/`: first side-by-side of the owner's picks and the 2026-11-18 popup.
- `round-1/`: the 2026-11-18 popup graded: 7 of 18 checks pass.
- `round-2/`: redesign (plain-text menu, `[on] / off`, ink band, struck status on rose, Martian Mono at 100%): 16 of 18. Clash: B/W pill vs Focus Mode; options rendered in `round-2/options/`.
- `round-3/`: owner chose option 2 (soft fill at rest, ink on hover) + lighter weight for everything but the status. Screens taken, **not graded yet**.
- `now/`: the popup at 15d82ad in the same states, for comparison.
- `before-redesign-2026-11-18-popup.patch`: the 2026-11-18 popup diff, before round 2 replaced it.
- `shot.mjs` / `shot-variants.mjs`: the screenshot scripts (run from the repo after `node build.mjs chrome`).

Contract: `../direction-2026-11-18.json` (draft; decisions recorded in it). Skill: `~/.claude/skills/arena-eval`.
