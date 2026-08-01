# Storage layer — report

**Agent:** storage · **Stage:** 2 · **Status:** complete
**Verification:** `npx vitest run` → **136 passed / 0 failed** (10 files) · `npx tsc --noEmit` → **clean**

---

## What landed

```
app/src/main/lib/
  errors.ts        ValidationError · NotFoundError · CorruptFileError
  lock.ts          withFileLock — in-process mutation lock, keyed per file
  vault-lock.ts    withVaultLock — cross-process advisory lock (data/.desvu.lock)
  atomic.ts        atomicWriteFile — temp file in the same dir, fsync, rename
  json-store.ts    createJsonStore — read/mutate with lock + atomic write + seed/corrupt rules
  dates.ts         local-time YYYY-MM-DD arithmetic (never UTC parsing)
  recurrence.ts    occurrence queries over daily / weekly / monthly rules
  frontmatter.ts   minimal YAML front matter read/write (no new dependency)
  paths.ts         vault-relative resolution with traversal refusal, slugs, listing
  validate.ts      Issues collector + per-field checks
  ids.ts           newId()

app/src/main/repos/
  todoRepository · journalRepository · financeRepository · mealRepository
  workoutRepository · libraryRepository · brainDumpRepository · inboxRepository
  calendarRepository · settingsRepository · searchRepository · systemRepository
  index.ts

app/src/main/ipc-router.ts    replaced the stub — a handler for every IPC_CHANNELS entry
app/vitest.config.ts
app/test/                     10 suites, 136 tests
docs/lockfile-protocol.md     normative spec for the Python side of the vault lock
```

---

## Public API per repository

Everything on `DesvuApi` is implemented and routed. Methods marked **(extra)** are not on
the interface and have no IPC channel — they exist for other repositories or for agents.

### `todoRepository`
| Method | Notes |
|---|---|
| `list()` | All statuses, **templates excluded** (a template is a rule, not a task). Sorted priority → due → newest. |
| `forDate(date)` | Open/doing, `due <= date`. Materializes recurrence instances as a side effect. |
| `create(input)` | Fills `priority` / `estimate_minutes` from settings. A template with no `due` anchors today. |
| `update(id, updates)` | Explicit-`undefined` keys are dropped, so a partial patch cannot erase a field. Keeps `completed_at` consistent with `status`. |
| `complete(id, actualMinutes)` | Banks the actual, spawns **exactly one** next instance. Throws on a template. |
| `reopen(id)` · `remove(id)` | `remove` on a template also removes its instances. |
| `dayLoad(date, now?)` | `{ committed, free, due, corrected_due, overflow }`. `now` injectable for tests. |
| `correctionFactors()` | One row per category, always. `confident` at ≥ 25 samples. |
| `listAll()` **(extra)** | Everything, templates and completed included — search uses it. |

### `journalRepository`
`list()` · `byDate(date)` · `upsert(input)` · `remove(id)` · `streak(now?)` ·
`readForAgent()` **(extra)** — full entries or `JournalMetadata[]` per
`settings.synthesis.journal_access`.

### `financeRepository`
`list()` · `create` · `update` · `remove` · `monthSummary(month)` · `listAll()` **(extra)**.
Exports `UNCATEGORISED`.

### `mealRepository` / `workoutRepository`
`list()` · `forDate(date)` · `create` · `update` · `remove` · `listAll()` **(extra)**.

### `libraryRepository`
`list({includeArchived?})` · `create(input)` · `setStatus(path, status)` ·
`setArchived(path, archived)` · `fitting(freeMinutes)` · `runAutoArchive(now?)` ·
`listAll()` **(extra)** · `readItem(path)` **(extra)**.

### `brainDumpRepository`
`listThreads()` · `readThread(path)` · `appendToThread(path, text)` ·
`createThread(topic, title, text)` · `listTopics()`.

### `inboxRepository`
`read()` · `count()` · `append(text, source, now?)` **(extra)**.
Exports `formatInboxLine`, `inboxFileFor`, `INBOX_SEPARATOR`.

### `calendarRepository`
`forDate(date)` · `lastRefresh()` · `listAll()` **(extra)**. Read-only.

### `settingsRepository`
`get()` · `update(patch)` · `filePath()` **(extra)**.

### `searchRepository`
`query(q)`.

### `systemRepository`
`vaultPath()` · `openInObsidian(relativePath)` · `quickCapture(text)`.
Exports `obsidianUrl(vaultName, relPath)` (pure, testable) and `setExternalOpener()` (tests).

### `ipc-router.ts`
`ipcHandlers` (typed `satisfies Record<IpcChannel, Handler>` — parity is a **compile**
error), `registerIpcHandlers(ipcMain)`, `unregisterIpcHandlers(ipcMain)`,
`callChannel(channel, ...args)` for tests and the debug console.

---

## How the hard requirements are met

**Serialized mutation lock.** `withFileLock` is the ported promise chain, keyed by absolute
path instead of one global queue — same guarantee per file, no false contention between a
meal log and a library scan. The next operation runs whether or not the previous settled,
so a failed write cannot wedge the queue.

**Cross-process lock** *(added mid-task)*. `withVaultLock` layers **under** the in-process
lock: `withFileLock(file) → withVaultLock() → read/apply/write`. Lock file
`data/.desvu.lock`, created with `O_CREAT | O_EXCL`, carrying
`{pid, host, acquired_at, holder}`. Stale locks are stolen only when older than 30 s **and**
`host` matches **and** the pid is dead; foreign-host locks are never stolen. Bounded 10 s
wait then a clear actionable error naming the holder and the file. Released in `finally`,
and release re-checks ownership so a stolen lock is not deleted out from under its new
holder. Covers every `data/*.json` write and `Inbox/` appends.
`docs/lockfile-protocol.md` is the normative spec, with a working Python implementation.

**Atomic writes.** Temp file in the *same directory*, `fsync`, `rename`. Cross-directory
temp files would degrade `rename` to a copy and reopen the window. Temp file is removed on
failure.

**Validation before write.** Ratings 1–7, categories, meal slots, workout types,
priorities, sources, recurrence rules, non-negative estimates/calories/durations, real
calendar dates. Every problem is reported at once, not one per round trip.

**Missing files are not errors.** `ENOENT` and zero-byte files seed an empty collection.

**Never write partial/corrupt JSON.** Malformed JSON throws `CorruptFileError` naming the
path, before any write. Tested: the damaged bytes are still on disk afterwards.

---

## Product rules, and where they are enforced

| Rule | Enforcement |
|---|---|
| **J6** streaks never broken | `StreakInfo` is `{current, longest, total}` and nothing else. `current` counts runs ending today **or yesterday**. `longest` is banked in `data/journal-streak.json` and takes `max(stored, computed)`, so deleting entries cannot lower it. No last-entry date, no days-since, nothing a UI could render as guilt. |
| **J0** rating-only entries | Optional prose fields are only set when actually supplied — a bare rating does not gain four empty strings. |
| **Recurrence never backlogs** | Invariant: at most **one live instance per template**. A ten-day absence *rolls the existing instance forward* onto today rather than spawning ten. A dropped instance is never resurrected for the same occurrence. Completing late bases the next occurrence on `max(instanceDue, today)`. |
| **Capture never blocked by taxonomy** | `Purchase.category` is a free string, never checked against settings; blank files as `uncategorised`. Meals and workouts accept null calories/protein/duration. |
| **J8 projection** | `journalRepository.readForAgent()` projects to `{entry_date, rating, mood_word}` when the setting is `metadata`. Enforced on the way out of the repository — there is no code path that returns prose while the setting says otherwise. |
| **T11 correction factors** | `confident: false` below 25 samples; the row is still returned so the UI can bind and decline to show the multiplier. |
| **E7 auto-archive** | Only `status: unread` and only past `settings.library.auto_archive_days`. Archived items stay in the vault, in `listAll()`, and in search. |
| **S3 recall** | Search reads `listAll()` everywhere: archived library items, completed and dropped todos, and recurrence templates are all reachable. |

---

## Decisions you should know about

1. **`list()` excludes recurrence templates**, per the `Todo.recurrence` comment in the
   shared contract ("templates never appear in a list"). Consequence: there is currently
   **no way to enumerate or manage templates through `DesvuApi`** — see *Contract changes*.
   Search reaches them via `listAll()`, so they are not invisible, just unmanageable.
2. **`forDate` excludes undated todos.** Folding the whole backlog into "due today" makes
   the headline committed-vs-free number meaningless. It includes overdue items, which are
   real committed time (T7).
3. **`forDate` writes.** Materialization persists spawned instances so the ids are real and
   completing one works. It skips the write when nothing changed, so repeated reads do not
   churn iCloud.
4. **Free-time window is 08:00–24:00 local** (960 min). For *today* it starts at `now`.
   There is no setting for this; if the user wants one it belongs in `settings.todos`.
5. **All-day calendar events contribute 0 committed minutes.** Most are birthdays and
   deadlines, not time commitments. Overlapping events are merged so a double-booked hour
   counts once.
6. **`dayLoad` fits todos using corrected minutes when a category is confident**, raw
   estimates otherwise. `corrected_due_minutes` is `null` when no category is confident.
7. **`inbox.read()` returns the raw line as it sits on disk**, checkbox prefix included —
   `at` is provided separately, parsed from the file date plus the `HH:MM`. Lines ticked
   `- [x]` are excluded (routed); lines that do not match the bot format are still returned,
   because an unroutable capture staying visible is the point of the Inbox.
8. **Search ignores `journal_access`.** J8 governs what a cloud model may read, not what the
   user may find in their own vault on their own machine. Tested explicitly.
9. **`journal.upsert` edits rather than rejecting a second entry for the same day.** The
   ported original threw; that is wrong for a form the user reopens to add a mood word to a
   rating logged at breakfast.
10. **Reads are tolerant, writes are strict.** A hand-edited file with a bad category or a
    typo'd setting falls back to a default rather than breaking the app; the same value sent
    through `create`/`update` is rejected with a message.
11. **`complete()` on a template throws.** Unreachable through the API today (templates are
    in no list), kept as an internal-consistency guard.
12. **`calendar.json` accepts two shapes** — a bare array, or `{events, last_refresh}` —
    because the refresh script does not exist yet and pinning its output from here would be
    guessing. Falls back to file mtime for `lastRefresh`.
13. **`reopen()` does not un-spawn** an instance that completion already scheduled. Undoing
    a side effect on undo felt more surprising than leaving it.

---

## Contract changes I need (not made — orchestrator owns these files)

1. **`todos.listTemplates()` on `DesvuApi`** (channel `todos:listTemplates`). Without it a
   recurring task cannot be discovered, edited, or deleted from the UI — `update`/`remove`
   work on a template id, but nothing hands the UI one. This is the only real gap in the
   surface.
2. **`types.ts` could export the value-level unions** it already has as types:
   `MEAL_SLOTS`, `WORKOUT_TYPES`, `TODO_STATUSES`, `SOURCES`, `PRIORITIES`,
   `LIBRARY_TYPES`, `LIBRARY_STATUSES`. They are currently re-declared in
   `main/lib/validate.ts` and in `libraryRepository`, which can silently drift from the
   union if a member is ever added. Not urgent; noted so it does not go unnoticed.
3. **`ipc.ts` uses `Timestampish` before it is declared** (line 112 vs 141). Legal, compiles
   fine, mildly confusing to read. Cosmetic.
4. **The vault's `.gitignore` should ignore `data/.desvu.lock` and `data/.*.tmp`.** Both are
   transient; a crash can leave one behind and it should never be committed. That file is
   in the vault, not in my tree.

---

## Test coverage (136 tests)

| Suite | Tests | Covers |
|---|---|---|
| `storage-core` | 11 | Lock serialization and non-interleaving, failed op does not wedge the queue, per-file independence, 30 concurrent creates lose nothing, no temp turds, temp cleanup on failure, concurrent reader never sees a torn file, missing/empty file seeds, malformed JSON fails loudly and leaves the bytes alone |
| `vault-lock` | 12 | **Two real processes contending** (child process implementing the protocol independently), foreign writer waits for us, stale steal with a genuinely dead pid, refusal to steal a live pid, refusal to steal a foreign host however old, refusal to steal a fresh lock, truncated-lock recovery, release on throw and on reject, no lock left after concurrent writes, diagnosable record contents |
| `todos` | 27 | Defaults, every validation path, forDate semantics, no-backlog after 10 days, idempotent materialization, roll-forward, spawn-exactly-one, late completion schedules forward, dropped never resurrected, template guards, monthly rules, correction-factor confidence at 24 vs 25, dayLoad with/without calendar, overflow order, corrected minutes |
| `journal` | 13 | Rating-only entries, 1–7 bounds, upsert, streak ending today and yesterday, **0 after a 24-day gap with no broken-ish key anywhere**, banked longest survives deleting every entry, longest run anywhere in history, metadata projection withholding prose |
| `trackers` | 19 | Unknown finance category still logs, negative amounts, month summary against limits including zero-spend and uncategorised, period boundaries, meals with no numbers, `estimated` flag, meal ordering, workout types, settings seeding/merge/array replacement/rejection |
| `library` | 13 | Documented front matter incl. inline comments and inline lists, no-front-matter notes, dated slugs, derived source host, collision-safe filenames, round trip preserving body and unknown keys, archived hidden but present, auto-archive only unread and only past the window, idempotence, traversal refusal, `fitting` ordering |
| `brain-dump` | 7 | Thread creation under a topic, listing, hand-written threads, **append adds a dated block to the existing file** (file count stays 1), same-day appends join one heading, empty/missing/traversal rejection, 10 concurrent appends lose nothing |
| `inbox-system` | 17 | Exact bot line format incl. attachments and zero-padding, append ordering, quick capture, concurrent captures, ticked lines excluded, non-conforming lines kept, calendar missing/object/array/garbage, `obsidian://` encoding, path refusals |
| `search` | 9 | All eight hit kinds from one query, path on markdown hits, all-terms matching, title outranks body, **archived library item**, **completed todo**, **dropped todo**, **recurrence template**, journal prose still findable under `metadata` |
| `ipc-contract` | 8 | `IPC_CHANNELS` ↔ handlers exact parity both directions, all handlers are functions, no duplicate channels, naming convention, register/unregister against a fake `ipcMain`, **every channel invoked for real against a temp vault**, errors re-thrown as plain messages |

Every test runs against a fresh temp vault in `os.tmpdir()` via `DESVU_VAULT`.
`~/Documents/Dès vu` is never opened for writing by the suite — verified by hand after the
run (`Inbox/`, `Library/`, `Journal/`, `Synthesis/` are still empty; `data/` holds only
`SCHEMAS.md` and the migration agent's `journal.json`).

The contention test was checked for teeth: with the vault lock bypassed it fails with a
lost record, exactly as intended.

---

## Deliberately not done

- **No file watcher.** `IPC_EVENTS.vaultChanged` exists in the contract but nothing emits
  it. Watching the vault for external changes (Obsidian, the bot, `/sort-inbox`) belongs in
  `main/index.ts`, which another agent owns. The repositories are stateless per call, so a
  watcher only needs to tell the renderer to re-fetch.
- **No caching.** Every call re-reads from disk. At ~10k records this is comfortably inside
  the "instant" budget; if it ever is not, the seam is `json-store.read()`.
- **No import/dedupe path.** The original's `importEntries` was not ported — the journal
  migration is another agent's stage-7 job, and it writes `data/journal.json` directly.
  `journalRepository` reads whatever it finds and normalizes missing fields, so a migrated
  file loads without help.
- **`gmail.json` and `applications.json`** have no repository. Neither is on `DesvuApi`, and
  §6.1 I2 makes Gmail an input to todos and synthesis with no dashboard surface.
- **Search is substring matching, not ranked retrieval.** No index, no stemming, no fuzzy
  matching. PRD explicitly defers agentic RAG; `/ask` covers that need.
- **`library.create` does not fetch the URL.** E1's fetch/summarize/tag step is the sort
  skill's job; this repository writes the note it is handed.
- **The Telegram bot does not yet take the vault lock** for its `Inbox/` appends. The app
  does. Worth pointing the bot agent at `docs/lockfile-protocol.md`.
