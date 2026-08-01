/**
 * C9 / C10 end-to-end, minus Telegram itself.
 *
 * A local HTTP server stands in for api.telegram.org's file host, so the real
 * download → Attachments/ → local enrichment → Inbox line path runs for a photo
 * and for a voice note, against a temp vault.
 */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, describe, test } from 'node:test'
import { PHOTO_MARKER, VOICE_MARKER, detectCapabilities, ocr } from '../src/enrich.js'
import { formatInboxLine } from '../src/inbox.js'
import { createBot } from '../src/index.js'
import { FAKE_BOT_INFO, FAKE_TOKEN, makeTempVault } from './helpers.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE = path.join(HERE, 'fixtures', 'ocr-receipt.png')
const ALLOWED = 8700693189

function mediaUpdate({ kind, payload, updateId, date, caption }) {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date,
      chat: { id: ALLOWED, type: 'private', first_name: 'T' },
      from: { id: ALLOWED, is_bot: false, first_name: 'T' },
      ...(caption ? { caption } : {}),
      [kind]: payload,
    },
  }
}

describe('media capture end-to-end (C9, C10)', () => {
  let vault
  let server
  let previousApiRoot
  let fixtureBytes

  before(async () => {
    vault = await makeTempVault('media')
    fixtureBytes = await readFile(FIXTURE)

    server = createServer((req, res) => {
      // Serve the fixture for an image path, arbitrary bytes for anything else.
      if (req.url.endsWith('.png') || req.url.endsWith('.jpg')) {
        res.writeHead(200, { 'content-type': 'image/png' })
        res.end(fixtureBytes)
      } else if (req.url.includes('missing')) {
        res.writeHead(404)
        res.end('not found')
      } else {
        res.writeHead(200, { 'content-type': 'application/octet-stream' })
        res.end(Buffer.from('OggS-not-really-audio'))
      }
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    previousApiRoot = process.env.DESVU_TELEGRAM_API_ROOT
    process.env.DESVU_TELEGRAM_API_ROOT = `http://127.0.0.1:${server.address().port}`
  })

  after(async () => {
    if (previousApiRoot === undefined) delete process.env.DESVU_TELEGRAM_API_ROOT
    else process.env.DESVU_TELEGRAM_API_ROOT = previousApiRoot
    await new Promise((resolve) => server.close(resolve))
    await vault.cleanup()
  })

  /** Bot whose getFile returns a canned file_path; everything else is recorded. */
  function makeBot(filePath) {
    const calls = []
    const bot = createBot({ token: FAKE_TOKEN, allowedUserId: ALLOWED })
    bot.botInfo = FAKE_BOT_INFO
    bot.api.config.use(async (_prev, method, payload) => {
      calls.push({ method, payload })
      if (method === 'getFile') {
        return { ok: true, result: { file_id: 'x', file_unique_id: 'UNIQ1', file_path: filePath } }
      }
      return { ok: true, result: { message_id: 1, date: 0, chat: { id: 1, type: 'private' } } }
    })
    return { bot, calls }
  }

  test('a photo is saved to Attachments/ and referenced from the Inbox line', async () => {
    const { bot, calls } = makeBot('photos/file_1.png')
    const date = Math.floor(new Date(2026, 8, 1, 13, 20, 0).getTime() / 1000)
    await bot.handleUpdate(
      mediaUpdate({
        kind: 'photo',
        updateId: 30,
        date,
        payload: [
          { file_id: 'small', file_unique_id: 'SMALL', width: 90, height: 120, file_size: 900 },
          { file_id: 'large', file_unique_id: 'LARGE', width: 1280, height: 1706, file_size: 90000 },
        ],
      })
    )

    // C10 — the largest size is the one requested.
    const getFile = calls.find((c) => c.method === 'getFile')
    assert.equal(getFile.payload.file_id, 'large', 'must download the largest PhotoSize')

    const attachments = await readdir(path.join(vault.root, 'Attachments'))
    assert.equal(attachments.length, 1)
    const name = attachments[0]
    assert.match(name, /^2026-09-01-132000-photo-LARGE\.png$/)
    const saved = await readFile(path.join(vault.root, 'Attachments', name))
    assert.equal(saved.length, fixtureBytes.length, 'bytes should round-trip intact')

    const body = await readFile(path.join(vault.root, 'Inbox', '2026-09-01.md'), 'utf8')
    const line = body.trim().split('\n').at(-1)
    assert.ok(line.startsWith('- [ ] 13:20 · telegram · '), line)
    assert.ok(line.endsWith(`→ [[Attachments/${name}]]`), line)

    const caps = await detectCapabilities()
    if (caps.ocr) {
      assert.ok(line.includes('RECEIPT'), `OCR text should be in the line: ${line}`)
      assert.ok(!line.includes(PHOTO_MARKER), 'do not mark a photo that was actually OCRd')
    } else {
      assert.ok(line.includes(PHOTO_MARKER), line)
    }
  })

  test('a photo caption is kept alongside the OCR text', async () => {
    const { bot } = makeBot('photos/file_2.png')
    const date = Math.floor(new Date(2026, 8, 2, 9, 5, 0).getTime() / 1000)
    await bot.handleUpdate(
      mediaUpdate({
        kind: 'photo',
        updateId: 31,
        date,
        caption: 'lunch receipt',
        payload: [{ file_id: 'only', file_unique_id: 'ONLY1', width: 800, height: 600 }],
      })
    )
    const body = await readFile(path.join(vault.root, 'Inbox', '2026-09-02.md'), 'utf8')
    const line = body.trim().split('\n').at(-1)
    assert.ok(line.includes('lunch receipt'), line)
  })

  test('a voice note is saved and marked honestly when no transcriber exists', async () => {
    const { bot } = makeBot('voice/file_3.oga')
    const date = Math.floor(new Date(2026, 8, 3, 18, 45, 0).getTime() / 1000)
    await bot.handleUpdate(
      mediaUpdate({
        kind: 'voice',
        updateId: 32,
        date,
        payload: { file_id: 'v1', file_unique_id: 'VOICE1', duration: 6, mime_type: 'audio/ogg' },
      })
    )

    const attachments = await readdir(path.join(vault.root, 'Attachments'))
    const voice = attachments.find((f) => f.includes('-voice-'))
    assert.ok(voice, `expected a voice attachment in ${attachments.join(', ')}`)
    assert.match(voice, /^2026-09-03-184500-voice-VOICE1\.oga$/)

    const body = await readFile(path.join(vault.root, 'Inbox', '2026-09-03.md'), 'utf8')
    const line = body.trim().split('\n').at(-1)
    assert.ok(line.endsWith(`→ [[Attachments/${voice}]]`), line)

    const caps = await detectCapabilities()
    if (!caps.transcriber) {
      // C9 degradation: the audio is kept, the line says plainly that it is not transcribed.
      assert.ok(line.includes(VOICE_MARKER), line)
    }
  })

  test('a failed download still produces a capture rather than losing it', async () => {
    const { bot, calls } = makeBot('voice/missing.oga')
    const date = Math.floor(new Date(2026, 8, 4, 7, 30, 0).getTime() / 1000)
    await bot.handleUpdate(
      mediaUpdate({
        kind: 'voice',
        updateId: 33,
        date,
        caption: 'thought about the offer',
        payload: { file_id: 'v2', file_unique_id: 'VOICE2', duration: 3 },
      })
    )
    const body = await readFile(path.join(vault.root, 'Inbox', '2026-09-04.md'), 'utf8')
    assert.match(body, /\[voice, download-failed\]/)
    assert.match(body, /thought about the offer/)
    const sends = calls.filter((c) => c.method === 'sendMessage')
    assert.match(sends.at(-1).payload.text, /download failed/)
    assert.equal(existsSync(path.join(vault.root, 'Journal')), false)
  })
})

describe('OCR against the real engine', () => {
  test('tesseract reads the fixture, or is honestly absent', async () => {
    const caps = await detectCapabilities()
    const result = await ocr(FIXTURE)
    if (!caps.ocr) {
      assert.equal(result, null)
      return
    }
    assert.ok(result, 'ocr should return text when an engine is present')
    assert.match(result.text, /RECEIPT/i)
    const line = formatInboxLine({
      text: result.text,
      at: new Date(2026, 7, 1, 14, 32, 0),
      attachment: 'photo.png',
    })
    assert.ok(!line.includes('\n'), 'multi-line OCR must fold onto one capture line')
    assert.match(line, /^- \[ \] 14:32 · telegram · RECEIPT .*→ \[\[Attachments\/photo\.png\]\]$/)
  })
})
