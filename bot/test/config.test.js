import assert from 'node:assert/strict'
import { writeFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, describe, test } from 'node:test'
import { describeConfig, loadConfig, parseAllowedUserId, parseEnvFile } from '../src/config.js'
import { redact, registerSecret } from '../src/log.js'

const GOOD_TOKEN = '8700693189:AAH_this_is_not_the_real_token_x1'

describe('env file parsing', () => {
  test('ignores comments and blank lines, keeps values containing =', () => {
    const parsed = parseEnvFile(
      ['# a comment', '', 'A=1', 'B = two ', 'C="quoted"', "D='single'", 'E=a=b=c', 'nonsense'].join('\n')
    )
    assert.deepEqual({ ...parsed }, { A: '1', B: 'two', C: 'quoted', D: 'single', E: 'a=b=c' })
  })
})

describe('allowed user id (C2 hard fail)', () => {
  test('accepts a plain numeric id', () => {
    assert.equal(parseAllowedUserId('8700693189'), 8700693189)
    assert.equal(parseAllowedUserId(' 42 '), 42)
  })

  test('refuses anything that is not entirely digits — no parseInt-style coercion', () => {
    for (const bad of [undefined, null, '', '  ', 'abc', '123abc', '12.5', '-1', '+7', '1e3', '0x10']) {
      assert.throws(() => parseAllowedUserId(bad), /Refusing to start|not set/, `should reject ${JSON.stringify(bad)}`)
    }
  })

  test('refuses zero', () => {
    assert.throws(() => parseAllowedUserId('0'), /Refusing to start/)
  })
})

describe('loadConfig', () => {
  let dir

  before(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'desvu-cfg-'))
  })
  after(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  const write = async (name, body) => {
    const p = path.join(dir, name)
    await writeFile(p, body)
    return p
  }

  test('loads a well-formed credentials file', async () => {
    const envPath = await write(
      'good.env',
      `# comment\nTELEGRAM_BOT_TOKEN=${GOOD_TOKEN}\nTELEGRAM_BOT_USERNAME=skyismdesvu_bot\nTELEGRAM_ALLOWED_USER_ID=8700693189\n`
    )
    const config = loadConfig({ envPath, env: {} })
    assert.equal(config.allowedUserId, 8700693189)
    assert.equal(config.botUsername, 'skyismdesvu_bot')
    assert.equal(config.token, GOOD_TOKEN)
  })

  test('refuses to start when the allow-list is missing', async () => {
    const envPath = await write('no-id.env', `TELEGRAM_BOT_TOKEN=${GOOD_TOKEN}\n`)
    assert.throws(() => loadConfig({ envPath, env: {} }), /TELEGRAM_ALLOWED_USER_ID is not set/)
  })

  test('refuses to start when the allow-list is unparseable', async () => {
    const envPath = await write('bad-id.env', `TELEGRAM_BOT_TOKEN=${GOOD_TOKEN}\nTELEGRAM_ALLOWED_USER_ID=everyone\n`)
    assert.throws(() => loadConfig({ envPath, env: {} }), /must be a positive integer/)
  })

  test('refuses to start when the credentials file is absent', () => {
    assert.throws(
      () => loadConfig({ envPath: path.join(dir, 'nope.env'), env: {} }),
      /Could not read credentials/
    )
  })

  test('refuses a token that is not token-shaped', async () => {
    const envPath = await write('bad-token.env', 'TELEGRAM_BOT_TOKEN=hunter2\nTELEGRAM_ALLOWED_USER_ID=1\n')
    assert.throws(() => loadConfig({ envPath, env: {} }), /does not look like a Telegram bot token/)
  })

  test('an invalid-token error never echoes the value', async () => {
    const envPath = await write('leak.env', 'TELEGRAM_BOT_TOKEN=sup3rs3cr3t\nTELEGRAM_ALLOWED_USER_ID=1\n')
    try {
      loadConfig({ envPath, env: {} })
      assert.fail('should have thrown')
    } catch (err) {
      assert.ok(!err.message.includes('sup3rs3cr3t'), err.message)
    }
  })
})

describe('redaction', () => {
  test('describeConfig never returns the token', () => {
    const described = describeConfig({
      token: GOOD_TOKEN,
      allowedUserId: 1,
      botUsername: 'b',
      envPath: '/x',
    })
    assert.ok(!JSON.stringify(described).includes(GOOD_TOKEN))
    assert.match(described.token, /^<redacted:8700693189:/)
  })

  test('registered secrets are scrubbed from log input', () => {
    registerSecret(GOOD_TOKEN)
    const url = `https://api.telegram.org/file/bot${GOOD_TOKEN}/voice/file_1.oga`
    const scrubbed = redact(url)
    assert.ok(!scrubbed.includes(GOOD_TOKEN))
    assert.ok(scrubbed.includes('<redacted-token>'))
  })

  test('token-shaped strings are scrubbed even when never registered', () => {
    const scrubbed = redact('oops 9999999999:AAHsomethingsomethingsomething1234 leaked')
    assert.ok(scrubbed.includes('<redacted-token>'))
    assert.ok(!scrubbed.includes('AAHsomethingsomethingsomething1234'))
  })

  test('redacts inside Errors too', () => {
    registerSecret(GOOD_TOKEN)
    assert.ok(!redact(new Error(`failed for ${GOOD_TOKEN}`)).includes(GOOD_TOKEN))
  })
})
