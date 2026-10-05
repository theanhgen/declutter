# Brand, logo and UI/UX research via Are.na (2026-10-04)

Method: 49 channel searches on Are.na's public API (`api.are.na/v2`, no account), 34 channels read (about 900
blocks). About 360 images were looked at on contact sheets, plus the titles of every link. Block links below go
to the Are.na block, which credits the original.

Reference board (16 images with reasons, private): https://claude.ai/artifact/HLAonFUjg8iZ9a2SW3H1Up. Built with
the `arena-research` skill from 817 images in 7 channels; the microinteraction GIFs didn't decode, so that
theme is missing from the board.

What this is: a picture of what designers collect and value around calm tools, subtraction, plain text and
small software. What it isn't: evidence of what users want. Nothing here was tested with users. The images are
references only; none are copied into this repo.

## Where declutter is today

| Surface | Look |
|---|---|
| Icon | Bold rose lowercase "d" (#c96575 / #a84a5c), flat, on light grey in the Safari app |
| Popup | iOS Settings clone: grouped white cards, **green** iOS switches, **blue** "report" link, system greys; monospace text |
| Settings, welcome page | Plain text after mattdesl.com: monospace, `[on] / off` lines, coloured dot bullets, lowercase headings |
| Site | Same plain-text look, rose accent |
| Chip | Dark pill (#1c1c1e), monospace, logo + text + ✓/✕ |

Three visual languages: iOS system, plain text, rose. The popup is the surface people see most, and it carries
none of the brand: no rose, and the system's green and blue instead. The "d" works as a toolbar glyph but says
nothing about what declutter does.

## Findings

### 1. Subtraction is the idea, and designers already have a visual language for it

The most-collected material near "declutter" is about taking away: erasure poetry, redaction, absence as
content.

- Erasure poetry and Oulipo: [François Caradec](https://www.are.na/block/269284),
  [Isobel O'Hare, *all this can be yours*](https://www.are.na/block/14374491) (erasures of celebrity apologies),
  [The Aesthetics of Erasure](https://www.are.na/block/13755001),
  [*Delete: Art and Wiping Out*](https://www.are.na/block/13787370) (Slovak National Gallery).
- Absence as the subject: [blank protest sign](https://www.are.na/block/16198481),
  [Truth and Greatness](https://www.are.na/block/17370109) (a table of contents with only page numbers),
  [Hole Theory](https://www.are.na/block/18596471), [Adrienne Rich, *Cartographies of Silence*](https://www.are.na/block/18622885).
- Wordmarks that whisper or lose parts: [hush](https://www.are.na/block/32960273) (wordmark almost gone),
  [letters with pieces removed](https://www.are.na/block/23756206), [1984, dissolving](https://www.are.na/block/23756205),
  [ROVE](https://www.are.na/block/23045426) (one letter swapped for a mark).

For declutter: the brand can *show* removal instead of describing it. What's left on the page after the noise
goes is the product.

### 2. Calm technology gives the UI rules

- [Calm Technology](https://www.are.na/block/1204698) (Amber Case, after Weiser and Seely Brown at Xerox PARC,
  [paper](https://www.are.na/block/1435313)). Its principles, paraphrased: ask for as little attention as possible,
  work in the periphery, inform without demanding, communicate without speaking, keep working when it fails, use
  the least technology that solves the problem.
- Objects collected as calm: [iA Writer Focus Mode](https://www.are.na/block/2092684) (dims everything but the
  sentence), [Dohm white-noise machine](https://www.are.na/block/2093476),
  [Good Night Lamp](https://www.are.na/block/2093929),
  [Daylight tablet](https://www.are.na/block/28268523) (paper-white, amber light),
  [Light Phone 2](https://www.are.na/block/4501195).

For declutter, mapped principle by principle:
- **Periphery:** the chip sits in a corner for 2 s; the badge appears only on exceptions. Keep it that way.
- **Communicate without speaking:** the chip's ✓ and the coloured dot are enough; avoid sentences.
- **Works when it fails:** "banner not answered" leaves the page usable; never blocks it.
- **Minimum technology:** matches the "two things only" rule, which the NotebookLM research
  (`notebooklm-2026-10-03.md`) also supports.

### 3. declutter belongs to a lineage of tools that take things away

- [Twitter / Facebook Demetricator](https://www.are.na/block/1822103) (Ben Grosser: hides likes and counts).
- [Calm Twitter](https://www.are.na/block/2256585), [Tokimeki Unfollow](https://www.are.na/block/3568454)
  ("KonMari your Twitter"), [Add-Art](https://www.are.na/block/9273236) (art replaces ads),
  [Unhook](https://www.are.na/block/25087650), [Terms of Service; Didn't Read](https://www.are.na/block/39574774).
- Small-software ethos: [Fits on a Floppy](https://www.are.na/block/46254271),
  [An app can be a home-cooked meal](https://www.are.na/block/6184887),
  [Your Tools Shape Your Focus](https://www.are.na/block/28268724),
  [There's Too Much Damn Content](https://www.are.na/block/4736171).
- Tone of voice in recent small-app sites: [Bucko, "a little less on your mind"](https://www.are.na/block/50211951),
  [kissaten, "a little app for better coffee"](https://www.are.na/block/50959417),
  [overbrowsing, "Close this tab!"](https://www.are.na/block/37284030),
  [Norma](https://www.are.na/block/49451461) (block apps by scanning a steel disc).

For declutter: position it as a modest, slightly wry subtraction tool, not a privacy shield. That fits the
NotebookLM finding that refusing banners doesn't measurably reduce tracking.

### 4. Plain text and monospace are a coherent, respected look; commit to it

- [iA](https://www.are.na/block/14049201), [Markdown and the slow fade of the formatting fetish](https://www.are.na/block/43093011),
  37signals, "haute plain text" sites.
- Monospace with character: [Bureau Brut mono specimen](https://www.are.na/block/2492125),
  [Tempos Mono](https://www.are.na/block/41507976), [departure-board green mono](https://www.are.na/block/37974279).

declutter's settings and site already use this look. The weak spot is `ui-monospace`, which is SF Mono on Mac,
Menlo or Consolas elsewhere, and DejaVu on Linux, so the brand renders differently on every OS.

### 5. App icons in 2025–26 are tactile objects

The [app icons channel](https://www.are.na/block/36354051) is full of physical things in the iOS 26 / Liquid Glass
manner: [a leather pouch](https://www.are.na/block/36354051), [a crate](https://www.are.na/block/35914550),
[a notebook](https://www.are.na/block/35914527), [a book with a bolt](https://www.are.na/block/34763572),
[a pencil](https://www.are.na/block/34682502). A flat letter on a grey square reads as a placeholder next to them.

declutter's rose is close to the colour of a classic pink rubber eraser. An eraser is the most direct object for
"takes things away", and it's already the brand colour.

### 6. Microinteractions: a pill that changes state

[Dynamic toggle](https://www.are.na/block/35541474) (a pill that morphs between states),
[reveal and copy](https://www.are.na/block/35165383) (part of a value hidden, then confirmed with a tick),
[segmented counts](https://www.are.na/block/28591385). These are the same family as the chip, which shrinks from
wide to logo plus ✓.

### 7. Cookie banners are themselves a designed genre; the chip must never look like one

The [cookie banner button channel](https://www.are.na/block/21838020) collects banners as objects:
[playful](https://www.are.na/block/21838020) ("Let's share some cookies!"),
[plain three-button](https://www.are.na/block/21502956), [witty](https://www.are.na/block/22533404).
[Hall of Shame](https://www.are.na/block/29676350) collects the dark-pattern side.

For declutter: the chip stays small, bottom corner, no buttons, gone in seconds. Any action belongs in the popup.

## Recommendations (ranked)

| # | What | Why | Effort |
|---|---|---|---|
| 1 | **One visual language.** Bring the popup into the plain-text look: monospace, rose for "on", the coloured dots for status, underlined text links instead of iOS blue. Drop the iOS green switches. | The most-seen surface carries none of the brand today (§4). | M |
| 2 | **Rose as the only accent.** Switches, focus and the toolbar glyph use rose. Green, orange and red stay only as status dots (refused / wall / failed), where they carry meaning. | One accent reads as a brand; four system colours read as a template. | S |
| 3 | **Bundle one open-licence monospace font** for the popup, settings, welcome page and site, so the brand looks the same on every OS. Shortlist and check licences first; IBM Plex Mono, JetBrains Mono and Commit Mono are OFL. | `ui-monospace` differs per OS (§4). | S |
| 4 | **Safari app icon as an object: a rose eraser** with the "d" embossed, in the iOS 26 tactile style. The toolbar glyph stays the flat "d". | Current icon looks like a placeholder next to current icons; the eraser is the colour and the meaning (§5). | M (design) |
| 5 | **Explore a subtraction wordmark:** "declutter" where "clutter" is lighter or partly erased, or the "d" with its bowl as the only filled shape. Try three sketches before choosing. | Shows the idea instead of naming it (§1). | M (design) |
| 6 | **Site hero shows the removal:** a short loop of a page with a banner and a Shorts shelf, then the same page with them gone, the chip appearing for a second. | Demonstrates subtraction; the small-app sites collected lead with one sentence and one demo (§3). | M |
| 7 | **Tone line in the lineage:** short, lowercase, a little wry. Candidates: "a little less on the page", "the web, minus the noise", "the banner, answered. the shorts, gone." Never "stops tracking". | Fits §3 and the NotebookLM honesty finding. | S |
| 8 | **Keep the chip calm:** no buttons, no sentences, ≤2.5 s, bottom corner. Consider letting the pill end as just the rose "d" with ✓. | Calm technology principles (§2); must not resemble a banner (§7). | S |

Not recommended:
- A playful mascot or illustration style: it would be the opposite of subtraction.
- A dark "hacker" terminal look: it reads as a developer tool, not a calm one.
- Copying iOS Settings more faithfully: it gives up the brand on every browser.

## Open questions

- Does the iPhone popup need to feel native (iOS switches) more than branded? Worth a quick look on a real phone
  before recommendation 1 applies there.
- An eraser icon or a wordmark change are brand decisions for the owner, not research conclusions.
