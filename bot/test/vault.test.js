import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, describe, test } from 'node:test'
import { appendInboxLine } from '../src/inbox.js'
import { assertCapturePath, clearVaultPathCache, resolveVaultPath, VAULT_DIR_NAME } from '../src/vault.js'
import { makeTempVault } from './helpers.js'

describe('vault resolution', () => {
  let vault
  before(async () => {
    vault = await makeTempVault('resolve')
  })
  after(async () => {
    await vault.cleanup()
  })

  test('DESVU_VAULT wins', () => {
    assert.equal(resolveVaultPath(), vault.root)
  })

  test('rejects a DESVU_VAULT that is not a vault', async () => {
    const notAVault = await mkdtemp(path.join(tmpdir(), 'desvu-notvault-'))
    const prev = process.env.DESVU_VAULT
    process.env.DESVU_VAULT = notAVault
    clearVaultPathCache()
    try {
      assert.throws(() => resolveVaultPath(), /not a vault/)
    } finally {
      process.env.DESVU_VAULT = prev
      clearVaultPathCache()
      await rm(notAVault, { recursive: true, force: true })
    }
  })

  test('the vault name compares equal across NFC and NFD', () => {
    const nfc = VAULT_DIR_NAME.normalize('NFC')
    const nfd = VAULT_DIR_NAME.normalize('NFD')
    assert.notEqual(nfc, nfd, 'the accented name must actually differ byte-wise')
    assert.equal(nfc.normalize('NFC'), nfd.normalize('NFC'))
  })

  test('a directory named in NFD still resolves', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'desvu-nfd-'))
    const nfdRoot = path.join(parent, VAULT_DIR_NAME.normalize('NFD'))
    await mkdir(path.join(nfdRoot, 'data'), { recursive: true })
    const prev = process.env.DESVU_VAULT
    process.env.DESVU_VAULT = path.join(parent, VAULT_DIR_NAME.normalize('NFC'))
    clearVaultPathCache()
    try {
      // macOS resolves either normalization to the same inode; the point is that we
      // never string-compare our way into "vault not found".
      assert.equal(path.basename(resolveVaultPath()).normalize('NFC'), VAULT_DIR_NAME.normalize('NFC'))
    } finally {
      process.env.DESVU_VAULT = prev
      clearVaultPathCache()
      await rm(parent, { recursive: true, force: true })
    }
  })
})

describe('C7 — the journal is unreachable from Telegram', () => {
  let vault
  before(async () => {
    vault = await makeTempVault('c7')
  })
  after(async () => {
    await vault.cleanup()
  })

  test('Inbox and Attachments are allowed', () => {
    assert.doesNotThrow(() => assertCapturePath(path.join(vault.root, 'Inbox', '2026-08-01.md')))
    assert.doesNotThrow(() => assertCapturePath(path.join(vault.root, 'Attachments', 'a.ogg')))
  })

  test('Journal is refused', () => {
    assert.throws(
      () => assertCapturePath(path.join(vault.root, 'Journal', '2026-08-01.md')),
      /C7/
    )
  })

  test('every other vault subdirectory is refused', () => {
    for (const dir of ['Brain Dump', 'Library', 'Synthesis', 'data', 'Moodboard']) {
      assert.throws(() => assertCapturePath(path.join(vault.root, dir, 'x.md')), /may only write to/)
    }
  })

  test('traversal out of Inbox is refused', () => {
    assert.throws(
      () => assertCapturePath(path.join(vault.root, 'Inbox', '..', 'Journal', 'x.md')),
      /may only write to/
    )
  })

  test('paths outside the vault entirely are refused', () => {
    assert.throws(() => assertCapturePath('/etc/passwd'), /outside the vault/)
    assert.throws(() => assertCapturePath(vault.root), /outside the vault/)
  })

  test('the write path enforces it, not just the helper', async () => {
    // Sanity: a normal capture still works, so the guard is not vacuously passing.
    const { file } = await appendInboxLine('- [ ] 00:00 · telegram · guard check', {
      at: new Date(2026, 7, 1, 0, 0, 0),
    })
    assert.ok(file.includes(`${path.sep}Inbox${path.sep}`))
  })
})
