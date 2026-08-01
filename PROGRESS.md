# Dès vu — build progress

**Read this first.** It is the single orientation document for anyone (human or agent)
picking up work on this project. It is updated as stages land.

Last updated: 2026-08-01 · scaffold laid, wave 1 dispatched

---

## What this is

A personal "second brain" for a CMU student navigating school and tech recruiting.
One corpus, many inputs: an Obsidian vault of markdown and JSON is the **single source
of truth**, and three things read it — this Electron app, Obsidian itself, and Claude Code.

The controlling spec is the PRD. **It outranks this file and it outranks your judgement.**

| Document | Path |
|---|---|
| PRD (requirements, numbered C1–C10 / T1–T11 / J0–J8 / E1–E7 / S1–S3) | `<vault>/PRD.md` |
| Data schemas | `<vault>/data/SCHEMAS.md` |
| Design brief (locked palette, type, tokens) | `<vault>/Moodboard/Design-Brief.md` |
| Approved comp (v2, all P1s closed) | `<vault>/Moodboard/design-system/Command-Center.dc.html` |

## Where things live

| Thing | Path |
|---|---|
| Vault (real bytes) | `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Dès vu` |
| Vault (symlink you can type) | `~/Documents/Dès vu` |
| Electron app | `~/Desktop/Vscode/desvu/app` |
| Telegram bot | `~/Desktop/Vscode/desvu/bot` |
| Agent reports | `~/Desktop/Vscode/desvu/.progress/*.md` |
| Bot credentials | `~/.config/desvu/bot.env` (mode 600) |

**App code is deliberately outside iCloud** so `node_modules` never syncs. The vault is
inside iCloud so the phone gets the corpus for free. Do not move either.

The vault is a git repo with **no remote** — the user backs up manually, by decision.

## Locked decisions — do not relitigate

- **Files are the truth.** No database, no server, no HTTP layer. The renderer never
  touches `fs`; everything crosses IPC so the main-process mutation lock means something.
- **Stack:** Electron + React 18 + TypeScript + Vite (via `electron-vite`) + Tailwind 4 +
  zustand + Recharts. Tests are Vitest.
- **Palette is locked** to the Ph1so/loom warm paper-and-ink world. Light `#FDFAF3` bg /
  `#FFFFFF` card / `#2A2520` ink. Dark `#0B0A08` / `#151310` / `#EDE6D6`. Single accent:
  antique gold `#9C7E40` light, `#C8A564` dark. Red is reserved for destructive actions only.
- **Fonts must be self-hosted woff2** — Cormorant (display serif, reflection surfaces) and
  DM Sans (body, tools/numbers/tables). The comp loads them from a CDN; that is a known
  port issue, not a design decision to copy.
- **Categories resolve by shape, not by colour**: recruiting = square, school = circle,
  personal = diamond. The three category hues sit within 1.03:1 of each other by design
  (they must never outrank the gold accent), so colour alone is not a usable encoding.
  A lightness split was evaluated and rejected — lightness encodes rank, and these are nominal.
- **Capture is the core loop.** The bot is a *dumb receiver*: it appends raw timestamped
  lines to `Inbox/` and does no parsing. A Claude skill (`/sort-inbox`) does the routing.

## Hard product rules

These come from the PRD and from the user's real journaling data (39% adherence, a decay
from 100% to 14% over six months, 24-day maximum gap). Breaking them breaks the product.

1. **J6 — streaks may count up but may NEVER be shown as broken.** No "0 days", no red, no
   guilt on return. Missed days render as neutral empty space. Longest streak is banked
   permanently. Re-entry friction is the primary failure mode of this whole app.
2. **J0 — only the 1–7 rating is required.** A rating alone is a complete journal entry.
   Every other prompt is progressive disclosure. A 5-second entry must always be possible.
3. **Library auto-archives unread items at 30 days** so the queue is never a guilt pile.
   Archived ≠ deleted: still in the vault, still in the graph, still in search.
4. **Capture is never blocked by taxonomy.** A purchase in an unknown category still logs.
   A meal with no calories still logs.
5. **J8 — `settings.synthesis.journal_access` is enforced by a repository projection**, not
   by a prompt instruction. A model cannot be argued past a projection.
6. **Recurrence never backlogs.** A skipped gym day simply does not exist tomorrow.

## Contracts — owned by the orchestrator, do not redefine

Three files are the coordination points between parallel workstreams. If you need a change
to one, say so in your report; do not edit it unilaterally and do not shadow it with a
local copy.

| File | Owns |
|---|---|
| `app/src/shared/types.ts` | every record shape, mirroring `data/SCHEMAS.md` |
| `app/src/shared/ipc.ts` | the `DesvuApi` surface + `IPC_CHANNELS` allowlist |
| `app/src/shared/vault.ts` | vault path resolution (NFC/NFD tolerant, `DESVU_VAULT` override) |

Import them as `@shared/types`, `@shared/ipc`, `@shared/vault`.
Renderer code imports its own tree as `@/...`.

## Build status

Stages are from PRD §10.

| # | Stage | Status |
|---|---|---|
| 1 | Vault, schemas, git init | ✅ done |
| 2 | Storage layer (repositories + mutation lock) | ✅ 12 repos, 136 tests |
| 3 | Telegram bot ✅ (67 tests) + `/sort-inbox` ✅ | done |
| 4 | Design system → tokens, fonts, primitives | ✅ |
| 5 | Electron shell + dashboard frame | ✅ builds and runs |
| 6 | To-do list + Today view + recurrence | ⏳ wave 2 |
| 7 | Journal migration ✅ / reflection form ⏳ | migration 83/83 lossless |
| 8 | Finance · meals · workouts | ⏳ wave 2 |
| 9 | Calendar · Gmail | ⬜ deferred (needs isolated MCP config) |
| 10 | Explore library | ⏳ wave 2 |
| 11 | Search across everything | ⏳ wave 2 |
| 12 | Brain dump threads · synthesis · `/ask` | ⏳ wave 2 |
| 13 | Always-on shakedown | ⬜ |

### Surface contract (wave 2 onward)

Every routed surface returns **exactly one `<Page title eyebrow? description? actions?>`**
and nothing above it. `<Page>` owns the eyebrow, the Cormorant title, gutters, the scroll
container and persistent controls; its children are the content column with the 20px
gutter already applied. Do not add chrome, do not nest a second `Page`, do not reach
around it to style the frame.

Reads go through `useVaultQuery(() => bridge().x.y(), [])`. Writes are plain async
functions that call `bridge()` then `invalidateVault()`. Errors render as a quiet line
inside a card — never red, never a blank screen.

Each surface lives in its own file under `src/renderer/src/surfaces/`, so they can be
built independently. `surfaces/index.tsx` is just the route table.

**Tailwind's default palette is cleared** — `bg-red-500` does not exist. Red can only come
from `--danger`, which is used in exactly two places, both destructive. If a surface needs
to signal over-budget, overdue, or over-capacity, the answer is **gold**.

## Facts established by measurement — do not re-derive, do not contradict

### The journal corpus (verified against the real data, 2026-08-01)

83 entries now live in `data/journal.json`, migrated losslessly from `gratefulnessjar`.
Every figure the PRD rests on was checked and **all of them held**: 211 days spanned,
83 with entries, **39.3% adherence**, **24-day longest gap** (Jul 4 → Jul 28), decay from
**100% in January to 13.8% in July**. Rating distribution `{1:2, 2:3, 3:10, 4:28, 5:32,
6:7, 7:1}` — exactly **8 entries above 5**, which is why the scale is 1–7 and why clamping
to 1–5 would have silently flattened the top of every chart.

Three properties of this data constrain any code that touches it:

1. **Key on `entry_date`, never `created_at`.** On 50 of 83 entries `created_at` post-dates
   `entry_date` by up to 6 days — days were often written up retroactively. Charts, streaks
   and calendars keyed on `created_at` would misplace ~60% of the corpus.
2. **Editing an existing day is a normal path, not an edge case.** 16 entries were revised
   after creation. The reflection form must open an existing entry for editing as
   naturally as it creates a new one.
3. **Three entries contain non-BMP emoji.** Any preview truncation must slice by code
   point (`[...str]`), not by UTF-16 index, or it will emit a lone surrogate.

### What the capture bot actually writes (verified, 2026-08-01)

Line format in `Inbox/YYYY-MM-DD.md`:
```
- [ ] 14:32 · telegram · the raw text exactly as sent
```
Attachment lines end ` → [[Attachments/<filename>]]`.

Four properties anything reading the Inbox must respect:

1. **Timestamps are SEND time, not receipt time.** Telegram queues updates for 24h, so a
   message sent at 11:40pm with the laptop asleep is filed into **that** day's file
   whenever the laptop wakes. A day-file is therefore **not complete or immutable once
   the day passes**, and lines within it are **not guaranteed chronological**. This is
   correct — it preserves when the user had the thought — but `/sort-inbox` must re-scan
   recent day-files, not just today's.
2. **Newlines fold to a single space.** The only normalization applied. One Inbox line may
   represent what was visually several lines or a list.
3. **Photo OCR works** (tesseract 5.5.1) — real extracted text lands on the line.
4. **Voice transcription does not.** No whisper is installed, and no cloud API was added by
   decision. Voice notes land as `[voice, untranscribed]` plus a wikilink. Enable with
   `brew install whisper-cpp` and a `ggml-*.bin` model in `~/.cache/whisper.cpp` — no code
   change needed. (macOS Vision OCR was tried first and returns zero observations on
   macOS 26.5.2, so tesseract is the supported path.)

Security boundaries, both structural rather than conventional:
- **C2** is grammY middleware installed before every handler — a rejected update never
  calls `next()`, so no route can bypass it. Verified: a foreign id produces zero API
  calls and zero file writes.
- **C7** is an **allowlist** of writable subdirs (`Inbox/`, `Attachments/`), enforced on
  the write path with traversal checks — not a denylist of `Journal/`. A denylist would
  let a future handler quietly acquire a new write target.

### The vault has multiple writers — take the lock

Four processes write to this vault: the Electron app, the Telegram bot, the `/sort-inbox`
Python scripts, and Obsidian itself. The app's in-process mutation lock cannot see the
other three, and every JSON tracker is read-modify-written whole, so an unlocked write
silently loses records.

**`docs/lockfile-protocol.md` is normative.** Any process writing `data/*.json`, `Inbox/`
or `Attachments/` must take `data/.desvu.lock` per that spec: `O_CREAT|O_EXCL`, holder
metadata, steal only when >30s old AND pid dead AND same host, ~10s bounded wait, release
in a `finally`. It is same-machine only — iCloud gives `O_EXCL` no cross-device meaning,
which is fine because all writers are on this Mac.

A lock failure must **never** silently drop a capture. Fail loudly and tell the user to
resend; a visible error beats a lost note.

Obsidian is the exception — it writes markdown notes, not trackers, and cannot be made to
take a lock. Markdown records are single-file writes, so the exposure is limited to a
concurrent edit of the same note.

### Never let anything write to the real vault

`~/Documents/Dès vu` is a **symlink** to the iCloud container and holds live personal data:
83 real journal entries, six months of history, **no git remote**. Anything that writes
during development must point `DESVU_VAULT` at a throwaway directory. Both seed scripts
refuse to write anywhere inside the real vault; keep it that way.

This has already gone wrong once. A stray real directory at `~/Documents/Dès vu`
containing four seed files shadowed the vault, because `isVault()` accepted any directory
with a `data/` child and that path is searched first. The app read an empty vault while
the real corpus sat untouched. Discovery now requires `PRD.md` or `data/SCHEMAS.md` —
markers nothing writes programmatically — so a directory cannot impersonate the vault
again. An explicit `DESVU_VAULT` is still trusted without markers, which is what keeps
temp vaults working in tests.

If you ever find `~/Documents/Dès vu` is a directory rather than a symlink, that is the
bug recurring. The real bytes are always at
`~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Dès vu`.

### The capture loop, end to end

**The bot never sorts. That is deliberate and it is not a limitation to be fixed.**

1. Text the bot anything, from anywhere, laptop closed. It appends a raw timestamped line
   to `Inbox/YYYY-MM-DD.md` and replies `✓ inbox`. No parsing, no classification.
2. All the intelligence lives in `/sort-inbox`, run later from Claude Code in the vault.
   It routes each line: article → `Library/`, `$20 lunch` → `finance.json`, a workout →
   `workouts.json`, a meal → `meals.json`, anything actionable → `todos.json`.

Splitting it this way means a capture can never be lost because classification failed. The
worst case is a line waits in the Inbox. That trade is the whole point.

`/sort-inbox` scans **every** `Inbox/*.md`, not just today's, because Telegram stamps send
time — see the bot section above.

**In-app button:** the app can shell out to `claude -p "/sort-inbox"` to run the same skill
from a button. Two things a naive implementation gets wrong:

- Headless has no permission prompt, so tools must be passed explicitly via `--allowedTools`
  scoped to what `.claude/commands/sort-inbox.md` declares. Without it the run *appears* to
  succeed while every `python3` call is silently denied and nothing is actually scanned.
  **Never** reach for `--dangerously-skip-permissions` — that hands a background process
  unrestricted tool access to the machine.
- A run takes **~2 minutes even on an empty inbox**. It needs streaming progress and a
  cancel, not a spinner, and a partial run must say so rather than showing a green check.

## Conventions

- **Storage pattern** is ported from `~/Desktop/Vscode/gratefulnessjar/server/entryRepository.ts`:
  a serialized `withMutationLock`, validation before write, and dedupe-on-import. Writes must
  additionally be **atomic** (temp file + rename) — the original was not, and the vault is
  syncing to iCloud underneath us.
- **Dates** are `YYYY-MM-DD` local strings. **Timestamps** are epoch ms.
- Never write `node_modules`, build output, or secrets into the vault.
- The bot token must never appear in any file inside the vault or either git repo.

## How parallel agents coordinate

Each agent writes a report to `.progress/<name>.md` — its own file, so concurrent writes
never collide. The orchestrator rolls those up into the status table above. If you are an
agent: write your report, do not edit this file.
