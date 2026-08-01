# Explore library + global search — report

**Agent:** explore-search · **Stages:** 10 and 11 · **Status:** complete
**Verification:** `npx tsc --noEmit` clean · `npx electron-vite build` clean ·
`npx vitest run` → **414 passed / 0 failed** (21 files), of which **61 are new** in four
suites · driven by hand in a real Electron window against a seeded temp vault, both themes.

---

## What landed

```
app/src/renderer/src/components/library/
  library.ts             pure logic — filters, facets, summaries, estimates, the archive clock
  data.ts                reads (useVaultQuery) + writes (bridge → invalidateVault)
  useLibraryActions.ts   status / set-aside / open, with the copy that goes with each
  LibraryItemView.tsx    LibraryCard (grid) + LibraryRow (list) and their shared parts
  LibraryFilters.tsx     scope · type · status · tag · source · sort · text
  FitsRightNow.tsx       E6
  QueueCare.tsx          E7
  index.ts

app/src/renderer/src/components/search/
  search.ts              pure logic — grouping, highlighting, filters, what Enter does
  data.ts                debounced query hook
  SearchOverlay.tsx      the ⌘K overlay
  SearchResultRow.tsx    one hit
  index.ts

app/src/renderer/src/surfaces/ExploreSurface.tsx   replaced the placeholder
app/src/renderer/src/App.tsx                       one import, one <SearchOverlay />

app/test/library-ui-model.test.ts     20
app/test/library-ui-archive.test.ts   10   (E7 end to end, against a real temp vault)
app/test/search-ui-model.test.ts      21
app/test/search-ui-recall.test.ts     10   (S3 end to end, against a real temp vault)

.progress/explore-search/             screenshots + the vault seeder used to make them
```

No dependencies added. `app/package.json` untouched. No file under `src/shared/**` or
`src/main/**` was modified, and no other surface, shell component or primitive was edited.

**One structural note.** `data.ts` in each feature folder is the `store/inbox.ts` pattern
exactly — a read is a hook wrapping `useVaultQuery`, a write is a plain async function that
calls `bridge()` then `invalidateVault()`, nothing is mirrored into zustand. It lives beside
the components rather than in `store/` only because file ownership was split that way for
this wave; `store/library.ts` and `store/search.ts` are the natural homes and a rename is
all it takes. Flagging so it does not calcify as a second convention.

---

## Explore

### E2 — grid and list, filterable

Both views over `Library/`. Scope is a three-way switch — **In the queue · Set aside ·
Everything** — and then type, status, tag, source, a text filter and a sort. The type / tag /
source dropdowns are **built from the items actually in scope**, with counts, so no filter in
the UI can lead to an empty list you did not ask for.

The whole library including archived items is read **once** (`list({ includeArchived: true })`)
and scoped client-side. That makes switching to "Set aside" instant, makes the facet counts
agree with each other, and removes any chance of a second round trip disagreeing with the
first.

### E3 — what an item shows

Title, source, the summary, tags and the estimated read/watch time, in both views. Three
details worth naming:

- **The estimate is set in Cormorant italic** (`.text-estimate`), because it is an agent's
  guess and the typography is the disclaimer. `12m read` for an article, `1h 2m watch` for a
  video — the verb comes from the type.
- **A missing estimate says "no estimate yet"**, never `0m`. Null is a real state; the sort
  skill may not have been able to size the page.
- **The summary is the first paragraph only.** Anything under a `## Notes` heading is the
  user's own writing and does not get promoted into a card. Truncation slices by code point
  (`[...str]`), so a non-BMP emoji is never cut into a lone surrogate.

Tags are clickable and set the tag filter.

### E4 — read / reading / done

Three buttons, current one filled, on every card and row. One click, one frontmatter key,
and the note is otherwise byte-identical — asserted in `library-ui-archive.test.ts`.
Nothing on this surface deletes anything; there is no destructive control anywhere in the
feature and therefore no red.

### E6 — "what fits right now"

The card reads `todos.dayLoad(today).free_minutes` — **the same number the Today view
computes** — and hands it to `library.fitting()`. The measured window leads the chip row and
is labelled `free`; fixed windows (10m … 1h 30m) sit beside it for "I actually only have ten
minutes". `fitting()` orders best fit first, so a 40-minute gap surfaces the 35-minute paper
rather than a 4-minute link, and the card says so out loud: *"7 things fit 16h. Longest
first, so the gap actually gets used."*

Each row offers **Start** (sets `reading`) and **Open in Obsidian**. If the day load cannot
be read the card falls back to a 30-minute window and says so quietly rather than going
blank.

### E7 — the anti-guilt mechanic

`runAutoArchive()` runs **once per app session**, the first time Explore mounts. It is a
background courtesy, not a chore, so there is no toast — just a line under the explanation:
*"3 items stepped out on this launch."* A manual **Tidy the queue now** button is there for
anyone who wants to trigger it. (Consequence worth knowing: with the app left open across a
day boundary the automatic pass does not repeat until relaunch. The manual button covers it,
and re-running on every vault change would be pointless churn — the repository writes nothing
when nothing is stale.)

**The copy is most of the feature**, so here it is in full:

> **The queue looks after itself** — Anything still unread after 30 days steps out of the
> queue on its own. Nothing is deleted and nothing moves — the note stays in the vault, stays
> in the Obsidian graph, and still turns up in search. It just stops asking.

Everything else follows from that register:

| Where | Copy |
|---|---|
| The action | **Set aside** / **Put back** — never "archive", "remove", "clear" |
| Its tooltip | "Step this out of the queue. It stays in the vault, the graph and search." |
| The toast | "Set aside. Still in the vault, still in the graph, still in search." |
| On an item nearing the window | "Steps out of the queue in 4 days." |
| On an item already out | "Set aside · still in the vault, still in search" |
| Nothing needed tidying | "Everything in the queue is still recent." |
| Nothing set aside yet | "Nothing has been set aside." + what will happen when something is |
| The whole library set aside | "The queue is clear. It is all still in the vault and still in search." |

There is no countdown to a deletion, because there is no deletion. `setAside` is stated as a
count of things that **stopped asking** — the feature working — never as a backlog.

### Empty states

Four, and none of them reads as failure: nothing saved yet (points at the bot), nothing
matches the filters (offers to clear them, and says everything is still there), nothing set
aside, and the queue is clear. No counts of what is missing, no "you haven't".

---

## Search

A portal overlay at the app root, opened with **⌘K** from anywhere. `⌘⇧K` remains quick
capture — the shift key is what tells them apart, and that separation is asserted live.

- **Keyboard-first.** Type, ↑↓ (wrapping, plus Home/End), ↵ to open, ⌘↵ for the secondary
  action, Esc to close. Focus starts in the input and stays there; Tab is contained inside
  the panel exactly as `Dialog` does it, so focus never walks out behind the scrim.
- **Grouped by kind**, groups ordered by their best hit so the first row is the top match and
  is already selected. The kind chips keep a fixed order with counts, so the filter row does
  not reshuffle while you type.
- **The match is shown in context**, highlighted in gold on `--soft` (not a highlighter
  yellow). The highlighter is loss-free by construction: concatenating its segments returns
  the input exactly, which is asserted for non-BMP text too.
- **S2 filters: kind and date.** Undated hits — a synthesis note is named by ISO week, which
  is not a day — stay visible in **every** window. We cannot prove they fall outside it, and
  guessing in the direction of hiding things is the one mistake this feature cannot afford.
- **What ↵ does is printed on the selected row.** Markdown-backed hits carry a vault-relative
  path and the record *is* the file, so ↵ hands it to Obsidian via `system.openInObsidian`
  and ⌘↵ goes to the surface instead. JSON-backed records have only a surface, so ↵ goes
  there.
- **Nothing is filtered back out.** There is no status or archived predicate anywhere in
  `search.ts`, and there must never be one. That is the load-bearing negative property of
  this whole feature and it is tested from both ends.

### A bug this caught

The overlay's kind/date filters **persisted after it closed**. Narrow to Meals, hit Escape,
reopen and search for something else — and the results were silently narrowed to meals. That
is exactly the failure mode the requirement is about, arriving through the back door. Fixed:
opening resets the filters to wide (the query survives, selected, so typing replaces it).
Verified live — 19 hits → narrowed to 1 → **19 again on reopen**, with "Everything" pressed
and the date window back to "Any time".

---

## Search coverage matrix

One query (`systems`) against the seeded vault, driven in the running app. "Proven" means
observed in the real window, not inferred.

| Kind | Reachable | Path for "open in Obsidian" | ↵ goes to | Proven |
|---|---|---|---|---|
| todo | ✅ 4 hits | — (JSON) | Today | live + test |
| journal | ✅ 2 hits | — (JSON) | Journal | live + test |
| library | ✅ 8 hits | `Library/…md` | Obsidian (⌘↵ → Explore) | live + test |
| brain-dump | ✅ 1 hit | `Brain Dump/School/….md` | Obsidian (⌘↵ → Brain dump) | live + test |
| synthesis | ✅ 1 hit | `Synthesis/2026-W31.md` | Obsidian (⌘↵ → Synthesis) | live + test |
| meal | ✅ 1 hit | — (JSON) | Meals & training | live + test |
| workout | ✅ 1 hit | — (JSON) | Meals & training | live + test |
| purchase | ✅ 1 hit | — (JSON) | Finance | live + test |

**All 8 kinds, 19 hits, 8 groups, from one input.**

### The two requirements, proven

Both were checked in the running app *and* pinned by tests that run the real repository
result through the exact UI pipeline (`applySearchFilters` → `groupHits` → `flattenGroups`).

| | Live result |
|---|---|
| **An archived library item still appears in search** | `library.list()` (the queue) does **not** contain "Paxos made simple"; `search.query('paxos')` returns `library:Paxos made simple`. The three items auto-archived on launch — The Log, Dynamo, the long talk — likewise appear under Library in a `systems` search while being absent from the queue. |
| **A completed todo still appears in search** | `todos.forDate(today)` does **not** contain "Finish the Stripe OA writeup"; `search.query('stripe')` returns `todo:Finish the Stripe OA writeup`. The dropped todo is reachable too. |

Both survive the kind filter (`kind: library` still shows the archived item) and the date
filter, and `throughTheUi(hits)` has the same length as the raw repository result under the
default filters — the UI provably drops nothing.

---

## Verified by running it

Built app (`electron .` over `desvu://app`), `DESVU_VAULT` pointed at a seeded temp vault in
the session scratchpad. **`~/Documents/Dès vu` was never written to** — confirmed after the
fact: `Library/` still empty, 83 journal entries intact, `git status` clean.

The seeder is checked in at `.progress/explore-search/seed-demo-vault.mjs`: 13 library items
across all four types and all three statuses, ages from 1 to 63 days — three of them unread
and past the 30-day window so auto-archive has real work — one already set aside, one with no
estimate; plus todos (open, completed, dropped), journal entries, meals, a workout,
purchases, a brain dump thread and a synthesis note, so every search kind has something to
find.

```
vaultPath   …/scratchpad/demo-vault          # never ~/Documents/Dès vu
on mount    queue 12 → 9,  set aside 1 → 4   # auto-archive ran, 3 items stepped out
card meta   "9 showing · 6 unread, 2 being read, 1 read"
scopes      In the queue 9 · Set aside 4 · Everything 13
filters     type=video → 1 · tag=distributed-systems → 3 · clear → 9
status      clicked "Reading" → frontmatter status: reading, toast "Marked as reading."
search      'systems' → 19 hits, 8 groups, 31 highlighted runs
            'paxos'  → library:Paxos made simple      (paxosInQueue: false)
            'stripe' → todo:Finish the Stripe OA writeup (not in forDate)
keyboard    ↓ ↓ ↑ End Home all move the selection; focus stays in the input
            ↵ → #/today, overlay closed · ⌘↵ on a library hit → #/explore
            Esc closes · ⌘K reopens · Tab wraps inside the panel
            ⌘⇧K opens quick capture and does NOT open search
filters     narrow to Meals (1) → Esc → ⌘K → 19 again, "Everything" pressed, "Any time"
```

Screenshots in `.progress/explore-search/`, both themes:
`shot-explore-{light,dark}.png` · `shot-grid-light.png` · `shot-list-light.png` ·
`shot-setaside-{light,dark}.png` · `shot-queuecare-light.png` ·
`shot-search-{light,dark}.png`.

Two things the screenshots caught and that are now fixed: the date select was being carried
along by the wrapping chip row instead of holding its corner, and the card meta was reporting
the queue's status breakdown while showing a filtered set (it now describes what is on
screen).

---

## Design-system compliance

- **No red anywhere in the feature.** Not for set-aside, not for overdue, not for unread
  counts, not for failed writes. The only destructive-looking action — setting an item aside
  — is a `ghost` button, because it is not destructive. `--danger` is not referenced by any
  file I wrote.
- **Every surface returns exactly one `<Page>`**, loading renders `<Skeleton>` inside cards,
  errors render as a quiet line inside a card.
- **Primitives used as given** — `Card`, `Button`, `Badge`, `EmptyState`, `Select`, `Input`,
  `Eyebrow`, `Skeleton`, `useToast`. Nothing restyled. Set-aside cards are marked with a
  dashed border, not a colour.
- **`CategoryMarker` is not used**, because library items have no `Category` — the shape
  encoding has nothing to encode here. Type is a one-word badge instead.
- **Failure copy says what survived**: "The note is unchanged.", "Nothing was changed — the
  notes are still in `Library/`, and Obsidian can open them directly."
- The **search overlay is a new component**, built from tokens and matching `Dialog`'s scrim,
  panel and focus behaviour. The design-system report anticipated this ("Search (S1–S3). No
  surface owns it yet"), but it is a new pattern and should be written into
  `Moodboard/Design-Brief.md` if it is to stay.

---

## Storage gaps and contract requests

Nothing was worked around; these are reported rather than patched.

1. **`SearchHit` carries no status.** It is `{kind, id, title, snippet, date, path?}`, so the
   UI **cannot label a hit as archived, completed or dropped**. This is the one place the
   feature is weaker than it should be: search is required to reach records the default views
   hide, and right now a user cannot tell from a result row that they are looking at a
   finished todo or a set-aside item. Suggested addition to `@shared/types`:

   ```ts
   export interface SearchHit {
     …
     /** Why this record is not in a default view: 'done' | 'dropped' | 'archived'. */
     state?: string
   }
   ```

   A row could then carry a quiet neutral badge. Today the information leaks only by accident
   — the repository's haystack ends with the raw field values, so a snippet may read
   "… recruiting done".

2. **`searchRepository` builds each snippet from a haystack that begins with the record's own
   title**, so a match near the start produces a snippet that just restates the row above it,
   with raw field tokens ("school open") trailing. Mitigated in the UI by
   `snippetContext(title, snippet)`, which strips the duplicated prefix and hides the snippet
   when nothing meaningful remains. A cleaner fix is a separate prose haystack in the
   repository.

3. **No `library.remove`, by design and correctly** — nothing is ever deleted. Worth stating
   explicitly in `storage.md` so nobody adds one to "complete the CRUD".

4. **Search has no way to open a *result* at its record**, only at its surface. Jumping to a
   specific todo or journal entry would need either a surface-level "focus this id" mechanism
   or a shared UI store slice. Out of scope here; noted for whoever owns cross-surface
   navigation.

5. **Discoverability of ⌘K.** The overlay is only reachable by the shortcut, because
   persistent chrome belongs in `components/shell/GlobalControls.tsx` (design-system agent's
   file) and rule 3 forbids copy-pasting it into a surface's `actions`. A `Search ⌘K` pill
   beside the inbox pill is a two-line change in that file and would make the whole feature
   findable. The Explore filter field carries a hint in the meantime.

---

## Left for later

- **Result virtualization.** The repository caps at 200 hits and the overlay renders them
  all. Fine at this corpus size; the seam is the `groups.map` in `SearchOverlay`.
- **Search-as-you-type cost.** Every keystroke past the 120 ms debounce walks the whole
  vault. Comfortable now; if it ever is not, the seam is `searchRepository.collectCandidates`.
- **Saved searches / recent queries.** Nothing persists between sessions by decision — the
  query survives while the app is open and that is all.
- **Bulk actions in Explore.** No multi-select; each item is set aside or restored on its own.
  Worth revisiting only if the library gets large enough that it is a chore.
