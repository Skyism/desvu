# Telegram capture bot — report

Stage 3 (bot half). Owner of `bot/**`. Nothing under `app/` was touched.

Last updated: 2026-08-01

---

## What landed

```
bot/
  src/
    index.js       grammY long-poll receiver, handlers, error boundary
    config.js      ~/.config/desvu/bot.env loader + C2 hard-fail validation
    whitelist.js   C2 middleware, isolated so it can be tested directly
    vault.js       vault resolution (port of app/src/shared/vault.ts) + C7 write guard
    inbox.js       the line format, day-file creation, atomic append
    media.js       attachment naming + download
    enrich.js      local-only transcription (C9) and OCR (C10) probing
    log.js         logger with a token redactor in front of it
  test/            67 tests, node --test
  launchd/com.desvu.bot.plist   written, NOT installed
```

Zero new dependencies. `grammy` is still the only one.

## How to run it

```bash
cd ~/Desktop/Vscode/desvu/bot
npm start            # node src/index.js
npm test             # node --test  (67 tests)
```

Credentials are read from `~/.config/desvu/bot.env` at startup. Nothing else is needed —
no flags, no env vars. `DESVU_VAULT` overrides the vault if you ever relocate it.

## Always-on (C4) — commands for you to run

The plist is written but deliberately **not** installed or loaded.

```bash
cp ~/Desktop/Vscode/desvu/bot/launchd/com.desvu.bot.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.desvu.bot.plist
launchctl enable gui/$(id -u)/com.desvu.bot
launchctl kickstart -p gui/$(id -u)/com.desvu.bot

# check on it
launchctl print gui/$(id -u)/com.desvu.bot | head -20
tail -f ~/Library/Logs/desvu-bot.log

# stop / uninstall
launchctl bootout gui/$(id -u)/com.desvu.bot
rm ~/Library/LaunchAgents/com.desvu.bot.plist
```

Two things about the plist worth knowing:

- It uses `/opt/homebrew/bin/node` (v23.11.0), not the nvm node, so an nvm version bump
  does not silently break the agent.
- It sets `PATH` to include `/opt/homebrew/bin`. This is load-bearing, not cosmetic:
  launchd hands out a bare `PATH`, and without it the bot's probe would not find
  `tesseract` and every photo would degrade to `[photo, no-ocr]` even though OCR works.
- It contains no credentials, by design — the bot reads the env file itself. Keep it that way;
  this file is in the git repo.

## The Inbox contract, as implemented

```
- [ ] 14:32 · telegram · the raw text exactly as sent
- [ ] 14:33 · telegram · [voice, untranscribed] → [[Attachments/2026-08-01-143305-voice-VOICE1.oga]]
- [ ] 14:35 · telegram · RECEIPT Coffee Latte 4.75 TOTAL 8.00 → [[Attachments/2026-08-01-143500-photo-LARGE.jpg]]
```

Day file is created with a `# YYYY-MM-DD` heading + blank line, via `O_CREAT|O_EXCL`, so two
concurrent captures cannot both write the heading. Appends are a single `O_APPEND` write of one
complete line — verified with 50 concurrent writers producing 50 intact, unique, well-formed lines.

Three decisions inside this contract that `/sort-inbox` and the app's quick capture (C8) need to know:

1. **Newlines fold to a single space.** One capture per line is the contract and Telegram messages
   can contain newlines. This is the *only* normalization applied to captured text — no words are
   added, removed, or reordered. It lives in one function (`foldText` in `src/inbox.js`) if you
   want a different rule.
2. **Timestamps are send time, not receipt time.** `message.date` from Telegram, converted to local.
   A message sent at 23:50 while the laptop was asleep and delivered at 08:00 lands in *yesterday's*
   day file at `23:50`, so lines inside a file stay monotonic. This matters specifically because
   long polling replays a 24h queue on wake.
3. **Attachment filenames** are `YYYY-MM-DD-HHMMSS-<kind>-<file_unique_id>[-<label>]<ext>` —
   sortable, collision-resistant, and sanitized of everything that would break a wikilink
   (`/ \ : * ? " < > | [ ] # ^`, whitespace, leading/trailing dots).

## Requirements

| | Status |
|---|---|
| C1 | ✅ grammY long polling, appends raw timestamped lines to `Inbox/YYYY-MM-DD.md` |
| C2 | ✅ single-user whitelist as middleware; hard fail on a missing/unparseable id |
| C3 | ✅ token read from `~/.config/desvu/bot.env`; grep-verified absent from repo, vault, and logs |
| C4 | ⚠️ plist written and syntax-checked, **not installed** — untested as an agent (by instruction) |
| C7 | ✅ no journal command; `assertCapturePath` refuses everything outside `Inbox/` and `Attachments/` |
| C9 | ⚠️ audio saved to `Attachments/`, line written — **degraded, no transcription** (see below) |
| C10 | ✅ largest photo saved to `Attachments/`, OCR'd with tesseract, text in the line |

C5 and C6 belong to `/sort-inbox`; C8 belongs to the app.

## Transcription and OCR — what degraded and why

Probed this machine with `which`:

| tool | present | used |
|---|---|---|
| `tesseract` 5.5.1 (eng) | yes | **yes — C10 OCR** |
| `ffmpeg` | yes | only as a converter for whisper.cpp, which is absent |
| `whisper-cli` / `whisper-cpp` / `whisper` / `mlx_whisper` | **none** | — |

**OCR (C10) works.** Verified end-to-end against a real image: tesseract read
`RECEIPT / Coffee Latte 4.75 / Bagel 3.25 / TOTAL 8.00` out of `test/fixtures/ocr-receipt.png`
and the text landed on the Inbox line with the wikilink appended.

**Transcription (C9) is degraded.** No local speech-to-text exists on this machine, and per the
brief no cloud API was added. Voice notes are downloaded to `Attachments/` and the line is written
as `[voice, untranscribed] → [[Attachments/…]]`. Nothing is fabricated and nothing is lost — the
audio sits next to the line, so a transcriber installed later can backfill.

To enable it, install **one** of these; the bot picks it up on next start, no code change:

```bash
# whisper.cpp — fastest, fully local, needs a model file
brew install whisper-cpp
mkdir -p ~/.cache/whisper.cpp
curl -L -o ~/.cache/whisper.cpp/ggml-base.en.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin
```

```bash
# or MLX (Apple Silicon, very fast)
pipx install mlx-whisper
```

```bash
# or OpenAI's reference CLI (local inference; downloads weights on first run)
pipx install openai-whisper
```

The probe looks for a `.bin` model in `~/.cache/whisper.cpp`, `~/.local/share/whisper.cpp`,
`~/Library/Application Support/whisper.cpp`, `/opt/homebrew/share/whisper-cpp`, or wherever
`DESVU_WHISPER_MODEL` points. If it finds a whisper binary but no model it says so at startup
rather than pretending. `ffmpeg` is already installed, so the OGG→16kHz WAV conversion
whisper.cpp needs is covered.

macOS Vision OCR was evaluated first, since it would need no install at all. A JXA
(`osascript -l JavaScript`) bridge to `VNRecognizeTextRequest` returned zero observations and no
error on macOS 26.5.2 — the bridge appears not to work there. Rather than ship something that
silently returns nothing, OCR uses tesseract, which was tested and does work.

## Verified

Run `npm test` in `bot/` — 67 tests, all passing, all against a temp vault under `os.tmpdir()`
pointed at by `DESVU_VAULT`. **The real vault was never written to by the suite** (confirmed:
`Inbox/` and `Attachments/` are still empty).

- **Real Telegram API.** `getMe` → `@skyismdesvu_bot` (id 8789118790), `is_bot: true`.
  `getWebhookInfo` → no webhook URL set, so long polling is unobstructed.
- **Live process.** Started `node src/index.js` against the real vault, connected, long polled
  for ~3 minutes with no errors, then exited cleanly on `SIGTERM` (exit 0). Startup resolves
  `~/Documents/Dès vu` and logs the token as `<redacted:8789118790:…>`.
- **C2.** The middleware is tested directly with synthetic updates: the allowed id passes; a
  foreign id, a missing sender, a *string* `"8700693189"`, and ±1 off-by-one ids are all rejected
  with no `next()` and no reply. Also tested through the full grammY stack — a foreign update
  produced **zero API calls and zero files**. Config-level: a missing, non-numeric, `"12.5"`,
  `"123abc"`, `"1e3"`, `"0x10"`, `"-1"` or `"0"` id all throw at startup rather than running open.
- **Inbox format.** Exact-string assertions on the contract line, zero-padding, attachment
  wikilinks, unicode/middle-dot content, links verbatim, and "never emits an embedded newline".
- **Day files.** Created with the heading, appended without duplicating it, separate file per day,
  and 50 concurrent appends → 50 intact unique lines + exactly one heading.
- **C7.** `Journal/`, `Brain Dump/`, `Library/`, `Synthesis/`, `data/`, `Moodboard/`, `../` traversal
  and absolute paths outside the vault are all refused. Full-stack: after sending `/journal 7`,
  `journal: felt good today`, and `rating 7`, the vault contained only `Inbox/` and `data/` —
  the messages were captured verbatim into the Inbox, which is correct dumb-receiver behavior.
- **C10 end-to-end.** A local HTTP server stood in for the Telegram file host. A two-size photo
  update selected the **largest** `PhotoSize`, downloaded 13310 bytes intact, OCR'd them with the
  real tesseract, and wrote
  `- [ ] 13:20 · telegram · RECEIPT … → [[Attachments/2026-09-01-132000-photo-LARGE.png]]`.
  Captions are kept alongside the OCR text.
- **C9 end-to-end** (minus transcription): voice update → `2026-09-03-184500-voice-VOICE1.oga` in
  `Attachments/`, line ends with the wikilink and carries `[voice, untranscribed]`.
- **Failure paths.** A 404 on download still writes a capture (`[voice, download-failed]` plus any
  caption) and tells the user. An unreachable vault replies *"not saved … still in this chat"*
  instead of dropping silently. A `sendMessage` that throws mid-handler does not escape `bot.catch`,
  and the capture still lands.
- **Secret hygiene.** Grepped the actual token value across the whole repo, the whole vault, and
  the live log: absent from all three. `describeConfig` and the invalid-token error path are
  tested to never echo it, and `redact()` scrubs both registered secrets and anything
  token-shaped (the file-download URL embeds the token, which is the real leak risk).

## Not verified — stated plainly

- **A real message from your phone has never been delivered.** I cannot send Telegram messages as
  user 8700693189, so the last leg — your phone → Telegram → this bot — is untested. Everything
  behind it was exercised through grammY's real middleware stack with synthetic updates. This is
  the one thing worth trying by hand: start the bot, text it "hello", expect `✓ inbox` and a line
  in `Inbox/2026-08-01.md`.
- **The 24h offline queue** (laptop asleep → wake → replay) is not tested. It rests on Telegram's
  documented server-side retention plus `drop_pending_updates` being left false, which it is.
- **launchd** is unverified on this machine because I did not install it, as instructed. The plist
  passes `plutil -lint`; `RunAtLoad`/`KeepAlive` behavior is untested until you bootstrap it.
- **Live 429 / network-outage backoff** was not induced. grammY 1.45.1's polling loop was read
  directly: it retries `getUpdates` with exponential backoff and honors `retry_after` on 429.
  What I tested is that handler-level throws don't kill the process.
- **Voice transcription quality** — nothing to test, no engine installed.

## Left undone / notes for the orchestrator

- `/sort-inbox` will need to consume the attachment wikilink form above, and should know that
  `[voice, untranscribed]` and `[photo, no-ocr]` mean "the media is there, the text is not" —
  those lines should stay in the Inbox rather than being routed on empty text.
- Non-media messages the bot cannot represent (sticker, location, venue, contact, poll, dice,
  story) are captured as `[<kind>, unsupported by the bot]` rather than dropped. If any of those
  should become real captures, say so.
- `DESVU_TELEGRAM_API_ROOT` overrides the file-download host. It exists for the test server, and
  would also let the bot use a self-hosted Bot API server later (which would lift the 20 MB
  `getFile` limit — currently a large voice note or video will hit the download-failed path).
- Nothing is committed. `bot/package.json` has one change: the `test` script is now `node --test`
  (`node --test test/` fails on Node 23 — it tries to `require` the directory).
- The bot is not running right now. Start it with `npm start`, or install the LaunchAgent above.
