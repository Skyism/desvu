# Journal migration — stage 7 (migration half)

**Status: done.** 83/83 entries imported into `<vault>/data/journal.json`, verified
lossless against the source. Ran 2026-08-01.

| | |
|---|---|
| Source | `~/Desktop/Vscode/gratefulnessjar/.gratefulness-data/entries.json` (untouched, sha256 `eb4671ad…`) |
| Target | `~/Documents/Dès vu/data/journal.json` — 83 entries, 28950 bytes, sha256 `b59decf04fa73c7e…` |
| Script | `app/scripts/migrate-journal.mjs` (+ `app/scripts/README.md`) |
| Files touched | those three only. Nothing under `app/src/`. Source data never written. |

The vault is a git repo; `data/journal.json` is currently untracked, so the
migration is trivially revertible with `rm data/journal.json` (and re-runnable).

---

## How to run it

```bash
cd ~/Desktop/Vscode/desvu/app

npm run migrate:journal -- --dry-run    # report only, writes nothing
npm run migrate:journal                 # migrate for real
```

`package.json` already carried the `migrate:journal` script; no change was needed.
Flags: `--dry-run` `--force` `--source=PATH` `--out=PATH` `--quiet` `--help`.
`DESVU_VAULT` relocates the vault (used to exercise the guards against a sandbox).

**Dry-run first, always.** The dry run computes the exact payload it would write and
prints its byte count and sha256. Those matched the real run exactly
(28950 bytes / `b59decf0…` both times), which is the proof that the real run wrote
precisely what the dry run promised.

---

## Dry run (fresh, before anything existed)

```
Dès vu — journal migration
  source  /Users/jeffreyshen/Desktop/Vscode/gratefulnessjar/.gratefulness-data/entries.json
  target  /Users/jeffreyshen/Documents/Dès vu/data/journal.json
  mode    DRY RUN — nothing will be written

── source ────────────────────────────────────────────────────────────
  read 83 records
  ok    all 83 records valid (ids, dates, 1-7 ratings, timestamps)
  note  a stale entries.json.tmp sits beside the source; it is ignored by design.
  ok    83 distinct entry_dates — no same-day collisions

── data profile (derived from the real bytes) ────────────────────────
  first entry           2025-12-31
  last entry            2026-07-29
  days spanned          211
  days with entries     83
  adherence             39.34%
  median gap            1 day(s)
  longest gap           24 days (2026-07-04 -> 2026-07-28, 23 missed days)
  entries later edited  16
  mean rating           4.33

  rating distribution (scale is 1-7)
    1    2    2.4%  ██
    2    3    3.6%  ███
    3   10   12.0%  ███████████
    4   28   33.7%  ██████████████████████████████
    5   32   38.6%  ██████████████████████████████████
    6    7    8.4%  ███████  <- would be lost by a 1-5 clamp
    7    1    1.2%  █  <- would be lost by a 1-5 clamp
    entries rated 6 or 7: 8

  month by month (denominator = days of that month inside the span)
    2025-12    1 /  1 days  100.0%
    2026-01   31 / 31 days  100.0%
    2026-02   16 / 28 days   57.1%
    2026-03   10 / 31 days   32.3%
    2026-04   10 / 30 days   33.3%
    2026-05    5 / 31 days   16.1%
    2026-06    6 / 30 days   20.0%
    2026-07    4 / 29 days   13.8%

  five longest gaps
     24 days   2026-07-04 -> 2026-07-28
     20 days   2026-03-24 -> 2026-04-13
     12 days   2026-05-23 -> 2026-06-04
     10 days   2026-02-12 -> 2026-02-22
      8 days   2026-03-11 -> 2026-03-19

── PRD claim check ───────────────────────────────────────────────────
  HOLDS  total entries                    PRD says 83      actual 83
  HOLDS  days spanned                     PRD says 211     actual 211
  HOLDS  overall adherence                PRD says 39%     actual 39.34%
  HOLDS  first full month adherence       PRD says 100%    actual 100%
  HOLDS  last month adherence             PRD says 14%     actual 13.79%
  HOLDS  longest gap between entries      PRD says 24 days actual 24 days
  HOLDS  median gap between entries       PRD says 1 days  actual 1 days
  HOLDS  entries rated 6 or 7             PRD says 8       actual 8

  Every documented figure reproduces from the source. No PRD correction needed.

── target ────────────────────────────────────────────────────────────
  journal.json does not exist yet — this is a fresh migration

── plan ──────────────────────────────────────────────────────────────
  to import               83
  already present (kept)  0
  target-only (kept)      0
  final entry count       83
  payload                 28950 bytes, sha256 b59decf04fa73c7e…
  date range              2025-12-31 … 2026-07-29

── write (skipped — dry run) ─────────────────────────────────────────
  would write 83 entries (28950 bytes) to /Users/jeffreyshen/Documents/Dès vu/data/journal.json
  would write atomically: temp file in data/, fsync, rename(2)
  nothing was written; the target is unchanged

── losslessness verification (re-read, compared field by field) ──────
  ok    entry count: 83 (expected 83)
  ok    every one of the 83 source entry_dates is present in the output
  ok    all 83 ids preserved
  ok    all 83 gratitude_text values byte-identical (UTF-8 compared)
  ok    all 83 ratings preserved exactly
  ok    all 83 created_at/updated_at pairs preserved
  ok    8 above-5 ratings survived UNCLAMPED: 2026-01-04=6, 2026-01-12=6, 2026-01-19=6,
        2026-01-15=6, 2026-02-07=6, 2026-04-20=6, 2026-07-04=7, 2026-07-01=6
  ok    no field diverged anywhere

── result ────────────────────────────────────────────────────────────
  DRY RUN CLEAN — 83 entries ready to import, verified lossless in memory. Nothing written.
```

Confirmed afterwards that `data/journal.json` still did not exist and no temp files
had been left anywhere. The dry run really is inert.

## Real run

Identical up to the write; the differing part:

```
  mode    LIVE — will write

── plan ──────────────────────────────────────────────────────────────
  to import               83
  final entry count       83
  payload                 28950 bytes, sha256 b59decf04fa73c7e…

── write ─────────────────────────────────────────────────────────────
  ok    wrote 28950 bytes to /Users/jeffreyshen/Documents/Dès vu/data/journal.json
  ok    file re-read from disk is byte-identical to the payload
  ok    sha256 matches on re-read (b59decf04fa73c7e…)

── losslessness verification (re-read, compared field by field) ──────
  ok    entry count: 83 (expected 83)
  ok    every one of the 83 source entry_dates is present in the output
  ok    all 83 ids preserved
  ok    all 83 gratitude_text values byte-identical (UTF-8 compared)
  ok    all 83 ratings preserved exactly
  ok    all 83 created_at/updated_at pairs preserved
  ok    8 above-5 ratings survived UNCLAMPED: …
  ok    no field diverged anywhere

── result ────────────────────────────────────────────────────────────
  MIGRATION COMPLETE — 83 entries in journal.json, verified lossless against the source.
```

Same sha256 as the dry run predicted, byte for byte.

---

## Verification performed

The script's own checks are listed above. Because "it verified itself" is a weak
claim, the written file was **also** verified independently in Python, without using
the migration code at all:

| Check | Result |
|---|---|
| File is valid UTF-8, 28950 bytes, sha256 `b59decf0…` | pass |
| Entry count source 83 = output 83 | pass |
| Set of `entry_date` values identical | pass |
| Every `gratitude_text` byte-identical (compared as encoded UTF-8) | pass, 0 mismatches |
| Every `id`, `rating`, `created_at`, `updated_at` identical | pass, 0 mismatches |
| Rating histogram identical `{1:2, 2:3, 3:10, 4:28, 5:32, 6:7, 7:1}` | pass |
| Max rating in output is **7** (a 1–5 clamp would show 5) | pass |
| Emoji entries (3 × 💀) byte-equal and NFC-stable | pass |
| No unexpected keys vs `JournalEntry`; no nulls; optionals absent not null | pass |
| Sorted by `entry_date` ascending; schema key order; trailing newline | pass |
| Source `entries.json` sha256 unchanged after the run | pass |

Behavioural guards were exercised against a sandbox vault (`DESVU_VAULT`), then deleted:

| Scenario | Behaviour |
|---|---|
| Re-run on a populated target | 0 imported, 83 preserved, byte-identical output, same sha256 — **idempotent** |
| Target holds an entry not in the source, no `--force` | aborts, names the offending `entry_date`, writes nothing |
| Same, with `--force` | proceeds; the pre-existing app entry survives intact including its `learned` field |
| Entry edited in the app (rating changed, `mood_word`/`learned` added), then re-run | app edits **preserved**, divergence reported as a warning, not silently overwritten |
| Source rating of 9 and of 0 | aborts before writing — refuses to clamp |
| Corrupt source JSON | aborts with the parse error, writes nothing |
| Duplicate `entry_date` in source | deduped to one, keeps the more recently updated, warns |

No stray `.tmp` files were left in the vault by any run.

---

## Data profile — the real numbers

**Span**

| | |
|---|---|
| First entry | 2025-12-31 |
| Last entry | 2026-07-29 |
| Days spanned (inclusive) | **211** |
| Days with entries | **83** |
| Adherence | **39.34%** |
| Median gap between entries | 1 day |
| Longest gap | **24 days** (2026-07-04 → 2026-07-28), i.e. 23 consecutive missed days |
| Entries edited after creation | 16 of 83 |
| Mean rating | 4.33 |

**Rating distribution** (scale 1–7)

| Rating | Count | Share |
|---|---|---|
| 1 | 2 | 2.4% |
| 2 | 3 | 3.6% |
| 3 | 10 | 12.0% |
| 4 | 28 | 33.7% |
| 5 | 32 | 38.6% |
| **6** | **7** | **8.4%** |
| **7** | **1** | **1.2%** |

**8 entries rated above 5** — exactly as documented. Specifically 7 sixes and 1
seven, on 2026-01-04, 01-12, 01-15, 01-19, 02-07, 04-20, 07-01, and 2026-07-04 (the
7). Clamping to 1–5 would have altered 9.6% of the corpus and flattened the entire
top of the distribution.

**Month by month.** Denominator is days of that month falling inside the observed
span, which is why December (one day) and July (29 days) are partial.

| Month | Entries | Days in span | Adherence |
|---|---|---|---|
| 2025-12 | 1 | 1 | 100.0% |
| 2026-01 | 31 | 31 | 100.0% |
| 2026-02 | 16 | 28 | 57.1% |
| 2026-03 | 10 | 31 | 32.3% |
| 2026-04 | 10 | 30 | 33.3% |
| 2026-05 | 5 | 31 | 16.1% |
| 2026-06 | 6 | 30 | 20.0% |
| 2026-07 | 4 | 29 | 13.8% |

**Five longest gaps:** 24 days (Jul 4 → Jul 28), 20 (Mar 24 → Apr 13), 12
(May 23 → Jun 4), 10 (Feb 12 → Feb 22), 8 (Mar 11 → Mar 19).

The shape backs the PRD's reading. January is a perfect month — 31 for 31. February
halves. From March on it sits between 16% and 33% with multi-week dropouts. This is
not gradual erosion; it is a habit switching off and being restarted with effort,
four or five distinct times. That is the direct evidence for **J6** (never show a
broken streak) and **J0** (a rating alone is a complete entry): every one of those
gaps is a re-entry moment, and re-entry friction is what the product has to survive.

---

## Did the PRD's figures hold up?

**Yes — all of them. No corrections needed.** Every documented figure was re-derived
from the source bytes and reproduces:

| PRD claim | Where | Actual | Verdict |
|---|---|---|---|
| 83 entries | §2, SCHEMAS.md | 83 | holds |
| over 211 days | §2 | 211 | holds |
| 39% average adherence | §3 metrics table | 39.34% | holds |
| decay from 100% (Jan) … | §2 | 100.0% (31/31) | holds |
| … to 14% (Jul) | §2, §3 | 13.79% (4/29) | holds |
| longest gap 24 | §2, §5 (J6 rationale) | 24 days | holds |
| median gap 1 day | §2, §5 | 1 day | holds |
| 8 entries rated 6 or 7 | §5 (J0), §9, SCHEMAS.md | 8 (seven 6s, one 7) | holds |

The "8 entries carry a 6 or a 7" figure that justifies the 1–7 scale is exactly
right, so `Rating = 1|2|3|4|5|6|7` in `shared/types.ts` and the SCHEMAS.md text
stand as written.

One presentational nit, not an error: "longest gap 24" is the **delta between
consecutive entry dates**, which is 23 missed days. Both readings appear in the
docs consistently as 24, and the script reports the missed-day count alongside it
so no chart is built on the ambiguity. Worth keeping in mind when the streak card
renders a gap.

---

## Anomalies in the source data

1. **The stale `entries.json.tmp` is safe to ignore — confirmed, not assumed.**
   It holds 60 entries against the live file's 83, and is a **strict subset**: zero
   ids and zero `entry_date`s appear in it that are not in `entries.json`. **Nothing
   is lost by ignoring it.** One record differs — `2026-04-16`
   (id `6c8cbc35…`) — where the `.tmp` carries an *older* revision: a different
   `gratitude_text`, `rating` 1 instead of 2, and an `updated_at` of
   `1776322638347` against the live file's `1776397334147`. The live file is the
   newer, edited version, so it is correctly authoritative and the migrated entry
   for that date is the right one. The `.tmp` was left behind by an interrupted
   non-atomic write in the old app — precisely the failure this migration's
   temp-file-plus-rename guards against. It was read for comparison only and not
   modified.

2. **`created_at` frequently post-dates `entry_date` — 50 of 83 entries.** Days were
   often written up retroactively, by up to 6 days (e.g. `2026-02-22` created on
   `2026-02-28`). Both timestamps are preserved verbatim. **This matters for stage 7's
   form and for any chart:** `entry_date` is the day being described and is the only
   correct axis for streaks, adherence and rating trends. `created_at` is when it was
   typed and will misplace roughly 60% of entries if used as the date. The journal
   repository should key on `entry_date` throughout.

3. **16 of 83 entries have `updated_at != created_at`** — entries get revisited and
   edited. The reflection form should expect edits to existing days as a normal path,
   not an edge case, and `updated_at` should be bumped on edit.

4. **No structural problems otherwise.** No duplicate ids or dates, all ids are
   36-char UUIDs, all dates are well-formed `YYYY-MM-DD`, no `updated_at` precedes
   its `created_at`, no null or empty `gratitude_text`, no extra fields, and no
   rating outside 1–7. `gratitude_text` runs 22–919 characters (mean 150), so the
   form's text areas should handle a paragraph comfortably.

5. **Three entries contain emoji** (💀 on 2026-01-23, 2026-02-09, 2026-02-12).
   Non-BMP characters, so they are surrogate pairs in JS strings — verified
   byte-identical through the round trip. Anything that truncates `gratitude_text`
   for a preview must slice by code point, not by UTF-16 unit, or it will split one
   of these and emit a lone surrogate.

6. **Content note.** These are real, private, and often heavy entries — several
   describe genuine low points. `synthesis.journal_access` defaults to `full`, so the
   synthesis and `/ask` agents will read all of it. That is the author's stated
   decision (SCHEMAS.md), and the J8 projection is the control; flagging only so the
   default is a deliberate choice rather than an unnoticed one.

---

## Notes for whoever builds the reflection form (stage 7, wave 2)

- Imported entries have **no** `learned` / `mood_word` / `mood_context`, and those
  keys are **absent rather than null**. Read them as `entry.mood_word ?? ''`; do not
  assume the key exists.
- There is deliberately **no `source` field** on `JournalEntry` — `types.ts` does not
  define one, so the migration did not invent one. Imported entries are not
  distinguishable from app-written ones except by the absent optional fields, which
  is the intended design.
- Output is sorted by `entry_date` ascending and written in SCHEMAS.md key order
  (`rating` before `gratitude_text`). Keeping that ordering on write keeps the
  vault's git diffs legible.
- Re-running the migration will never clobber app-added fields; it only fills gaps.
  It is safe to run again at any time.
