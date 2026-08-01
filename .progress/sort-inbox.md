# `/sort-inbox` — the sort skill

**Status:** landed and verified against a fixture vault. Stage 3 (bot + sort skill), skill half.

## What shipped

```
<vault>/.claude/skills/sort-inbox/
  SKILL.md                    3.0k words — workflow, idempotency, routing table, worked examples
  references/routing.md       2.6k words — per-field inference rules, loaded on demand
  scripts/inbox_scan.py       read-only scanner; emits the whole routing context as JSON
  scripts/inbox_commit.py     validates + applies a routing plan atomically, then marks lines
<vault>/.claude/commands/sort-inbox.md    slash-command shim
```

Nothing outside `<vault>/.claude/` was touched. `PRD.md`, `SCHEMAS.md` and all existing vault
content are unmodified; `git status` in the vault shows only the new `.claude/` tree.

## Routing logic

The skill runs six steps: **scan → route → ask once → commit → report → git commit.**

| Input shape | Target | Destination |
|---|---|---|
| something to do | `todo` | `data/todos.json` — category, priority 0–3 (default 2), inferred `estimate_minutes` |
| money out (or in) | `purchase` | `data/finance.json` → `purchases[]` |
| food eaten | `meal` | `data/meals.json`, `estimated: true` when the numbers were guessed |
| training done | `workout` | `data/workouts.json` |
| a URL | `library` | `Library/YYYY-MM-DD-slug.md` with full frontmatter |
| a thought / idea / reflection | `braindump` | `Brain Dump/<topic>/<thread>.md` |
| untranscribed voice note | `todo` | a 5-minute "listen and file it" task carrying the audio wikilink |
| genuinely ambiguous | `skip` | stays raw and unchecked in the Inbox |

**Tense is the primary discriminator.** Past tense logs a fact; future tense or an imperative
creates a task. "run 5k" has neither, which is precisely why it is one of the fixture's
deliberate ambiguities.

Judgement calls encoded in the docs, with rationale:

- **Fan-out.** One line can produce several records. `references/routing.md` splits folded
  lists into one todo per commitment, and a thought containing a concrete commitment into a
  Brain Dump append *plus* a todo. The line still gets exactly one marker, naming every
  destination.
- **Reflections.** Anything that reads like journaling routes to `Brain Dump/Personal/` and
  the run summary says so out loud, so its absence from `Journal/` is never a surprise (C7).
- **Capture is never blocked.** An unknown finance category logs as itself; an
  unidentifiable meal logs with `null` calories; a URL that won't fetch still becomes a
  Library note.
- **`estimated_minutes` on Library items** is treated as load-bearing (video runtime, article
  word-count ÷ 240) because E6 reads it. `null` is preferred over a fabricated number.
- **Wikilinks come from a whitelist.** The scanner emits `context.link_targets` built from
  files that actually exist, excluding `Journal/` (C7), `Inbox/`, `Attachments/` and
  `.impeccable/` tool output. The skill is told never to link outside it — a dead graph node
  is worse than no link. Library notes have date-prefixed stems, so the docs require an alias:
  `[[2026-07-28-…-ch4|DDIA ch.4]]`.
- **Ask policy.** Ambiguous lines are skipped, then asked about in **one batch at the end**,
  capped at four questions, and only when two targets are plausible *and* a wrong guess is
  annoying to undo. Everything else is guessed and flagged as low-confidence in the summary.

## Idempotency mechanism

**A marker appended to the line is authoritative. The checkbox is only a mirror of it.**

```
- [x] 14:32 · telegram · email the Ramp recruiter <!-- sorted 2026-08-01 → data/todos.json -->
```

This is the design decision that makes the mechanism survive hand-editing in Obsidian.
Clicking a checkbox in reading view toggles it, so the box drifts; the marker does not.

| Checkbox | Marker | Meaning | Behaviour |
|---|---|---|---|
| `[ ]` | absent | not yet sorted | route it |
| `[x]` | present | sorted normally | skip |
| `[ ]` | present | stray Obsidian click | **skip routing**; `--repair` re-ticks the box |
| `[x]` | absent | user handled it themselves | skip, leave entirely alone |

The last row is deliberate: hand-ticking means "don't file this", and un-ticking an unmarked
line means "please file this". Both are honoured, so the user can steer the sorter by
clicking.

Three further guards behind it:

1. **Deterministic ids.** Every JSON record's `id` is a uuid5 of `(target, created_at,
   normalized text)`. Re-filing a capture produces the *same* id, so the commit script's
   dedupe pass catches it even when no marker exists — which is what makes a crash between
   "record written" and "line marked" safe.
2. **Fingerprint interlock.** Each action carries a hash of the raw line from the scan. If
   the line changed in between, the commit is rejected rather than applied to the wrong line.
3. **Content dedupe** on Library `url` and on Brain Dump body text.

Writes are temp-file + `os.replace` in the same directory, one read-modify-write per tracker.
A malformed tracker aborts the whole run (exit 2) rather than being overwritten. Validation
of every action happens before any write, so a single bad action means nothing is written.

## Fixture walkthrough — what it surfaced

A fixture vault was built in scratch (never the real vault) with seeded Brain Dump threads, a
Library item, an existing todo, real settings, and an Inbox of 15 unsorted lines spanning
every routing target plus control lines (already-sorted, hand-checked, marker-without-check,
and a non-checkbox line). Two lines are deliberately ambiguous: `jane street` and `run 5k`.
The plan produced 18 actions from those 15 lines.

Five things the walkthrough changed:

1. **Fan-out broke line marking.** Two actions on one line made the second mark attempt see a
   fingerprint that no longer matched, and emit a spurious error. `mark_lines` now merges
   destinations per line and marks once: `<!-- sorted … → data/todos.json, Brain Dump/School/malloc-lab.md -->`.
   Without the fixture this would have shipped broken, since fan-out is common.
2. **Replaying a stale plan produced a misleading error.** The fingerprint check fired before
   the marker check, so a double-run reported "the line changed" when the truth was "already
   filed". Reordered — the message now names the real cause and says to re-scan.
3. **An unfetched Library placeholder was permanent.** A URL that failed to fetch created a
   placeholder note; re-sending the same URL later, successfully fetched, just deduped
   against it and threw the good metadata away. Added `enrich_library`: a note tagged
   `unfetched` is upgraded in place — title, type, tags, estimate, summary — while
   `status`, `saved`, `archived` and everything under `## Notes` are preserved. Verified that
   a hand-written user note survives enrichment.
4. **Same-day double-append duplicated the heading.** Two thoughts landing on one thread on
   one day created two `## 2026-08-01` blocks. The commit script now extends the existing
   day's section instead.
5. **The fan-out hint missed comma-separated lists.** `multiline_folded` only fired on long
   lines and bullet runs, so "need to: book the flight, email prof, and send Ramp my
   transcript" wasn't flagged. Broadened to ≥2 commas with ≥14 words.

Verified behaviours (all re-run after the fixes):

- Full run: 15 lines → 16 records applied, 2 skipped, 1 checkbox repaired, 0 errors.
- **Run twice**: re-scan finds only the 2 ambiguous lines; replaying the same plan exits 1
  with nothing written; trackers byte-identical; zero duplicate ids and zero duplicate
  `(created_at, text)` pairs across all four trackers.
- **Stray Obsidian click**: un-ticking two sorted boxes does *not* re-route them; `--repair`
  re-ticks both.
- **Simulated crash**: stripping a marker after the record was written re-files nothing —
  the deterministic id deduped it and the line was re-marked.
- **Malformed tracker**: both scripts exit 2 and write nothing.
- **Late-arriving out-of-order line**: a 06:05 capture sitting at the bottom of the file got
  `created_at` earlier than every line above it, proving position is never used.
- `Journal/` is empty after every run.

## Accounting for the bot's actual behaviour

Three properties of the shipped bot are handled explicitly:

- **Send-time stamps.** A day-file is never finished — `Inbox/2026-08-01.md` can gain lines on
  the 3rd. The scan therefore defaults to **every** `Inbox/*.md`, and the docs warn against
  narrowing it. Lines are never assumed chronological; `created_at` comes from each line's own
  `HH:MM`. The scan reports `out_of_order` per file so it reads as expected rather than as
  corruption.
- **Newlines folded to spaces.** Documented as the main source of fan-out, with splitting
  rules for lists and an instruction to *restore* paragraph and list structure when writing a
  folded thought into a Brain Dump thread.
- **OCR yes, transcription no.** Photo lines route on their OCR text, with a warning that OCR
  is noisy (the fixture's receipt line contains real OCR artefacts — `0AT MILK`, `11.4O`) and
  that raw OCR must never be pasted into a record. Untranscribed voice notes are flagged by
  the scanner (`untranscribed_voice: true`) and routed to a 5-minute `personal` todo —
  "Listen to the voice note from 2026-08-01 23:10 and file it" — with the audio wikilink in
  `notes`. Priority 2 rather than 3 is deliberate: `someday` would let it sink. This defers
  rather than sorts, and the skill is required to say so in the run summary.

## Known limitations

- **Write race with the app's storage layer.** The skill cannot see the main-process mutation
  lock. If the app writes a tracker between this skill's read and its write, that write is
  lost — the skill rewrites the file whole. Window is milliseconds and the vault is under git,
  but the documented advice is **run `/sort-inbox` with the app closed**, and the skill is told
  to say so in its summary if the app is open. *If the storage layer ever exposes a
  lock-aware CLI or an IPC entry point, `inbox_commit.py` should go through it instead — happy
  to switch, it's one function.*
- **iCloud sync.** Writes are atomic, so no half-written file is ever visible, but a file
  being pulled down mid-run can still produce a conflict copy.
- **Fingerprint interlock is per-line.** Editing a *different* line between scan and commit is
  fine; adding or removing lines shifts numbering and the fingerprint check catches it.
- **No recurrence inference.** "gym every monday" files as a one-off todo; `recurrence` stays
  `null` because templates are the app's job (T10).
- **Voice note content never reaches the corpus** until a transcriber exists — only a pointer
  does.
- **Enrichment only upgrades `unfetched` Library notes.** A successfully-fetched note is never
  overwritten by a later capture of the same URL.

## Open questions for the orchestrator

1. **Git commit on every run.** The skill ends with `git add -A Inbox data Library "Brain Dump"
   && git commit` per PRD §9's stated mitigation, skipped on `--no-commit`. Confirm that is
   wanted as automatic behaviour rather than something the user triggers.
2. **Untranscribed-voice policy.** Routing to a todo is my call, chosen over leaving the line
   unsorted (it would re-surface every run and clutter) and over a dedicated Brain Dump thread
   (nothing would ever resurface it). Easy to change if a transcriber lands.
3. **`settings.json` doesn't exist yet** in the real vault — the scan falls back to the
   documented defaults (`priority 2`, `estimate 30`, empty finance categories). Once the
   storage layer seeds it, no skill change is needed.
