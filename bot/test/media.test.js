import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { PHOTO_MARKER, VOICE_MARKER, detectCapabilities, describeCapabilities } from '../src/enrich.js'
import { attachmentName, sanitizeFilenamePart } from '../src/media.js'

const at = new Date(2026, 7, 1, 14, 32, 5)

describe('attachment naming', () => {
  test('voice notes are sortable and keep the telegram extension', () => {
    assert.equal(
      attachmentName({ at, kind: 'voice', uniqueId: 'AgADkQADbcs', filePath: 'voice/file_3.oga' }),
      '2026-08-01-143205-voice-AgADkQADbcs.oga'
    )
  })

  test('photos default to .jpg when the file_path has no extension', () => {
    assert.equal(
      attachmentName({ at, kind: 'photo', uniqueId: 'AQADabc', filePath: 'photos/file_9' }),
      '2026-08-01-143205-photo-AQADabc.jpg'
    )
  })

  test('documents keep a readable label from the original name', () => {
    assert.equal(
      attachmentName({ at, kind: 'document', uniqueId: 'BQAD1', originalName: 'CMU Offer Letter.pdf' }),
      '2026-08-01-143205-document-BQAD1-CMU-Offer-Letter.pdf'
    )
  })

  test('names never contain characters that break a wikilink or a path', () => {
    const name = attachmentName({
      at,
      kind: 'document',
      uniqueId: 'a/b\\c:d*e?f"g<h>i|j',
      originalName: '../../etc/pass [word]#1.txt',
    })
    for (const ch of ['/', '\\', ':', '*', '?', '"', '<', '>', '|', '[', ']', '#', '^']) {
      assert.ok(!name.includes(ch), `name should not contain ${ch}: ${name}`)
    }
    assert.ok(!name.includes('..'))
  })

  test('sanitize collapses whitespace and trims separators', () => {
    assert.equal(sanitizeFilenamePart('  hello   world  '), 'hello-world')
    assert.equal(sanitizeFilenamePart('---x---'), 'x')
    assert.equal(sanitizeFilenamePart(''), '')
  })

  test('an absurd extension is clamped rather than trusted', () => {
    const name = attachmentName({ at, kind: 'document', uniqueId: 'x', filePath: `f.${'z'.repeat(80)}` })
    assert.ok(name.length < 80, name)
  })
})

describe('local enrichment capability probe', () => {
  test('reports what this machine actually has', async () => {
    const caps = await detectCapabilities({ force: true })
    // Assert the shape, not the answer — the answer depends on what is installed.
    assert.ok(caps.transcriber === null || typeof caps.transcriber.bin === 'string')
    assert.ok(caps.ocr === null || typeof caps.ocr.bin === 'string')
    const description = describeCapabilities(caps)
    assert.match(description, /transcription: .+ · ocr: .+/)
  })

  test('degradation markers are honest, not fake transcripts', () => {
    assert.equal(VOICE_MARKER, '[voice, untranscribed]')
    assert.equal(PHOTO_MARKER, '[photo, no-ocr]')
  })
})
