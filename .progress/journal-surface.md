# Journal / reflection surface — report

**Stage 7** (reflection form; migration was already done) · **Status: complete**
**Verification:** `npx tsc --noEmit` clean · `npx electron-vite build` clean ·
`npx vitest run` → **413 passed / 0 failed** (21 files), of which **54 are new here** ·
driven in a real Electron window against a copy of the real 83-entry corpus and against a
seeded 24-day lapse, in both themes.

---

## What landed

```
app/src/renderer/src/components/journal/
  journal-model.ts     all the logic, no React — the grid, the draft, truncation, search
  journal-data.ts      the reads and writes, in the store/inbox.ts shape
  RatingRow.tsx        the 1–7 row from the comp, as a real radio group
  PromptFields.tsx     the four PRD J3 prompts
  ReflectionCard.tsx   the comp's "Tonight" card — rating, disclosure, prompts, save
  MonthGrid.tsx        the thirty-day grid + "Empty is just empty."
  JournalHistory.tsx   everything written, searchable, click-to-edit
  index.ts

app/src/renderer/src/surfaces/JournalSurface.tsx   the <Page>, two columns
app/test/journal-ui-model.test.ts                  35 tests
app/test/journal-ui-j6.test.ts                     19 tests
```

No dependency added, no primitive restyled, nothing outside my files touched. `Card`,
`Button`, `Input`, `Textarea`, `Field`, `Skeleton`, `EmptyState`, `Eyebrow` and
`StreakBadge` are used as they ship.

### The comp, ported

The left column is the approved comp's "Tonight" card, composed exactly as the comp
composes it — Cormorant title, *"How was today? A number is a whole entry."*, seven
`aspect-square` cells at `radius-control` with Cormorant numerals and a gold fill on the
chosen one, the gold disclosure line, then a hairline, `LAST THIRTY DAYS`, the fifteen-column
grid at `radius-cell` with 5px gaps, and the caption. The one thing the comp could not show
is behaviour: every grid cell is a button, and the prompts are real fields.

The column is capped at 26rem so the rating cells land at the size the comp draws them
(~55px). Below `xl` the two columns stack; the rating row keeps its own `max-w-[27rem]` so
a full-width card does not turn seven numbers into seven 130px slabs.

---

## How J6 is enforced structurally

Not by careful copy. By making the guilt state unreachable.

**1. The type has no failure state.** A grid cell is:

```ts
export interface GridDay {
  date: DateString
  entry: JournalEntry | null
  isToday: boolean
}
```

No `missed`, no `gap`, no `daysSince`, no `isPast`-paired-with-absence. `MonthGrid` cannot
paint a wall of red because it is never handed anything that says a day was a failure. A
day with an entry is `--accent-border`; a day without one is `--rule`, the same hairline
grey the app draws dividers with. There is no third branch. A test asserts the key set is
exactly `['date','entry','isToday']`.

**2. The streak goes through `StreakBadge` unchanged**, which has no code path to zero. On
the real data (`current: 0, longest: 44`) it renders **"Longest run · 44 days"** and never
mentions the gap. Nothing in this surface reads `current` to branch on it.

**3. No aggregate with a denominator is ever formatted.** `daysWrittenLabel(total)` is the
only count on the screen — "83 days written". 211 days spanned and 39.3% adherence are both
computable from data already in hand and are deliberately never rendered. Tested:
`daysWrittenLabel` output contains no `%` and no denominator, and the rendered screen
matches no `\d+ (of|/) \d+ days`.

**4. `daysWrittenLabel(0)` is the empty string**, and the history card renders no meta at
all when the count is zero. This was a real bug the tests caught: the card had been
rendering **"0 days written"** on a blank vault. A zero on the day-one screen is the same
zero J6 forbids on the streak; it is gone.

**5. Every accessible name is neutral.** An empty cell is
`"Friday 3 July — empty"`. A test asserts no label in a thirty-day grid matches
`/miss|skip|broke|lost|fail|behind|streak|since|gap|should|forgot/`.

**6. Red is absent, not avoided.** There is no `*-danger` class, no
`variant="destructive"` and no `tone="danger"` anywhere in these files — enforced by a
source-scanning test, and confirmed live: a computed-style sweep of every element under
`<main>` and `<header>` found **0 elements** painted in `--danger` in either theme. There
is also no delete affordance on this surface, which is why the count is zero rather than
one. Saving failures render as a quiet line that says what survived — *"Your words are
still here."* — never red, never the word "Error".

**7. Coming back counts up from one.** Verified end to end against the real repository:
before, `current: 0` and the badge reads `Longest run · 44 days`; the user taps a number;
after, `current: 1`, `longest: 44` (the bank did not move and structurally cannot shrink),
and the badge reads `1 day running`. At no point does a zero appear.

---

## What the 24-day-lapse screen actually looks like

Seeded from a **copy** of the real `journal.json`, shifted so the last entry is exactly 24
days old — the real maximum gap — with the banked longest at 44.

![The journal surface after a 24-day lapse, light theme](journal-surface/lapse-light.png)

Dark: [`journal-surface/lapse-dark.png`](journal-surface/lapse-dark.png)

The header says **"Longest run · 44 days"**. The grid shows two gold days at the far left,
then twenty-four neutral squares, then today with a gold selection ring. Under it: *"Empty
is just empty."* The card says *"Tonight — How was today? A number is a whole entry."* with
the seven cells and one gold line offering *"Say a little more ↓"*. To the right, "83 days
written" and every word the user has ever written, searchable.

There is no zero. There is no red. Nothing counts the gap, names it, or refers to it. The
only thing on the screen that is bigger than it was three weeks ago is the number of days
they have written.

Other states, all captured live:
- [`journal-surface/prompts-open.png`](journal-surface/prompts-open.png) — the four prompts,
  a non-BMP emoji typed and saved, the streak already reading "1 day running".
- [`journal-surface/editing-a-past-day.png`](journal-surface/editing-a-past-day.png) —
  7 July reopened from the grid: rating 3 preselected, its prose loaded, the invitation in
  past tense, "Back to tonight" in the card actions.

---

## The three facts about the real data, and where each is handled

**1. Key on `entry_date`, never `created_at`.** `journal-model.ts` never reads `created_at`
— a source-scanning test asserts `/\.created_at/` appears in no journal file outside a
comment. `indexByDate`, `buildMonthGrid` and `sortByDateDescending` all key on
`entry_date`. Tested with an entry whose `created_at` post-dates its `entry_date` by six
days: it lands on the day it is about, and the day it was typed stays empty.

**2. Editing an existing day is a normal path.** One card does both, because the repository
upserts on `entry_date`. Reopening loads the entry into the draft; the title switches from
"Tonight" to the day; the invitation switches to past tense; a day that already has writing
**opens with the prompts expanded** rather than hiding them behind the disclosure. Changing
only the rating preserves the prose (verified against the repository, not just the model).
Clearing a field that had text sends an explicit `''`; a field that was empty and stays
empty is never sent at all, so a bare rating does not acquire four empty strings (J0).

**3. Non-BMP emoji.** `truncateByCodePoint` slices `[...text]`. Tested at **every** cut
point from 1 to len+2 on a verbatim real entry (`…holy akpsi bro 💀`) for lone surrogates,
plus a teeth test proving the naive `text.slice(0, 46)` this replaces **does** emit one. A
source scan forbids `.slice(`/`.substring(`/`.substr(` on prose in these files.

Also handled: two entries for one day in a hand-edited file resolve to the most recently
updated rather than throwing at the render tree.

---

## The other requirements

| | Where |
|---|---|
| **J0/J2** rating alone is a complete entry | The form opens as the rating row and nothing else — verified live: `textareas on open = 0`. Choosing a number **writes immediately**; there is no Save button between a five-second entry and being done. |
| **J3** four prompts, all optional | In the PRD's order, behind the disclosure. Nothing is `required`, nothing is validated, no `aria-invalid` is ever set. Set in Cormorant — they are questions, not field labels. |
| **J5** current streak when ≥1 | `StreakBadge` in the `<Page>` actions. |
| **J4/J8** privacy, described accurately | One line under the history: with `journal_access: full` it says synthesis reads entries in full so it can quote you back to yourself; with `metadata` it says synthesis sees only date, rating and mood word. Read from `settingsRepository`, which is where the projection lives. It does not claim the prose never leaves the machine — J7 is a real exception and the UI should not lie about it. |
| History, browsable and searchable | Newest first on `entry_date`, 24 rows a page with "Show more" (verified 24 → 48). All-terms search across all four prose fields plus the date as it is read, so "july" and "saturday" both work. Emoji searchable. |

Data goes through `useVaultQuery` with the four states in the prescribed order. Writes call
`invalidateVault()`. One subtlety worth knowing: `useJournalDay` returns `{date, entry}`
rather than a bare entry, because `useVaultQuery` keeps the previous `data` while a new
fetch is in flight — a form hydrating from that would briefly show the *previous* day's
writing and could save it onto the new date. Comparing `data.date` to the requested date
makes that unrepresentable. The draft also hydrates **once per date**: after that it belongs
to the user, so a background refetch from the vault watcher can never overwrite half-typed
prose.

---

## Verified by running it

Built app in real Electron, driven over CDP (`--remote-debugging-port`; no app source
touched), `DESVU_VAULT` pointed at temp vaults seeded from a **copy** of the real
`journal.json`.

```
header            "Journal | Longest run · 44 days"          # 24-day lapse, no zero
textareas on open  0                                          # J2
rating cells       1..7 · role=radiogroup · 7×role=radio · 1 tabbable
grid cells         30 · empty rgba(0,0,0,.06) --rule · filled rgba(156,126,64,.28)
caption            "Empty is just empty."
disclosure         "Say a little more ↓" → "Just the number is fine ↑"
click rating 6    → meta "Saved", header becomes "1 day running"      # 0 → 1, no zero
type + Save       → history top row "6 · Saturday · 1 August 2026 · steady ·
                     the walk home in the cold 💀"                     # non-BMP round trip
click a grid cell → "Tuesday · 7 July 2026" · rating 3 preselected ·
                     prose loaded · "How was that day?" · "Back to tonight"
search "walk"     → "2 matches", 2 rows
keyboard ArrowRight on the row → moves 4 → 5 and saves
Show more         → 24 → 48 rows
narrow (1024px)   → columns stack, no horizontal overflow
red elements      → 0 in light, 0 in dark (computed-style sweep)
console errors    → 0
day count appears → exactly once on the page
```

Two strings tripped my own copy audit and both are false positives: **"skipped"** is the
user's own writing rendered in history (*"busy day, skipped lectures"*), and **"missed"** is
`ROUTES.journal.description` — *"a missed day is just a missed day"* — which is deliberately
deflationary J6 copy and lives in `lib/routes.ts`, which I do not own.

The 54 new tests run in vitest's node environment; the rendered assertions use
`react-dom/server`, so no new dependency and no jsdom.

**The real vault was read from and never written to.** `journal.json` in the iCloud
container still has its 83 entries and its pre-session mtime.

---

## Needs action — not mine to fix

**`~/Documents/Dès vu` is no longer the symlink.** At 04:02 today it was replaced by a real
directory containing only `Inbox/2026-08-01.md` and
`data/{settings,todos,calendar}.json` — the fingerprint of `scripts/seed-dev.mjs` run with
`DESVU_VAULT` unset. This is not mine: I only ever read that path, and I re-seeded my temp
vaults from the iCloud container once I noticed.

Why it matters: `resolveVaultPath()` prefers `~/Documents/Dès vu`, and that stray directory
has a `data/`, so `isVault()` passes. **Any app or script run without `DESVU_VAULT` now
resolves to the stray directory instead of the real corpus** — the journal would appear
empty, and worse, writes would land there.

The real vault is intact at
`~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Dès vu` — 83 entries,
2025-12-31 → 2026-07-29, every directory present. Fixing this means deleting a directory
that may hold another agent's in-flight work, so I did not touch it. The fix is to remove
the stray directory and restore the symlink, once whoever created it has been checked with.

Worth considering separately: `resolveVaultPath()` accepting any directory with a `data/`
child is what let a seeder silently shadow the real vault. A stricter probe — `PRD.md`, or
`data/SCHEMAS.md` — would have failed loudly instead.

---

## Deliberately not done

- **No delete affordance.** `journal.remove` exists on the API and nothing on this surface
  calls it. Deleting a day is destructive, is in no J-requirement, and is the only thing
  that would put red on a reflection surface. If it is wanted, it belongs behind a
  confirmation and should be specced.
- **No charts.** Recharts is a dependency and rating-over-time is the obvious next thing,
  but no chart tokens are derived yet and a trend line is the easiest place to accidentally
  re-introduce a "you are declining" reading. It needs a design decision first, not a
  component decision.
- **Data hooks live in `components/journal/journal-data.ts`, not `store/journal.ts`.** They
  follow `store/inbox.ts` exactly; they are in my directory only to avoid colliding with a
  parallel agent in shared territory. Lifting them is a file move and an import change when
  a second surface needs them — the Today dashboard's "Tonight" card is the obvious first
  caller, and `ReflectionCard` is already shaped to drop into it.
- **The disclosure state is not remembered across sessions.** It reopens collapsed unless
  the day already has writing, which is the J2 reading. If a user who always writes prose
  finds that tedious, a remembered preference is the fix — but defaulting to "you have
  already done enough" is the deliberate choice.
- **No date navigation beyond the last 30 days and the history list.** A day older than the
  grid is reachable by clicking its history row, which covers the whole corpus. A month
  picker would be a second navigation model for the same job.
