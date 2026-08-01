/**
 * Logging with a token redactor wired in front of it.
 *
 * The bot token appears inside every file-download URL Telegram hands us, so a
 * careless `console.log(url)` would leak the credential into ~/Library/Logs.
 * Every log call goes through `redact()`, and secrets registered here are scrubbed
 * from strings, Errors, and anything else that gets stringified.
 */
const secrets = new Set()

/** Register a value that must never reach a log line. */
export function registerSecret(value) {
  if (typeof value === 'string' && value.length >= 8) secrets.add(value)
}

/** Replace every registered secret inside `input` with a marker. */
export function redact(input) {
  let text =
    typeof input === 'string'
      ? input
      : input instanceof Error
        ? `${input.name}: ${input.message}`
        : safeStringify(input)
  for (const secret of secrets) {
    if (text.includes(secret)) text = text.split(secret).join('<redacted-token>')
  }
  // Belt and braces: scrub anything shaped like a bot token even if unregistered.
  return text.replace(/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g, '<redacted-token>')
}

function safeStringify(value) {
  try {
    return typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value)
  } catch {
    return String(value)
  }
}

function emit(stream, level, parts) {
  const line = parts.map((p) => redact(p)).join(' ')
  stream.write(`${new Date().toISOString()} ${level} ${line}\n`)
}

export const log = {
  info: (...parts) => emit(process.stdout, 'INFO ', parts),
  warn: (...parts) => emit(process.stderr, 'WARN ', parts),
  error: (...parts) => emit(process.stderr, 'ERROR', parts),
}
