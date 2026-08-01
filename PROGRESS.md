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
| 2 | Storage layer (repositories + mutation lock) | ⏳ wave 1 |
| 3 | Telegram bot + `/sort-inbox` | ⏳ wave 1 |
| 4 | Design system → tokens, fonts, primitives | ⏳ wave 1 |
| 5 | Electron shell + dashboard frame | ⏳ wave 1 |
| 6 | To-do list + Today view + recurrence | ⬜ wave 2 |
| 7 | Journal migration + reflection form | ⏳ wave 1 (migration) / wave 2 (form) |
| 8 | Finance · meals · workouts | ⬜ wave 2 |
| 9 | Calendar · Gmail | ⬜ deferred (needs isolated MCP config) |
| 10 | Explore library | ⬜ wave 2 |
| 11 | Search across everything | ⬜ wave 2 |
| 12 | Brain dump threads · synthesis · `/ask` | ⬜ wave 2 |
| 13 | Always-on shakedown | ⬜ |

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
