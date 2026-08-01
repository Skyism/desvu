# Brain dump + synthesis — report

**Stage 12.** PRD **B1 · B2 · B3 · B4 · J7 · J8**.
`tsc --noEmit` clean · `electron-vite build` clean · `vitest run` **421 passed / 22 files**,
of which **49 are from this workstream**.
Driven live in real Electron against a seeded temp vault, both themes.

No dependency was added. `app/package.json` is untouched.

> **Second pass, after the orchestrator landed the synthesis API and both format fixes.**
> Everything below has been re-verified against the running app. The two issues this report
> originally raised as blocking are closed; the sections that described them now describe
> what was observed once they were fixed. See **Second pass** at the end for what that pass
> found, including one bug of my own it surfaced.

---

## What landed

| Area | Files |
|---|---|
| Markdown + wikilinks | `renderer/src/components/notes/{parse,wikilinks,format}.ts` |
| Rendering | `components/notes/{Markdown,NoteLink}.tsx` |
| Thread UI | `components/notes/{ThreadList,ThreadReader,NewThreadDialog}.tsx` |
| Barrel | `components/notes/index.ts` |
| Reads + writes | `renderer/src/store/{brainDump,synthesis}.ts` |
| Surfaces | `surfaces/BrainDumpSurface.tsx` · `surfaces/SynthesisSurface.tsx` |
| Tests | `test/braindump-ui-{markdown,append}.test.ts` · `test/synthesis-ui-sources.test.ts` |
| Evidence | `.progress/braindump-synthesis/` — screenshots, the vault seeder, the four files the two writers produced |

Both surfaces return exactly one `<Page>`, every read goes through `useVaultQuery`, every
write is a plain async function ending in `invalidateVault()`, and no vault record is
mirrored into zustand. `store/inbox.ts` was the template.

---

## The markdown decision, and why

**Hand-rolled, ~430 lines, covering the subset this corpus actually contains.** I did not
ask for a dependency. Three reasons, in order of weight:

1. **`[[wikilinks]]` are not markdown.** Every general renderer needs a custom plugin or an
   AST walk to handle them, and resolution has to happen against a vault index only this
   app has. Once that work exists — target/heading/alias splitting, stem matching,
   shortest-path tie-breaks, in-app navigation, attachment embeds, and the unresolved case
   — the library is carrying the easy half.
2. **It emits React elements, never an HTML string.** Nothing in the corpus can reach
   `dangerouslySetInnerHTML`. A note containing `<img src=x onerror=…>` renders as the text
   it is (there is a test). In an Electron renderer that ingests arbitrary fetched pages
   into `Library/`, that is worth more than feature completeness.
3. **A general library would have to be configured *down* anyway** — raw HTML off, and the
   Obsidian dialect (`==highlight==`, `![[embed]]`) added.

Covered: ATX headings, paragraphs with lazy continuation, ordered/unordered/nested/task
lists, blockquotes with lazy continuation, fenced code, thematic breaks, pipe tables with
alignment, `**bold**` `*italic*` `~~strike~~` `==highlight==` `` `code` ``, `[text](url)`,
`<autolink>`, bare URLs, backslash escapes, `[[wikilinks]]` and `![[embeds]]`.

Deliberately not covered: footnotes, definition lists, reference links, setext headings,
raw HTML. **Anything unrecognised degrades to its literal text** rather than vanishing —
that is the one property that matters and it has a test (`does not lose text it cannot
classify`).

Two parsing decisions worth knowing:

- **`_` never opens emphasis mid-word.** `estimate_minutes_left` stays literal. `*` is
  unrestricted. This was the difference between a preview reading `mm_malloc` and
  `mmmalloc`, which the live run caught.
- **Code spans are found before everything else and never re-parsed**, so
  `` `[[not a link]]` `` is text.

### Wikilink resolution — faithful to Obsidian on purpose

A link target is a **file stem**, not a title. That is Obsidian's rule and it is also
exactly what the sort skill emits (`inbox_scan.py`: `link_targets.append(note.stem)`), so
the two agree by construction. Full vault paths resolve too, with or without `.md`. Matching
is case-insensitive and NFC-normalised. A same-stem collision is broken by shortest path
then alphabetically, so the choice is stable across sessions rather than dependent on
directory read order.

The index is built from `brainDump.listThreads()` + `library.list({includeArchived: true})`
— archived items included, because archived is not deleted and a link into one must keep
resolving (E7). `Journal/` is absent, matching the skill's own `LINK_TARGET_EXCLUDE`.

**An unresolved link renders as plain text in the body's own colour.** Not dimmed, not
underlined, not marked, no icon, no red. The only affordance is a tooltip reading
*"<name> — no note by that name yet"*. Verified live: the unresolved span computes to
`rgb(200,192,174)`, byte-identical to the surrounding `--entry`, and it is not a `<button>`.
In Obsidian a link to a note that does not exist is a deliberate act — it marks something
worth writing later — and a corpus like this is mostly forward references, so styling them
as damage would be both wrong and noisy.

Resolved links navigate: a brain-dump target selects that thread in place; anything else
(Library, loose notes) goes to `system.openInObsidian`, since no other surface has a deep
link yet. An `![[photo.jpg]]` embed becomes a chip that opens the real file — vault files
cannot load into the renderer under `default-src 'self'`, and a chip is honest where a
broken `<img>` is not.

---

## Brain dump

**Threads, not days.** The surface is a reader with an append box and no "new note" button
in the body. `## YYYY-MM-DD` headings render as dated dividers (*Tuesday · 14 July 2026*)
rather than as h2s, which is what makes a file read as one running document instead of a
stack of headings. Appending is the primary action; starting a thread is a header button.

Topic groups are ordered by most-recently-touched, with empty topics sunk to the bottom and
shown as "No threads yet." so a folder the sorter just created is visible before it holds
anything. **Topics are freely creatable** — the picker has "A new topic…" revealing a free
text field, because the sort skill invents topics as it goes (PRD §9) and the app must not
make the taxonomy narrower than the skill's. Verified live: a thread created under a brand
new "Reading" topic produced `Brain Dump/Reading/why-i-abandon-books.md`.

Every thread carries **Open in Obsidian** (`system.openInObsidian`).

The append box preserves its text on a failed write. Nothing is cleared until the write
actually landed — losing a capture to a failed write is the worst thing this surface could
do.

---

## The append format — proof, not assertion

I read `inbox_commit.py::apply_braindump` and then **ran it**, rather than trusting the
reading. `test/braindump-ui-append.test.ts` shells out to the real script from
`~/Documents/Dès vu/.claude/skills/sort-inbox/scripts/` (skipping cleanly if it or python3
is absent) and diffs the two vaults. All three round-trip tests run and pass.

**Result: the two writers produce byte-identical files.** Same front matter, same body, same
blank lines, same trailing newline, same md5. (This originally read "everything below the
front matter", because the front matter did diverge; see the section below.) Confirmed both
in the test and by hand in the live app-driven vault.

Three behaviours verified end to end:

1. **App appends → the skill extends it.** The skill found the app's `## 2026-08-01`
   heading and joined that day's section rather than opening a second one; the app's whole
   prefix survived verbatim, `tags: ["213", lab]` included. `diff` showed only the three
   added lines. (`braindump-synthesis/append-app-then-skill.md`)
2. **Skill appends → the app appends on top.** One heading, correct order, no triple
   newlines.
3. **Same-day merges join rather than repeat**, in both directions.

### Two divergences — found here, fixed by the orchestrator, re-verified

Both were in `src/main/repos/brainDumpRepository.ts`, which this workstream does not own, so
they were reported rather than worked around. Neither broke either reader, but they meant a
vault would accumulate two flavours of thread file depending on which writer created it —
the exact failure mode this section exists to prevent.

1. **`appendToThread` introduced a `title:` key the skill never writes.** `toFrontmatter()`
   set it unconditionally; on a skill-created thread the value came from the body's H1, so
   the append copied it into the front matter as well.
2. **`createThread` wrote `title:` in front matter and no `# Title` in the body** — the exact
   inverse of `apply_braindump`.

Both are fixed: `toFrontmatter` no longer emits `title`, and `createThread` writes the H1.
The three tests that pinned the divergence failed the moment the fix landed and now assert
convergence outright — `expect(fromApp).toBe(fromSkill)`, a strictly stronger claim than the
"modulo one frontmatter key" it replaced. (One test name still said "modulo one frontmatter
key" after the update; renamed to `produces byte-identical output to the sort skill`, since a
name that describes the old behaviour is a stale claim about what is being checked.)

**Re-verified end to end through the real UI, not just in the test.** Two vaults from one
pristine file: appended to the first through the running app's textarea and ⌘↵, ran the real
`inbox_commit.py` on the second with the same text and date.

```
$ diff bd-vault/Brain\ Dump/School/approximation-algorithms.md \
       bd-cmpB/Brain\ Dump/School/approximation-algorithms.md
$ md5 -q …/bd-vault/… …/bd-cmpB/…
ea34717db6ba7e49176e32fe1e591460
ea34717db6ba7e49176e32fe1e591460
```

Byte-identical, same hash, no `title:` key on either side. Both writers also agree on the
numeric-looking tag: the seed's `tags: [451]` becomes `tags: ["451"]` from either writer,
because the app parses `451` as a number, `readStringArray` maps it back to a string, and
`quoteIfNeeded` quotes it exactly as Python's `yaml_scalar` does.

**Creation matches too.** Started a thread through the dialog and had the skill create the
same thread from an Inbox line; the two files are identical apart from the topic folder name,
which differed only because both had to exist side by side to be compared. Both now carry
`topic/created/updated/tags` and `# Why I abandon books` as the body's H1.
`braindump-synthesis/create-by-{app,sort-skill}.md` have been regenerated against the fixed
code, so they are evidence of the current behaviour rather than of the old divergence.

**One cosmetic nit in the skill, not the app:** `apply_braindump`'s same-day merge leaves
the file ending in two newlines (`doc[insert_at:].lstrip("\n")` is empty at the tail). The
app normalises it away on its next write and Obsidian does not care.

---

## Synthesis

A reading surface, not a dashboard: one column, `band` card, Cormorant at 19px, measure
capped at 68 characters, no charts. Week navigation is prev/next through the weeks that
exist. Below the write-up, a **Sources** card lists every distinct record the week cites, in
first-mention order — the audit of B3. Embeds and same-note `[[#Section]]` references are
excluded, so a week whose only links are its own headings reads as uncited, which it is. A
week with no citations says so plainly instead of quietly rendering unverifiable claims.

### `/ask` is honestly not built

The field is present, **disabled**, and labelled `not built yet`, with the hint *"Inert.
Nothing is sent anywhere and no answer is generated."* No stub response, no spinner that
resolves to nothing, no fabricated citation. The copy says what will happen when the agent
exists and what does the job today. A faked answer would be indistinguishable from a real
one and would destroy the only thing this surface sells, which is that claims are checkable.

### J8 indicator

Both values are shown with the active one marked *· in effect*, so the setting teaches
itself. Copy, verbatim:

> This is enforced by a *projection in the repository*, not by an instruction in a prompt.
> When it reads `metadata` there is no code path that returns prose at all, so a model
> cannot be argued, tricked or jailbroken past it.

and, separately:

> Journal prose is stored only on this Mac and in your iCloud — never in Telegram, never in
> a database, never pushed to a remote (J4). This setting governs only what an agent may
> read at the moment it is asked to.

That second paragraph is deliberately precise. J4 is a claim about data **at rest**; PRD §3
is explicit that what an agent reads at request time does leave the machine, governed by J8.
Saying "the journal never leaves the Mac" flatly would be the comforting version and the
false one. Verified live in both states: with `journal_access: "metadata"` the gold marker
moves to `metadata` and `full` goes muted.

---

## The synthesis API — requested, landed, confirmed

This report originally blocked here: there was no `synthesis` domain on `DesvuApi`, so the
renderer had no way to read a week's body. `search.query()` returns a ~140-character snippet,
`brainDump.readThread` is boundaried to `Brain Dump/`, and `window.desvu` is non-writable,
non-configurable and frozen — correct posture, and it meant there was genuinely no route
around it from the renderer, not even a shim for a demo.

The orchestrator landed exactly the requested shape: `SynthesisNote { path, week, body }`,
`synthesis.list()` / `synthesis.read(week)`, and `synthesisRepository` with `read()`
rejecting anything that is not an ISO week key rather than joining it into a path.

**The runtime detection worked with no change from this workstream — confirmed, not
assumed.** `store/synthesis.ts` probes for the domain rather than assuming it, and the
preload builds `window.desvu` mechanically from `IPC_CHANNELS`, so the surface switched from
its unavailable state to the real reader on the first launch after the rebuild:

```
domains            [… brainDump, synthesis, inbox …]     ← present
stillSaysNotWired  false
cards              ["27 Jul – 2 Aug 2026", "Sources", "Ask", "What agents may read"]
proseStyle         { font: "Cormorant", size: "19px" }
frontMatterLeaked  false
```

One thing worth recording, because it is a seam that could have failed silently:
**`synthesisRepository` returns the whole file in `body`, front matter included.** The field
name suggests otherwise. It renders correctly because `parseNote()` strips a leading fence
tolerantly, and `citedTargets()` goes through the same parser — so `week: 2026-W31` and
`generated: 2026-08-02` do not leak into the prose. Verified explicitly
(`frontMatterLeaked: false`) rather than assumed. Nothing needs changing; noting it so the
next person to touch either side knows the two halves are doing complementary work.

Also confirmed now that real weeks exist: **`[[2026-W30]]` resolves week-to-week.** Synthesis
notes are folded into the wikilink index, so a citation from one write-up to an earlier one
resolves and switches the reader in place — week 31 → week 30, eyebrow, body and Sources card
all following. This was described as intended behaviour in the first pass and could not be
exercised then.

The two states remain distinct, which was the point of building it this way: *"This week
hasn't been written yet"* (the agent has not run) is not the same fact as *"the weekly reader
isn't connected"* (the app cannot read the folder), and the second no longer occurs.

---

## Verified by running it

Real Electron (`electron .` over `desvu://app`), `DESVU_VAULT` pointed at a seeded temp
vault, driven over CDP. **Nothing was ever written to `~/Documents/Dès vu`.** The seeder is
`braindump-synthesis/seed-vault.mjs` — 8 threads across 6 topics (including one the sorter
would have invented), a Library item, a synthesis note, `settings.json`.

- **Browse** — 6 topic groups, threads ordered by recency, previews truncated, `8 across 6 topics`.
- **Read** — Cormorant 19px, dated dividers, ordered lists, task lists with static
  checkboxes, fenced code, a pipe table (DM Sans, right-alignment honoured), an italic
  Cormorant blockquote, an attachment chip.
- **A wikilink that resolves** — `[[systems-design-interviews|the interview thread]]` renders
  gold with the tooltip *"Open the Systems design interviews thread"*, and clicking it moved
  the reader from *Malloc lab* to *Systems design interviews* and moved the sidebar
  selection with it. A library target (`[[…ddia-ch4|DDIA ch.4]]`) offers Obsidian instead.
- **A wikilink that does not** — `[[How I choose what to work on]]` is a `<span>`, not a
  button, in the body's exact colour.
- **Append** — typed into the box, ⌘↵, toast, box cleared, a new *Saturday · 1 August 2026*
  divider appeared, and the file on disk gained the block. Checked as bytes: single trailing
  LF, no CRLF, no `\n\n\n`, no trailing whitespace on any line.
- **Round trip** — ran the real `inbox_commit.py` against that same file; it merged into the
  app's own day section and changed nothing else.
- **`vaultChanged`, live** — with the reader open on *Approximation algorithms*, `/sort-inbox`
  wrote to that file from outside the app. The new dated block appeared **with no refetch and
  no reload**. That is the watcher → revision bump → `useVaultQuery` re-run path, proven.
- **Create** — new topic "Reading" via the dialog → new folder, correct slug, dated block.
- **Empty vault** — *"No threads yet."* naming the seeded topics. No count of what is
  missing, no "you haven't".
- **Both themes** — `rgb(253,250,243)` / `rgb(11,10,8)`.
- **The synthesis reader** — two weeks listed newest first, write-up in Cormorant, front
  matter stripped, table rendered, week navigation, Sources recomputing per week.

`braindump-{light,dark}.png` · `braindump-table-light.png` · `braindump-empty-light.png` ·
`braindump-newthread-dark.png` · `synthesis-{light,dark}.png`

### Two bugs the live run caught that tests would not have

1. **`truncate` was growing the box instead of clipping.** A `<button>` carries
   `align-items: flex-start` from the UA sheet, so its flex children are not stretched to
   its width — they take max-content and overflow the card. `min-w-0` does not fix it;
   `w-full` does. Previews were running 398px inside a 244px row and painting under the
   reader card.
2. **A literal NUL byte in the source.** The "A new topic…" sentinel had been written as
   `'\x00new'`, so the `<option>` value never matched the `<select>` value and the new-topic
   field could not be reached. Now `'::new'`, with the topic list filtered against it
   defensively. Every file in this workstream was scanned; no NUL bytes remain.

---

## Rules, and where they are held

| Rule | Where |
|---|---|
| Red is destructive only | No `danger` tone is used anywhere here. A failed append renders through `Field`'s gold `error`; a failed read is a quiet line in a card. |
| Cormorant for prose, DM Sans for tools | Thread bodies and the write-up are `font-serif` at 19px; tables, metadata, chrome and previews are DM Sans. Italic is always Cormorant. |
| Empty is just empty | "No threads yet." · "This week hasn't been written yet." No counts of what is missing, no second person accusative. |
| The vault changes underneath you | No cache anywhere. Every read is `useVaultQuery`; proven live against an external writer. |
| Never write markdown Obsidian can't render | Asserted as bytes in `braindump-ui-append.test.ts`, and every seeded/round-tripped file was re-read by both parsers. |

---

## Tests — 49 new

| Suite | Tests | Covers |
|---|---|---|
| `braindump-ui-markdown` | 30 | inline marks, `snake_case` not emphasis, code spans opaque, escapes, links/autolinks/bare URLs, external images as links, **raw HTML stays text**, wikilink target/heading/alias, embeds, attachment detection, resolution by stem/path/case, **unresolved returns null**, shortest-path tie-break, the `SCHEMAS.md` thread shape, nested and task lists, ordered-list start, fenced code, quotes/rules/tables, wikilinks found in every container, **unclassifiable text survives**, relative dates that never count a gap, code-point-safe previews, ISO weeks |
| `braindump-ui-append` | 7 | dated block into the existing file (file count stays 1), exact bytes, Obsidian-safe shape, same-day join, re-read by the app's own parser, **the real `inbox_commit.py` side by side**, skill-extends-app, app-extends-skill |
| `synthesis-ui-sources` | 12 | a realistic write-up parses, citations in first-mention order, `[[#Section]]` and embeds are not citations, an unsourced week reports as unsourced, citations resolve against the note index, aliases, ISO week naming incl. the 53-week year and the January boundary, unrecognised names left alone |

---

## Second pass — after the API and the format fixes landed

Re-verified in the running app, against a seeded vault now holding **two** synthesis weeks so
week-to-week citation could be exercised for the first time.

- **The write-up renders.** Cormorant 19px, dated header, pipe table in DM Sans, citations
  inline as gold links, prev/next week navigation. Front matter does not leak.
- **Sources** lists all seven cited records for week 31 and recomputes to two for week 30.
- **`[[2026-W30]]`** switches the week in place; **`[[malloc-lab]]`** crosses to Brain dump,
  selects the thread and opens it in the reader; **`[[…ddia-ch4]]`** offers Obsidian.
- **Append is byte-identical to `/sort-inbox`**, driven through the real textarea, same md5.
- `tsc --noEmit` clean, build clean, **421 tests pass**.

### One bug of mine this pass surfaced

**A tooltip was promising the wrong thing.** `<WikiLink>` derived its title from `ref.kind`,
so a resolved synthesis citation read *"Open Synthesis/2026-W30.md in Obsidian"* while
clicking it actually read the week in place. Only the surface knows where its own `openNote`
goes — Synthesis reads a cited week inline, Brain dump hands the same note to Obsidian — so a
label derived from `kind` alone is wrong on one of them no matter which branch you write.

Fixed by moving the label next to the behaviour: `NoteLinkProvider` now takes
`describeNote(ref)` alongside `openNote`, defaulting to "open in Obsidian", and each surface
supplies one that matches its own navigation. Every tooltip was then re-read from the live
DOM and each matches its click: *"Read Week 30 · 2026"*, *"Open the Malloc lab thread"*,
*"Open Library/2026-07-28-ddia-ch4.md in Obsidian"*.

### One alignment fix

With a real write-up on screen, the Synthesis surface had two left edges: the write-up column
was centred inside the band (`mx-auto`) while the Sources, Ask and journal-access cards below
it were left-aligned. Dropped `mx-auto` from both the write-up and its loading skeleton, so
the whole surface shares one left edge with the page title (measured: h1 at 260px, card
content at 289–293px, the 4px spread being the `band` variant's own padding). The band still
runs full width; only the measure is capped.

## Left for later

- **`/ask`**, blocked on an agent that does not exist. The surface is honest about it.
- **Obsidian `aliases:`.** Resolution matches file stems only, faithfully. If threads ever
  grow an `aliases` front-matter key, `buildNoteIndex` should index those too — it is one
  line, and it would make `[[Systems design interviews]]` resolve as well as
  `[[systems-design-interviews]]`.
- **A settings surface owns the J8 toggle.** This surface only reports it and says where the
  file is; `settings.update()` exists whenever someone wants to make it editable.
- **Library items have no in-app reader**, so a wikilink into one opens Obsidian. If Explore
  grows a deep link, `openNote` in both surfaces is the single place to change.
- **Backlinks.** The index knows every link; showing "3 threads link here" on a thread is
  cheap and was out of scope.

## Noted in passing

- `~/Documents/Dès vu` was, mid-session, a real directory holding only seed data rather than
  the symlink — the orchestrator has since restored it and hardened `isVault()`. Everything
  in this workstream went through an explicit `DESVU_VAULT`, so nothing here touched or
  depended on the stray, and the round-trip evidence above was re-run against the restored
  path.
- Mid-session `tsc --noEmit` briefly reported 39 errors in
  `src/main/repos/financeRepository.ts` and `test/finance-ui-budget.test.ts` — a sibling
  workstream mid-edit against a `CategorySpend.configured` field. None were in any file
  owned here, and they have since cleared: the final pass is **clean across the whole
  tree**, with the build and all 414 tests green.
