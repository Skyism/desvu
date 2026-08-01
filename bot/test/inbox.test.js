import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { after, before, describe, test } from 'node:test'
import {
  appendInboxLine,
  captureToInbox,
  foldText,
  formatDay,
  formatInboxLine,
  formatTime,
  inboxFilePath,
} from '../src/inbox.js'
import { makeTempVault } from './helpers.js'

describe('inbox line formatter', () => {
  const at = new Date(2026, 7, 1, 14, 32, 5) // 2026-08-01 14:32:05 local

  test('matches the shared contract exactly', () => {
    assert.equal(
      formatInboxLine({ text: 'the raw text exactly as sent', at }),
      '- [ ] 14:32 · telegram · the raw text exactly as sent'
    )
  })

  test('pads single-digit hours and minutes', () => {
    const early = new Date(2026, 0, 9, 7, 5, 0)
    assert.equal(formatTime(early), '07:05')
    assert.equal(formatDay(early), '2026-01-09')
  })

  test('appends an attachment wikilink', () => {
    assert.equal(
      formatInboxLine({ text: '[voice, untranscribed]', at, attachment: '2026-08-01-143205-voice-abc.ogg' }),
      '- [ ] 14:32 · telegram · [voice, untranscribed] → [[Attachments/2026-08-01-143205-voice-abc.ogg]]'
    )
  })

  test('an attachment path is reduced to its bare filename', () => {
    const line = formatInboxLine({ text: 'x', at, attachment: 'Attachments/photo.jpg' })
    assert.ok(line.endsWith('→ [[Attachments/photo.jpg]]'), line)
  })

  test('captures links verbatim, no unfurling', () => {
    const url = 'https://example.com/a?b=c&d=e#frag'
    assert.equal(formatInboxLine({ text: url, at }), `- [ ] 14:32 · telegram · ${url}`)
  })

  test('folds newlines so one capture stays one line', () => {
    assert.equal(foldText('buy milk\nbuy eggs'), 'buy milk buy eggs')
    assert.equal(foldText('  padded  \n\n  lines  '), 'padded lines')
    assert.equal(foldText(''), '')
  })

  test('preserves the middle-dot separator and unicode content', () => {
    const line = formatInboxLine({ text: 'café · résumé — déjà vu', at })
    assert.equal(line, '- [ ] 14:32 · telegram · café · résumé — déjà vu')
  })

  test('never emits an embedded newline', () => {
    const line = formatInboxLine({ text: 'a\nb\r\nc', at })
    assert.ok(!line.includes('\n'))
    assert.ok(!line.includes('\r'))
  })
})

describe('day file creation and appends', () => {
  let vault

  before(async () => {
    vault = await makeTempVault('inbox')
  })
  after(async () => {
    await vault.cleanup()
  })

  test('creates Inbox/YYYY-MM-DD.md with an H1 heading', async () => {
    const at = new Date(2026, 7, 1, 9, 15, 0)
    const { file, created } = await captureToInbox({ text: 'first capture', at })
    assert.equal(created, true)
    assert.equal(file, path.join(vault.root, 'Inbox', '2026-08-01.md'))
    assert.equal(
      await readFile(file, 'utf8'),
      '# 2026-08-01\n\n- [ ] 09:15 · telegram · first capture\n'
    )
  })

  test('appends to an existing day file without re-writing the heading', async () => {
    const at = new Date(2026, 7, 1, 9, 46, 0)
    const { created, file } = await captureToInbox({ text: 'second capture', at })
    assert.equal(created, false)
    const body = await readFile(file, 'utf8')
    assert.equal(body.match(/^# 2026-08-01$/gm).length, 1)
    assert.deepEqual(body.trimEnd().split('\n').slice(2), [
      '- [ ] 09:15 · telegram · first capture',
      '- [ ] 09:46 · telegram · second capture',
    ])
  })

  test('a different day gets its own file', async () => {
    const at = new Date(2026, 7, 2, 0, 1, 0)
    const { file } = await captureToInbox({ text: 'next day', at })
    assert.equal(path.basename(file), '2026-08-02.md')
    const files = (await readdir(path.join(vault.root, 'Inbox'))).sort()
    assert.deepEqual(files, ['2026-08-01.md', '2026-08-02.md'])
  })

  test('50 concurrent appends produce 50 intact lines and one heading', async () => {
    const at = new Date(2026, 7, 3, 12, 0, 0)
    const file = inboxFilePath(at, vault.root)
    await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        appendInboxLine(formatInboxLine({ text: `concurrent ${i}`, at }), { at })
      )
    )
    const lines = (await readFile(file, 'utf8')).split('\n').filter((l) => l !== '')
    assert.equal(lines.filter((l) => l === '# 2026-08-03').length, 1)
    const captures = lines.filter((l) => l.startsWith('- [ ] '))
    assert.equal(captures.length, 50)
    // every line is well-formed — no interleaved/torn writes
    for (const line of captures) {
      assert.match(line, /^- \[ \] 12:00 · telegram · concurrent \d+$/)
    }
    assert.equal(new Set(captures).size, 50)
  })
})
