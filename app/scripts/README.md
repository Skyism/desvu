# `app/scripts`

One-shot maintenance scripts. Plain Node ESM (`.mjs`) with no build step and no
dependencies beyond the standard library, so they run against the vault without
`electron-vite` being involved.

They mirror `src/shared/` rather than importing it — a `.mjs` file cannot import
`.ts` without a compile step. **If `shared/types.ts` or `shared/vault.ts` changes,
check the mirrored constants here.** In `migrate-journal.mjs` those are
`RATING_MIN` / `RATING_MAX`, `VAULT_DIR_NAME`, and the vault resolution order.

Only `migrate-journal.mjs` is documented below. Other scripts in this directory are
owned by their own workstreams and carry their usage in a header comment.

---

## `migrate-journal.mjs`

Imports the gratitude journal from the old `gratefulnessjar` app into the vault.

| | |
|---|---|
| Source | `~/Desktop/Vscode/gratefulnessjar/.gratefulness-data/entries.json` (83 entries) |
| Target | `<vault>/data/journal.json` |
| Source is | **read-only** — never written, never renamed. It stays the fallback. |

```bash
npm run migrate:journal -- --dry-run    # report only, writes nothing
npm run migrate:journal                 # migrate for real

# or directly
node scripts/migrate-journal.mjs --dry-run
```

**Always dry-run first.** The dry run computes the exact bytes it would write,
prints their size and sha256, and runs the full losslessness check in memory. If
the sha256 from the dry run matches the sha256 from the real run, the real run
wrote precisely what the dry run promised.

### Flags

| Flag | Effect |
|---|---|
| `--dry-run`, `-n` | Compute and report everything, write nothing. Exit 0 if clean. |
| `--force`, `-f` | Proceed when the target holds entries the source doesn't know about. |
| `--source=PATH` | Override the source `entries.json`. |
| `--out=PATH` | Override the target `journal.json`. |
| `--quiet`, `-q` | Suppress the data-profile block. |
| `--help`, `-h` | Usage. |

`DESVU_VAULT` relocates the vault, same as everywhere else in the app — that's how
the script is exercised against a sandbox vault without touching the real one.

### What it guarantees

- **Idempotent.** Dedupe key is `entry_date` (one entry per day is the invariant).
  A second run imports 0 and produces a byte-identical file.
- **Never clobbers.** An `entry_date` already in the target is kept as-is; the
  source only fills gaps. This matters because the app adds `learned`, `mood_word`
  and `mood_context` to existing entries after the import, and a re-run must not
  wipe them. Divergence between a preserved entry and the source is reported as a
  warning, never silently accepted.
- **Lossless, proved not claimed.** After writing, the file is re-read *from disk*
  and compared against the source field by field. `gratitude_text` is compared as
  **UTF-8 bytes**, not as strings, so a Unicode normalization shift (NFC/NFD — a
  live hazard on macOS + iCloud; three entries carry emoji) cannot slip through.
  Any mismatch fails the run loudly with a non-zero exit.
- **No clamping.** The rating scale is **1–7**, not 1–5 — 8 of the 83 entries are
  rated 6 or 7. A rating outside 1–7 is a hard validation error that aborts before
  anything is written. It is never quietly clamped.
- **Atomic.** Temp file in the target directory → `fsync` → `rename(2)` → `fsync`
  the directory. A reader (Obsidian, the app, the iCloud daemon) sees either the
  old file or the whole new one. The temp file is unlinked if anything throws.
  *This is not hypothetical:* the source directory still carries a stale
  `entries.json.tmp` from an interrupted non-atomic write in the old app.
- **Guarded.** Refuses to run against a `journal.json` containing entries absent
  from the source unless `--force`. Both paths preserve existing entries; `--force`
  only acknowledges the mixed state.

### Field mapping

`id`, `entry_date`, `rating`, `gratitude_text`, `created_at`, `updated_at` carry
over unchanged. Output is written in `SCHEMAS.md` field order (`rating` before
`gratitude_text`, since `rating` is the only required field) and sorted by
`entry_date` ascending, so the vault's git diffs stay readable.

`learned`, `mood_word` and `mood_context` are **omitted, not set to `null`** — they
are optional in `JournalEntry`, and an imported entry genuinely does not have them.
There is deliberately **no `source` field**: `JournalEntry` does not define one, and
inventing one would put the file out of step with the canonical type.

### Exit codes

`0` success (or a clean dry run) · `1` validation failure, guard tripped, or a
losslessness check that did not pass.

### Migration status

Run on 2026-08-01. 83/83 entries imported, verified lossless, 8 above-5 ratings
preserved unclamped. Output sha256 `b59decf0…`, 28950 bytes. Full report and the
data profile: `.progress/journal-migration.md`.
