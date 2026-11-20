# Design feedback, round 1 (declutter)

7 of 18 checks pass. Next: round 2: the changes below.

Rules for this revision:
- Read each reference image below before changing anything. Words describe the reference; the image is the reference.
- Change the structure when the check asks for it. Restyling today's layout (same cards, same controls in new colours) is what failed before.
- A reference applies to the element named in applies_to only. Using it on another element, or leaving a check unmet on purpose, is a deviation: list it under 'Deviations' in your reply to the owner, with the reason. Never drop one silently.
- Contract: /Users/nguyentheanh/.cache/arena-eval/declutter-20261120/round-1/contract.json

## VHS menu (19335916) -> popup: feature toggles
Reference image: /Users/nguyentheanh/.cache/arena-research/declutter-20261005/board/img/19335916.jpg
Replaces: iOS green switches in rounded grouped cards
Take: ON / OFF as words in a column, the current row in one colour. The settings page already does this; the popup should too.
- **PARTIAL** must: each toggle's state is shown as a word (on / off), not as a switch, slider or pill control
  - seen: The state is now the words 'on' and 'off', but both sit inside an outlined pill with 'on' filled ink: a two-segment pill switch, not a bare word.
  - fix: Drop the pill outline and fill: print the state as plain text ('on' or '[on] off') at the row's right edge.
- **UNSEEN** must: the current (hovered or focused) row is marked by one solid colour band across the whole row
  - seen: Both screenshots show the popup at rest with no row hovered or focused; no band is visible. A screenshot with a toggle row hovered or keyboard-focused is missing.
  - fix: Supply a screenshot with one toggle row hovered/focused; that row should carry a full-width solid ink or rose band with reversed text.
- **FAIL** must: the toggles read as a plain list of text rows, not rows inside a rounded card
  - seen: The four toggles are still inside a white (light) / dark-grey (dark) rounded grouped card with hairline separators, the same structure as today.
  - fix: Remove the card background, radius and separators for the toggle group; set the rows as bare text lines on the page background.
- **FAIL** must_not: a switch or pill-shaped control on any toggle row
  - seen: Every toggle row ends in a rounded pill outline holding 'on' (ink-filled capsule) and 'off': a pill-shaped control.
  - fix: Remove the pill border and capsule fill from .toggle; leave only the state word(s).

## Struck-through done items (20770715) -> popup: this-page status
Reference image: /Users/nguyentheanh/.cache/arena-research/declutter-20261117/check/20770715.jpg
Replaces: dot + plain sentence ('cookies refused')
Take: 'Handled' shown by taking away: what was answered is struck through.
- **PARTIAL** must: when a banner was handled, the main status line names the handled thing struck through, at full text size
  - seen: The status line reads '~~cookie banner~~ refused': 'cookie banner' is struck through at the same size, but set in muted grey while the unstruck 'refused' in full ink carries the line.
  - fix: Make the struck 'cookie banner' the line itself, in full ink at full contrast; drop 'refused' or move it to the small sub-line.
- **FAIL** must: the handled row is set apart as a filled row (a colour field), the way done items are in the reference
  - seen: The handled row sits in the same white/dark-grey card as every other group, led by a small green dot; no colour field marks it.
  - fix: Fill the handled status row edge to edge with one flat colour (e.g. rose) behind the struck text, and drop the dot.
- **FAIL** must_not: the strike only on a small grey prefix while the line is carried by an unstruck word
  - seen: The strike is on a grey 'cookie banner' prefix and the line is carried by the unstruck, darker 'refused': the pattern this rules out, only the prefix is not smaller.
  - fix: Put the strike on the word that carries the line, in full ink; no unstruck verdict word competing with it.

## iA Writer Focus Mode (2092684) -> popup: attention
Reference image: /Users/nguyentheanh/.cache/arena-research/pensieve-20261004/board/img/2092684.png
Replaces: every row at the same weight; green, amber, red dots and filled pills all at full strength
Take: Dim everything except what matters.
- **FAIL** must: one thing is at full contrast (this page's status); the rest of the popup is visibly quieter
  - seen: The toggle labels, the four ink-filled 'on' capsules, the ink 'refuse' capsule and the report/settings rows are all at full contrast; the status line is no louder than them, and its struck part is greyed down.
  - fix: Set toggles, site choice and report/settings in the muted colour (or lighter weight) and keep only the this-page status at full ink.
- **FAIL** must_not: several accents competing at full strength (coloured dots, filled pills, ink buttons)
  - seen: Five ink-filled capsules (four 'on', one 'refuse'), a green status dot and the rose logo all appear at full strength at once.
  - fix: Remove the filled 'on' capsules and the green dot; leave at most one filled accent (the chosen site option) besides the status.

## Martian Mono (31399571) -> all: type
Reference image: /Users/nguyentheanh/.cache/arena-research/declutter-20261004/board/img/31399571.jpg
Replaces: ui-monospace (differs per OS)
Take: Bundle one open-licence mono with italic and caps so every OS renders the same.
- **FAIL** must: Martian Mono at its natural width; the layout makes room for it
  - seen: The glyphs are visibly narrower than Martian Mono's natural wide setting so rows fit today's widths; popup.html sets font-stretch: 81% on body.
  - fix: Remove font-stretch: 81% (use 100%) and widen the popup or wrap/shorten labels so rows fit.
- **FAIL** must_not: the typeface condensed (font-stretch below 100%) to fit today's rows
  - seen: Body text is condensed (font-stretch: 81% in extension/popup/popup.html line 34), visibly narrow in both screenshots.
  - fix: Set font-stretch to 100% and let the layout grow.

## Also contradicts the direction
- Toggle rows use the B/W segmented-pill look (11379889, picked for the site choice) as on/off switches: a reference applied to a different element, and it keeps a pill control where 19335916 wants plain words.
- Today's rounded grouped cards with hairline separators are kept for every group (toggles, status, site choice, report/settings); only colours and type changed.
- This-page status keeps today's 'dot + sentence' structure (now a green dot), the thing 20770715 replaces.
- Thin outlined 'on|off' capsules repeat on four rows plus the site choice, adding five filled accents where 2092684 asks for one.
