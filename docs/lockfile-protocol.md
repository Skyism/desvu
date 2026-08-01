# Vault lockfile protocol

**Status:** normative. Any process that writes a shared record file in the vault must
implement this exactly. The reference implementation is
`app/src/main/lib/vault-lock.ts`; `app/test/helpers/foreign-writer.mjs` is a deliberately
independent second implementation used to prove the protocol is reimplementable from this
document alone.

## Why it exists

Two processes write the same whole files:

| Writer | What it is | `holder` value |
|---|---|---|
| The Electron app | `app/src/main/repos/**` | `app` |
| `/sort-inbox` | a Python process run from Claude Code | `sort-inbox` |

Both do read-modify-write of an entire JSON file. Without mutual exclusion, one side reads,
the other writes, and the first writes back over it — a todo or a purchase disappears with
no error anywhere. For a capture app that is the worst possible failure: the user did the
work, saw it accepted, and it is gone.

The app's in-process mutation lock cannot see another process, so it does not help here.

## Scope

**Must** be held for every write to:

- `data/*.json` — `todos.json`, `journal.json`, `journal-streak.json`, `finance.json`,
  `meals.json`, `workouts.json`, `settings.json`

**Should** be held for every write to:

- `Inbox/YYYY-MM-DD.md` — the app, the Telegram bot, and the sort skill all rewrite this
  file. The app takes the lock for it today; the bot does not yet.

**Not** required for per-note markdown under `Library/`, `Brain Dump/`, or `Synthesis/`.
Those are one file per record, so two writers touching the same file at the same time is
not a realistic collision.

## Same machine only

`O_EXCL` is an atomic filesystem operation on APFS. It has **no cross-device meaning
whatsoever** over iCloud — a lock taken on this Mac says nothing to a process on the phone
or on another machine. This is acceptable because both writers run on this Mac by design.
Do not extend this protocol to a second device without replacing it.

## The lock file

Path: `<vault>/data/.desvu.lock`

Contents: a single JSON object, optionally followed by a newline.

```json
{"pid": 41234, "host": "jeffreys-macbook.local", "acquired_at": 1754006400000, "holder": "sort-inbox"}
```

| Field | Type | Meaning |
|---|---|---|
| `pid` | integer | Process id of the holder. |
| `host` | string | `os.hostname()` / `socket.gethostname()` of the holder. |
| `acquired_at` | integer | Epoch **milliseconds** when the lock was taken. |
| `holder` | string | `"app"` or `"sort-inbox"`. Free-form; for diagnosis only. |

The record exists so a stuck lock is diagnosable rather than mysterious. Write it; do not
skip it because acquisition already succeeded.

## Acquire

1. Try to create the file exclusively:
   - Node: `fs.openSync(lockPath, 'wx')`
   - Python: `os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)`
2. On success: write the JSON record, `fsync`, close. **The lock is held.**
3. On `EEXIST`: read the existing record and decide whether it is stale (below).
   - Stale → delete the lock file, log loudly, and retry from step 1.
   - Not stale → back off and retry.
4. On `ENOENT`: `data/` does not exist yet. Create it and retry.

Back off between attempts starting at ~15 ms, multiplying by ~1.6, capped at ~250 ms, with
a little jitter.

**Total wait is bounded at 10 seconds.** On expiry, raise an error that names the holder
and the lock path, and **write nothing**. Never proceed unlocked, and never block forever.

## Staleness and stealing

An app that crashes mid-write must not brick the vault, so an abandoned lock has to be
recoverable. A lock may be stolen **only when all of these hold**:

1. `now - acquired_at >= 30000` (30 seconds), **and**
2. `host` equals this machine's hostname — the pid check means nothing otherwise, **and**
3. the pid is not alive: `process.kill(pid, 0)` / `os.kill(pid, 0)` raises `ESRCH`.
   `EPERM` means the process exists under another user — treat it as **alive**.

Two extra cases:

- **Unreadable or truncated lock file** (a writer that crashed between `open` and `write`):
  treat as stealable once its mtime is older than the 30 s window.
- **`pid` equals your own pid** while you do not in fact hold the lock: a previous run
  crashed and the OS recycled the pid back to you. Stealable once past the window.

A lock written by a *different host* is never stolen, however old. It will time out
instead, with an error telling the user which file to delete if they are certain.

Stealing must be logged loudly. Silent recovery hides a real bug.

## Release

Release in a `finally` — an exception must never strand the lock.

Before deleting, re-read the lock file and confirm `pid`, `host`, and `acquired_at` still
match what you wrote. If they do not, someone judged your lock abandoned and took it:
**leave the file alone** and log. Deleting it would hand the lock to a third writer while
the second is still working.

## Constants

| Name | Value |
|---|---|
| Lock file | `data/.desvu.lock` |
| Staleness window | 30 000 ms |
| Acquire timeout | 10 000 ms |
| Backoff | 15 ms → ×1.6 → 250 ms cap, jittered |

## Minimal Python implementation

```python
import json, os, socket, time

LOCK = os.path.join(vault, "data", ".desvu.lock")
STALE_MS, TIMEOUT_MS = 30_000, 10_000

def _alive(pid):
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True  # exists, owned by someone else

def acquire(holder="sort-inbox"):
    deadline, backoff = time.time() + TIMEOUT_MS / 1000, 0.015
    while True:
        record = {"pid": os.getpid(), "host": socket.gethostname(),
                  "acquired_at": int(time.time() * 1000), "holder": holder}
        try:
            fd = os.open(LOCK, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            with os.fdopen(fd, "w") as handle:
                handle.write(json.dumps(record) + "\n")
                handle.flush()
                os.fsync(handle.fileno())
            return record
        except FileExistsError:
            pass

        try:
            existing = json.load(open(LOCK))
            age = time.time() * 1000 - existing["acquired_at"]
            stale = (age >= STALE_MS
                     and existing.get("host") == socket.gethostname()
                     and not _alive(existing["pid"]))
        except Exception:
            stale = (time.time() - os.path.getmtime(LOCK)) * 1000 >= STALE_MS

        if stale:
            print(f"stealing abandoned vault lock at {LOCK}")
            os.unlink(LOCK)
            continue

        if time.time() > deadline:
            raise RuntimeError(f"could not get the vault write lock; {LOCK} is held. "
                               f"Nothing was written.")
        time.sleep(backoff)
        backoff = min(0.25, backoff * 1.6)

def release(record):
    try:
        current = json.load(open(LOCK))
    except Exception:
        return
    if (current.get("pid"), current.get("acquired_at")) != (record["pid"], record["acquired_at"]):
        return  # someone took it over; not ours to delete
    os.unlink(LOCK)
```

Wrap every write as:

```python
held = acquire()
try:
    ...read, modify, write via temp file + os.replace...
finally:
    release(held)
```

## Writes are still atomic

The lock is orthogonal to atomic writes and does not replace them. Every write to a vault
file goes to a temp file **in the same directory**, then `rename` / `os.replace` over the
target. iCloud syncs underneath us and a truncate-then-fill write loses data if the gap is
caught.
