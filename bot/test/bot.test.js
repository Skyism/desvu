/**
 * End-to-end through the real grammY middleware stack, with synthetic updates and a
 * transformer standing in for the Telegram API. No network, no real vault.
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { after, before, describe, test } from 'node:test'
import { createBot } from '../src/index.js'
import { FAKE_BOT_INFO, FAKE_TOKEN, makeTempVault, textUpdate } from './helpers.js'

const ALLOWED = 8700693189
const FOREIGN = 555000111

/** Build a bot whose every API call is captured instead of sent. */
function makeBot() {
  const calls = []
  const bot = createBot({ token: FAKE_TOKEN, allowedUserId: ALLOWED, botInfo: FAKE_BOT_INFO })
  bot.botInfo = FAKE_BOT_INFO
  bot.api.config.use(async (_prev, method, payload) => {
    calls.push({ method, payload })
    return { ok: true, result: { message_id: calls.length, date: 0, chat: { id: 1, type: 'private' } } }
  })
  return { bot, calls }
}

describe('bot wiring', () => {
  let vault
  before(async () => {
    vault = await makeTempVault('bot')
  })
  after(async () => {
    await vault.cleanup()
  })

  test('constructs — every filter query is valid', () => {
    assert.doesNotThrow(() => createBot({ token: FAKE_TOKEN, allowedUserId: ALLOWED }))
  })

  test('a whitelisted text message lands in the Inbox and gets an ack', async () => {
    const { bot, calls } = makeBot()
    const date = Math.floor(new Date(2026, 7, 5, 16, 4, 0).getTime() / 1000)
    await bot.handleUpdate(textUpdate({ userId: ALLOWED, text: 'ship the bot', updateId: 10, date }))

    const file = path.join(vault.root, 'Inbox', '2026-08-05.md')
    assert.ok(existsSync(file), 'day file should exist')
    const body = await readFile(file, 'utf8')
    assert.equal(body, '# 2026-08-05\n\n- [ ] 16:04 · telegram · ship the bot\n')

    const sends = calls.filter((c) => c.method === 'sendMessage')
    assert.equal(sends.length, 1)
    assert.equal(sends[0].payload.text, '✓ inbox')
  })

  test('C2 — a foreign sender gets no reply and writes nothing', async () => {
    const { bot, calls } = makeBot()
    const date = Math.floor(new Date(2026, 7, 6, 11, 0, 0).getTime() / 1000)
    await bot.handleUpdate(textUpdate({ userId: FOREIGN, text: 'let me in', updateId: 11, date }))

    assert.equal(calls.length, 0, 'no API call may be made for a foreign sender')
    assert.equal(existsSync(path.join(vault.root, 'Inbox', '2026-08-06.md')), false)
  })

  test('a link is captured verbatim', async () => {
    const { bot } = makeBot()
    const date = Math.floor(new Date(2026, 7, 7, 8, 30, 0).getTime() / 1000)
    const url = 'https://arxiv.org/abs/2401.00001?utm_source=x'
    await bot.handleUpdate(textUpdate({ userId: ALLOWED, text: url, updateId: 12, date }))
    const body = await readFile(path.join(vault.root, 'Inbox', '2026-08-07.md'), 'utf8')
    assert.ok(body.includes(`- [ ] 08:30 · telegram · ${url}`), body)
  })

  test('a forwarded message is captured verbatim like text', async () => {
    const { bot } = makeBot()
    const date = Math.floor(new Date(2026, 7, 8, 21, 15, 0).getTime() / 1000)
    const update = textUpdate({ userId: ALLOWED, text: 'forwarded thought', updateId: 13, date })
    update.message.forward_origin = {
      type: 'user',
      date,
      sender_user: { id: 999, is_bot: false, first_name: 'Someone' },
    }
    await bot.handleUpdate(update)
    const body = await readFile(path.join(vault.root, 'Inbox', '2026-08-08.md'), 'utf8')
    assert.ok(body.includes('- [ ] 21:15 · telegram · forwarded thought'), body)
  })

  test('/start and /help reply without writing to the Inbox', async () => {
    const { bot, calls } = makeBot()
    const date = Math.floor(new Date(2026, 7, 9, 10, 0, 0).getTime() / 1000)
    const update = textUpdate({ userId: ALLOWED, text: '/start', updateId: 14, date })
    update.message.entities = [{ type: 'bot_command', offset: 0, length: 6 }]
    await bot.handleUpdate(update)

    assert.equal(existsSync(path.join(vault.root, 'Inbox', '2026-08-09.md')), false)
    const sends = calls.filter((c) => c.method === 'sendMessage')
    assert.equal(sends.length, 1)
    assert.match(sends[0].payload.text, /Dès vu capture/)
    assert.ok(sends[0].payload.text.split('\n').length <= 2, 'help stays two lines')
  })

  test('C7 — no update produces a Journal/ path', async () => {
    const { bot } = makeBot()
    const date = Math.floor(new Date(2026, 7, 10, 22, 0, 0).getTime() / 1000)
    for (const text of ['/journal 7', 'journal: felt good today', 'rating 7']) {
      const update = textUpdate({ userId: ALLOWED, text, updateId: 20, date })
      if (text.startsWith('/')) update.message.entities = [{ type: 'bot_command', offset: 0, length: 8 }]
      await bot.handleUpdate(update)
    }
    assert.equal(existsSync(path.join(vault.root, 'Journal')), false)
    const dirs = await readdir(vault.root)
    assert.deepEqual(dirs.sort(), ['Inbox', 'data'])
  })

  test('an empty/whitespace-only message writes nothing', async () => {
    const { bot, calls } = makeBot()
    const date = Math.floor(new Date(2026, 7, 11, 7, 0, 0).getTime() / 1000)
    await bot.handleUpdate(textUpdate({ userId: ALLOWED, text: '   ', updateId: 15, date }))
    assert.equal(existsSync(path.join(vault.root, 'Inbox', '2026-08-11.md')), false)
    assert.equal(calls.length, 0)
  })

  test('a vault failure replies instead of dropping the capture silently', async () => {
    const previous = process.env.DESVU_VAULT
    process.env.DESVU_VAULT = path.join(vault.root, 'does-not-exist')
    const { clearVaultPathCache } = await import('../src/vault.js')
    clearVaultPathCache()
    try {
      const { bot, calls } = makeBot()
      const date = Math.floor(new Date(2026, 7, 12, 9, 0, 0).getTime() / 1000)
      await bot.handleUpdate(textUpdate({ userId: ALLOWED, text: 'while icloud is away', updateId: 16, date }))
      const sends = calls.filter((c) => c.method === 'sendMessage')
      assert.equal(sends.length, 1)
      assert.match(sends[0].payload.text, /not saved/)
      assert.match(sends[0].payload.text, /still in this chat/)
    } finally {
      process.env.DESVU_VAULT = previous
      clearVaultPathCache()
    }
  })

  test('a handler throwing does not escape bot.catch', async () => {
    const { bot } = makeBot()
    // Force ctx.reply to explode the way a Telegram outage would.
    bot.api.config.use(async (_prev, method) => {
      if (method === 'sendMessage') throw new Error('simulated network failure')
      return { ok: true, result: true }
    })
    const date = Math.floor(new Date(2026, 7, 13, 9, 0, 0).getTime() / 1000)
    await assert.doesNotReject(() =>
      bot.handleUpdate(textUpdate({ userId: ALLOWED, text: 'survives an api outage', updateId: 17, date }))
    )
    // The capture still landed even though the ack failed.
    const body = await readFile(path.join(vault.root, 'Inbox', '2026-08-13.md'), 'utf8')
    assert.ok(body.includes('survives an api outage'), body)
  })
})
