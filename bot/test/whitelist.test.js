/**
 * C2 — the whitelist is exercised directly with synthetic updates, so no second
 * Telegram account is needed to prove a foreign sender gets nothing.
 */
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { whitelist } from '../src/whitelist.js'

const ALLOWED = 8700693189
const FOREIGN = 111222333

function ctxFor(fromId, { updateId = 7 } = {}) {
  return {
    update: { update_id: updateId },
    from: fromId === null ? undefined : { id: fromId, is_bot: false, first_name: 'X' },
    chat: { id: fromId ?? 0, type: 'private' },
    message: { message_id: 1, text: 'secret content that must never be logged' },
  }
}

async function runMiddleware(mw, ctx) {
  let nextCalled = false
  await mw(ctx, async () => {
    nextCalled = true
  })
  return nextCalled
}

describe('whitelist middleware (C2)', () => {
  test('lets the whitelisted user through', async () => {
    const mw = whitelist(ALLOWED)
    assert.equal(await runMiddleware(mw, ctxFor(ALLOWED)), true)
  })

  test('a foreign user id never reaches a handler', async () => {
    const rejects = []
    const mw = whitelist(ALLOWED, { onReject: (d) => rejects.push(d) })
    assert.equal(await runMiddleware(mw, ctxFor(FOREIGN)), false)
    assert.equal(rejects.length, 1)
    assert.equal(rejects[0].from_id, FOREIGN)
  })

  test('an update with no sender is rejected', async () => {
    const mw = whitelist(ALLOWED)
    assert.equal(await runMiddleware(mw, ctxFor(null)), false)
  })

  test('a string id that would == the number is still rejected', async () => {
    const mw = whitelist(ALLOWED)
    assert.equal(await runMiddleware(mw, ctxFor(String(ALLOWED))), false)
  })

  test('off-by-one ids are rejected', async () => {
    const mw = whitelist(ALLOWED)
    assert.equal(await runMiddleware(mw, ctxFor(ALLOWED + 1)), false)
    assert.equal(await runMiddleware(mw, ctxFor(ALLOWED - 1)), false)
  })

  test('rejection reports no reply and performs no write', async () => {
    const mw = whitelist(ALLOWED)
    const ctx = ctxFor(FOREIGN)
    let replied = false
    ctx.reply = () => {
      replied = true
    }
    assert.equal(await runMiddleware(mw, ctx), false)
    assert.equal(replied, false, 'middleware must not reply to a foreign sender')
  })

  test('refuses to build a whitelist from a non-id', () => {
    for (const bad of [undefined, null, 0, -1, NaN, 1.5, '8700693189']) {
      assert.throws(() => whitelist(bad), /positive integer/)
    }
  })
})
