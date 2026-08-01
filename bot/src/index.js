/**
 * Dès vu — Telegram capture bot.
 *
 * A dumb receiver. It appends the raw message to Inbox/YYYY-MM-DD.md and stops.
 * No parsing, no classification, no NLP — `/sort-inbox` does all routing later.
 * The split is deliberate and load-bearing; do not make this file clever.
 *
 * C1 long polling · C2 single-user whitelist · C3 token outside repo and vault
 * C7 no path to Journal/ · C9 voice · C10 photos
 */
import { pathToFileURL } from 'node:url'
import { Bot, GrammyError, HttpError } from 'grammy'
import { describeConfig, loadConfig } from './config.js'
import { PHOTO_MARKER, VOICE_MARKER, describeCapabilities, detectCapabilities, ocr, transcribe } from './enrich.js'
import { captureToInbox } from './inbox.js'
import { log, redact, registerSecret } from './log.js'
import { attachmentName, downloadAttachment } from './media.js'
import { resolveVaultPath } from './vault.js'
import { VaultLockError } from './vault-lock.js'
import { whitelist } from './whitelist.js'

const HELP = [
  'Dès vu capture. Send me anything — text, links, voice notes, photos — and it lands',
  'in your vault Inbox verbatim. Nothing is sorted here; run /sort-inbox in Claude Code for that.',
].join('\n')

/** Telegram gives message.date in epoch seconds, UTC. Captures are stamped with when
 *  the user sent them, not when we received them — messages queued while the laptop
 *  slept then keep their real time and land in the right day file. */
const sentAt = (ctx) =>
  ctx.message?.date ? new Date(ctx.message.date * 1000) : new Date()

/**
 * A capture that did not land must say so plainly. Losing a note silently is far worse
 * than an ugly message — the user's copy is still in this chat, and they can resend.
 */
function notSavedReply(err) {
  if (err instanceof VaultLockError) {
    return (
      '⚠︎ NOT saved — another Dès vu process (the app or /sort-inbox) is writing to the ' +
      'vault and did not release the lock in time. Nothing was written. Please send it again.'
    )
  }
  return `⚠︎ not saved — the vault is unreachable (${err.message.split('\n')[0]}). Your message is still in this chat; resend once it is back.`
}

/** Write a capture, or tell the user why it did not land. Never silently drops. */
async function capture(ctx, { text, attachment = null, kind = 'text' }) {
  const at = sentAt(ctx)
  try {
    const { file } = await captureToInbox({ text, at, source: 'telegram', attachment })
    log.info(`captured ${kind}${attachment ? ' +attachment' : ''} → ${file}`)
    return { ok: true }
  } catch (err) {
    log.error('capture failed:', err)
    await ctx.reply(notSavedReply(err)).catch((e) => log.error('reply failed:', e))
    return { ok: false, err }
  }
}

const ack = (ctx, suffix = '') =>
  ctx.reply(`✓ inbox${suffix}`).catch((err) => log.warn('ack failed:', err))

/**
 * Shared path for every non-text message: download to Attachments/, optionally
 * enrich locally, append one line referencing the file.
 */
async function captureMedia(ctx, { kind, fileId, uniqueId, originalName, caption, token }) {
  const at = sentAt(ctx)
  let saved = null
  try {
    const file = await ctx.getFile()
    const name = attachmentName({
      at,
      kind,
      uniqueId: uniqueId ?? file.file_unique_id,
      filePath: file.file_path,
      originalName,
    })
    saved = await downloadAttachment({ token, filePath: file.file_path, name })
    log.info(`saved attachment ${name} (${saved.bytes} bytes)`)
  } catch (err) {
    if (err instanceof VaultLockError) {
      // Not a download problem — the vault is locked. Say that, rather than filing a line
      // that blames the network for something that never reached the disk.
      log.error(`attachment write blocked by the vault lock (${kind}):`, err)
      await ctx.reply(notSavedReply(err)).catch((e) => log.error('reply failed:', e))
      return
    }
    log.error(`attachment download failed (${kind}):`, err)
    const fallback = [caption, `[${kind}, download-failed]`].filter(Boolean).join(' ')
    const res = await capture(ctx, { text: fallback, kind })
    if (res.ok) await ctx.reply(`⚠︎ inbox · ${kind} saved as text only — download failed`).catch(() => {})
    return
  }

  let enriched = null
  if (kind === 'voice' || kind === 'audio' || kind === 'video_note') {
    enriched = await transcribe(saved.path)
  } else if (kind === 'photo' || (kind === 'document' && /\.(png|jpe?g|heic|webp|tiff?|gif|bmp)$/i.test(saved.name))) {
    enriched = await ocr(saved.path)
  }

  const marker =
    kind === 'voice' || kind === 'audio' || kind === 'video_note'
      ? VOICE_MARKER
      : kind === 'photo'
        ? PHOTO_MARKER
        : `[${kind}]`

  const body = [caption, enriched ? enriched.text : marker].filter(Boolean).join(' ')
  const enrichedWord = marker === VOICE_MARKER ? 'transcript' : 'text'
  const res = await capture(ctx, { text: body, attachment: saved.name, kind })
  if (res.ok) await ack(ctx, ` · ${kind}${enriched ? ` + ${enrichedWord}` : ''}`)
}

export function createBot(config) {
  const bot = new Bot(config.token)

  // C2 first, before anything that could reply or write.
  bot.use(whitelist(config.allowedUserId))

  bot.command('start', (ctx) => ctx.reply(HELP))
  bot.command('help', (ctx) => ctx.reply(HELP))

  bot.on('message:voice', (ctx) =>
    captureMedia(ctx, {
      kind: 'voice',
      uniqueId: ctx.message.voice.file_unique_id,
      caption: ctx.message.caption,
      token: config.token,
    })
  )

  bot.on('message:audio', (ctx) =>
    captureMedia(ctx, {
      kind: 'audio',
      uniqueId: ctx.message.audio.file_unique_id,
      originalName: ctx.message.audio.file_name,
      caption: ctx.message.caption,
      token: config.token,
    })
  )

  bot.on('message:video_note', (ctx) =>
    captureMedia(ctx, {
      kind: 'video_note',
      uniqueId: ctx.message.video_note.file_unique_id,
      caption: ctx.message.caption,
      token: config.token,
    })
  )

  // C10 — largest available size. Telegram sorts PhotoSize ascending.
  bot.on('message:photo', (ctx) => {
    const largest = ctx.message.photo[ctx.message.photo.length - 1]
    return captureMedia(ctx, {
      kind: 'photo',
      uniqueId: largest.file_unique_id,
      caption: ctx.message.caption,
      token: config.token,
    })
  })

  bot.on('message:document', (ctx) =>
    captureMedia(ctx, {
      kind: 'document',
      uniqueId: ctx.message.document.file_unique_id,
      originalName: ctx.message.document.file_name,
      caption: ctx.message.caption,
      token: config.token,
    })
  )

  bot.on('message:video', (ctx) =>
    captureMedia(ctx, {
      kind: 'video',
      uniqueId: ctx.message.video.file_unique_id,
      originalName: ctx.message.video.file_name,
      caption: ctx.message.caption,
      token: config.token,
    })
  )

  bot.on('message:animation', (ctx) =>
    captureMedia(ctx, {
      kind: 'animation',
      uniqueId: ctx.message.animation.file_unique_id,
      caption: ctx.message.caption,
      token: config.token,
    })
  )

  // Text, links, and forwards — all verbatim, no unfurling, no parsing.
  bot.on(['message:text', 'message:caption'], async (ctx) => {
    const text = ctx.message.text ?? ctx.message.caption ?? ''
    if (text.trim() === '') return
    const res = await capture(ctx, { text, kind: 'text' })
    if (res.ok) await ack(ctx)
  })

  // Anything else (location, contact, poll, sticker…). Recorded rather than dropped.
  bot.on('message', async (ctx) => {
    const kind = Object.keys(ctx.message).find((k) =>
      ['sticker', 'location', 'venue', 'contact', 'poll', 'dice', 'story'].includes(k)
    )
    if (!kind) return
    const res = await capture(ctx, { text: `[${kind}, unsupported by the bot]`, kind })
    if (res.ok) await ack(ctx, ` · ${kind}`)
  })

  // Nothing thrown in a handler may kill polling.
  bot.catch((err) => {
    const e = err.error
    if (e instanceof GrammyError) log.error('telegram api error:', redact(e.description))
    else if (e instanceof HttpError) log.error('network error talking to telegram:', e)
    else log.error('unhandled handler error:', e)
  })

  return bot
}

async function main() {
  const config = loadConfig()
  registerSecret(config.token)
  log.info('config:', JSON.stringify(describeConfig(config)))

  // Fail loudly, but do not exit: iCloud may simply not be mounted yet at login, and
  // a dead bot is worse than one that tells the user "not saved" for a few minutes.
  try {
    log.info(`vault: ${resolveVaultPath()}`)
  } catch (err) {
    log.error('VAULT NOT FOUND —', err)
    log.error('captures will be refused (with a reply) until it appears.')
  }

  const caps = await detectCapabilities()
  log.info(`capabilities · ${describeCapabilities(caps)}`)
  if (caps.notes.whisperFoundWithoutModel) {
    log.warn('whisper binary found but no .bin model — set DESVU_WHISPER_MODEL to enable transcription')
  }

  const bot = createBot(config)

  process.on('unhandledRejection', (reason) => log.error('unhandledRejection:', reason))
  process.on('uncaughtException', (err) => log.error('uncaughtException:', err))
  const stop = (signal) => {
    log.info(`${signal} — stopping`)
    bot.stop().finally(() => process.exit(0))
  }
  process.once('SIGINT', () => stop('SIGINT'))
  process.once('SIGTERM', () => stop('SIGTERM'))

  // Long polling. Telegram queues updates for 24h, so messages sent while the laptop
  // slept arrive on wake. drop_pending_updates stays false on purpose — that queue is
  // the whole point.
  await bot.start({
    allowed_updates: ['message'],
    onStart: (me) => log.info(`connected as @${me.username} (id ${me.id}) — long polling`),
  })
}

// Only run when executed directly; importing this module (tests) must not start polling.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    log.error('fatal:', err)
    process.exit(1)
  })
}
