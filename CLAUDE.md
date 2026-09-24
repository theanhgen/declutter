# declutter

## Tech Stack

MV3 WebExtension, vanilla JS + CSS, bundled with esbuild (needed for the `@duckduckgo/autoconsent` npm
package). Safari wrapper app generated with xcodegen (team `28DMV2MR8T`). Canary: Playwright + Chrome for
Testing. Planned, not yet built. See `PROJECT.md`.

## Architecture

- `extension/shorts/`: CSS (`:has()`) + content script, `youtube.com` only; `/shorts/<id>` → `/watch?v=<id>`.
- `extension/consent/`: autoconsent + our Czech rule pack; walls left alone.
- `extension/background.js`: autoconsent wiring, remote-data fetch, toolbar-icon self-check.
- `safari/project.yml`: container app + one Safari web-extension target.
- `canary/`: daily Playwright run on own hardware.

## Commands

- Build: `TODO` (M0)
- Test: `TODO` (M0; follow `katastr-helper/test/` stub pattern)
- Lint: `node --check`

## Conventions

- MIT. Before copying any code from another project, check its license (`research/shorts.md` has the table).
- Selectors and CZ rules are data (JSON), not code.
- Redirect regexes must use the Safari-safe subset: no `|`, `{n}`, `\d`, `\w` or lookarounds; match the whole URL.

## Key Patterns

- YouTube navigates in-app: react to `yt-navigate-finish` or a capture-phase click. DNR only catches
  full page loads.
- Prefer URL/`href`-based selectors over YouTube's internal element names.
