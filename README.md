# declutter

> Personal browser extension for desktop Chrome + Safari (macOS): hides YouTube Shorts and answers
> cookie-consent banners, with Czech sites as the coverage target. One extension, two modules.

Status: **kickstart**. Research is done and decisions are recorded; no code yet. Start with `PROJECT.md`.

## Workspace

| Path | Purpose |
|---|---|
| `PROJECT.md` | Kickstart: decisions (D1–D7), architecture, milestones M0–M3, open gates, gotchas |
| `research/shorts.md` | Open-source Shorts blockers, licenses, current selectors (live-checked 2026-09-21) |
| `research/consent.md` | CoM vs autoconsent vs IDCAC; the 42-site Czech run; consent-or-pay walls |
| `research/toolchain.md` | Local toolchain, Safari/Chrome/Firefox packaging facts |
| `research/consent-run-2026-09-21/` | Raw results + the Playwright harness (seed for the canary) |
| `research/shorts-probe/probe.js` | DevTools snippet: counts matches per Shorts selector |

## Key decisions

See `PROJECT.md` → Decisions. The ones that constrain every change:
- Our code is MIT. Never copy code from GPL/AGPL, PolyForm-Noncommercial or unlicensed projects
  (Control Panel for YouTube has no license). Ideas only.
- autoconsent stays an unmodified npm dependency (MPL-2.0). Czech rules live in our own rule pack.
- Consent-or-pay walls (Seznam, Mafra, CPEx) are left alone: no auto-accept, no hiding.

## What NOT to do

- Don't auto-rewrite selectors from a scraper. The canary only detects and alerts; a person fixes the data.
- Don't rely on Safari's "Allow unsigned extensions". It resets on quit.
- Don't test with the Mac App Store Consent-O-Matic enabled.

## Tooling

Integration patterns: `~/.agents/skills/custom/integration-patterns/SKILL.md`
