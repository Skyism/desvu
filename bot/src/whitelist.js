/**
 * C2 — exactly one Telegram user id may reach a handler.
 *
 * This is middleware, installed before every handler, so there is no route that can
 * bypass it: a rejected update simply never calls next(). Rejections produce no reply,
 * no vault write, and a log line that records the sender id but never the content.
 */
import { log } from './log.js'

/**
 * @param {number} allowedUserId  validated by config.parseAllowedUserId (hard fail upstream)
 * @param {object} [hooks]        onReject — test seam
 */
export function whitelist(allowedUserId, { onReject } = {}) {
  if (!Number.isSafeInteger(allowedUserId) || allowedUserId <= 0) {
    // Defence in depth: config validates this, but a bad value must never mean "allow all".
    throw new Error('whitelist() requires a positive integer Telegram user id')
  }

  return async function whitelistMiddleware(ctx, next) {
    const senderId = ctx?.from?.id
    if (senderId === allowedUserId) {
      await next()
      return
    }
    const detail = {
      update_id: ctx?.update?.update_id ?? null,
      from_id: senderId ?? null,
      chat_type: ctx?.chat?.type ?? null,
    }
    // Content is never logged — only who tried.
    log.warn(
      `[whitelist] rejected update_id=${detail.update_id} from_id=${detail.from_id} ` +
        `chat_type=${detail.chat_type} — no reply, no write`
    )
    onReject?.(detail)
    // No next(): the update dies here.
  }
}
