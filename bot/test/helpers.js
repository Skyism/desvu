/**
 * Test scaffolding.
 *
 * Every test that writes runs against a throwaway vault under os.tmpdir(), pointed at
 * by DESVU_VAULT. The real vault is never touched by the test suite.
 */
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { clearVaultPathCache } from '../src/vault.js'

/** Create a temp vault and point DESVU_VAULT at it. Returns { root, cleanup }. */
export async function makeTempVault(label = 'vault') {
  const root = await mkdtemp(path.join(tmpdir(), `desvu-test-${label}-`))
  // isVault() requires data/ — same check the app makes.
  await mkdir(path.join(root, 'data'), { recursive: true })
  const previous = process.env.DESVU_VAULT
  process.env.DESVU_VAULT = root
  clearVaultPathCache()

  return {
    root,
    async cleanup() {
      if (previous === undefined) delete process.env.DESVU_VAULT
      else process.env.DESVU_VAULT = previous
      clearVaultPathCache()
      await rm(root, { recursive: true, force: true })
    },
  }
}

/** A syntactically valid, entirely fake bot token. Never hits the network. */
export const FAKE_TOKEN = '1234567890:AAFakeTokenForTestsOnly_NotARealSecret'

export const FAKE_BOT_INFO = {
  id: 1234567890,
  is_bot: true,
  first_name: 'desvu-test',
  username: 'desvu_test_bot',
  can_join_groups: false,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
}

/** Build a minimal Telegram `message` update. */
export function textUpdate({ userId, text, updateId = 1, date = Math.floor(Date.now() / 1000) }) {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date,
      chat: { id: userId, type: 'private', first_name: 'T' },
      from: { id: userId, is_bot: false, first_name: 'T' },
      text,
    },
  }
}
