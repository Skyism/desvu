/**
 * Local-only transcription (C9) and OCR (C10).
 *
 * Rule: no cloud API, ever. If nothing suitable is installed on this machine the
 * capture is still written — it just carries an honest `[voice, untranscribed]` or
 * `[photo, no-ocr]` marker so the Inbox never lies about what it knows. The attachment
 * is kept alongside the line either way, so a transcriber installed later can backfill.
 */
import { execFile } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { log } from './log.js'

export const VOICE_MARKER = '[voice, untranscribed]'
export const PHOTO_MARKER = '[photo, no-ocr]'

const run = (file, args, { timeout = 30_000, cwd } = {}) =>
  new Promise((resolve) => {
    execFile(file, args, { timeout, cwd, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout: stdout ?? '', stderr: stderr ?? '', err })
    })
  })

async function which(cmd) {
  const { ok, stdout } = await run('/usr/bin/which', [cmd], { timeout: 5_000 })
  return ok ? stdout.trim().split('\n')[0] : null
}

/** whisper.cpp needs an explicit GGML model file; look where Homebrew and users put them. */
function findWhisperModel() {
  const explicit = process.env.DESVU_WHISPER_MODEL
  if (explicit && existsSync(explicit)) return explicit
  const dirs = [
    path.join(homedir(), '.cache', 'whisper.cpp'),
    path.join(homedir(), '.local', 'share', 'whisper.cpp'),
    path.join(homedir(), 'Library', 'Application Support', 'whisper.cpp'),
    '/opt/homebrew/share/whisper-cpp',
    '/opt/homebrew/share/whisper.cpp',
    '/usr/local/share/whisper-cpp',
  ]
  for (const dir of dirs) {
    try {
      if (!existsSync(dir)) continue
      const models = readdirSync(dir)
        .filter((f) => f.endsWith('.bin'))
        .sort()
      if (models.length > 0) return path.join(dir, models[0])
    } catch {
      /* unreadable directory is simply not a source of models */
    }
  }
  return null
}

let capabilities = null

/**
 * Probe the machine once for local transcription and OCR tools.
 * Cached — the answer does not change while the process runs.
 */
export async function detectCapabilities({ force = false } = {}) {
  if (capabilities && !force) return capabilities

  const [whisperCli, whisperCpp, whisperPy, mlxWhisper, ffmpeg, tesseract] = await Promise.all([
    which('whisper-cli'),
    which('whisper-cpp'),
    which('whisper'),
    which('mlx_whisper'),
    which('ffmpeg'),
    which('tesseract'),
  ])

  let transcriber = null
  const model = findWhisperModel()
  if (whisperCli && model) transcriber = { kind: 'whisper.cpp', bin: whisperCli, model, ffmpeg }
  else if (whisperCpp && model) transcriber = { kind: 'whisper.cpp', bin: whisperCpp, model, ffmpeg }
  else if (mlxWhisper) transcriber = { kind: 'mlx-whisper', bin: mlxWhisper }
  else if (whisperPy) transcriber = { kind: 'openai-whisper', bin: whisperPy }

  const missingModel = Boolean((whisperCli || whisperCpp) && !model)

  capabilities = {
    transcriber,
    ocr: tesseract ? { kind: 'tesseract', bin: tesseract } : null,
    ffmpeg,
    notes: {
      whisperFoundWithoutModel: missingModel,
    },
  }
  return capabilities
}

/** One-line summary for the startup banner. */
export function describeCapabilities(caps) {
  const t = caps.transcriber ? `${caps.transcriber.kind}` : `none → captures marked ${VOICE_MARKER}`
  const o = caps.ocr ? `${caps.ocr.kind}` : `none → captures marked ${PHOTO_MARKER}`
  return `transcription: ${t} · ocr: ${o}`
}

/**
 * Transcribe an audio file with whatever local tool exists.
 * @returns {Promise<{text: string, tool: string}|null>} null when nothing is available or it failed
 */
export async function transcribe(audioPath, { timeout = 180_000 } = {}) {
  const caps = await detectCapabilities()
  const t = caps.transcriber
  if (!t) return null

  try {
    if (t.kind === 'whisper.cpp') {
      return await transcribeWhisperCpp(audioPath, t, timeout)
    }
    if (t.kind === 'openai-whisper' || t.kind === 'mlx-whisper') {
      const workdir = await mkdtemp(path.join(tmpdir(), 'desvu-stt-'))
      try {
        const { ok, stderr } = await run(
          t.bin,
          [audioPath, '--model', 'base', '--output_format', 'txt', '--output_dir', workdir],
          { timeout }
        )
        if (!ok) {
          log.warn('transcription failed:', stderr.slice(0, 400))
          return null
        }
        const produced = readdirSync(workdir).find((f) => f.endsWith('.txt'))
        if (!produced) return null
        const text = (await readFile(path.join(workdir, produced), 'utf8')).trim()
        return text ? { text, tool: t.kind } : null
      } finally {
        await rm(workdir, { recursive: true, force: true })
      }
    }
  } catch (err) {
    log.warn('transcription threw:', err)
  }
  return null
}

async function transcribeWhisperCpp(audioPath, t, timeout) {
  const workdir = await mkdtemp(path.join(tmpdir(), 'desvu-stt-'))
  try {
    // whisper.cpp wants 16 kHz mono PCM; Telegram voice notes arrive as Opus in OGG.
    let input = audioPath
    if (t.ffmpeg) {
      const wav = path.join(workdir, 'audio.wav')
      const conv = await run(
        t.ffmpeg,
        ['-nostdin', '-loglevel', 'error', '-i', audioPath, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav],
        { timeout: 60_000 }
      )
      if (conv.ok && existsSync(wav)) input = wav
    }
    const outBase = path.join(workdir, 'out')
    const { ok, stderr } = await run(
      t.bin,
      ['-m', t.model, '-f', input, '-otxt', '-of', outBase, '-nt'],
      { timeout }
    )
    if (!ok) {
      log.warn('whisper.cpp failed:', stderr.slice(0, 400))
      return null
    }
    const txt = `${outBase}.txt`
    if (!existsSync(txt)) return null
    const text = (await readFile(txt, 'utf8')).trim()
    return text ? { text, tool: 'whisper.cpp' } : null
  } finally {
    await rm(workdir, { recursive: true, force: true })
  }
}

/**
 * OCR an image with a locally installed engine.
 * @returns {Promise<{text: string, tool: string}|null>}
 */
export async function ocr(imagePath, { timeout = 45_000 } = {}) {
  const caps = await detectCapabilities()
  if (!caps.ocr) return null
  try {
    const { ok, stdout, stderr } = await run(caps.ocr.bin, [imagePath, 'stdout', '-l', 'eng'], {
      timeout,
    })
    if (!ok) {
      log.warn('ocr failed:', stderr.slice(0, 400))
      return null
    }
    const text = stdout.trim()
    return text ? { text, tool: caps.ocr.kind } : null
  } catch (err) {
    log.warn('ocr threw:', err)
    return null
  }
}

/** Reset the probe cache. Tests only. */
export function clearCapabilityCache() {
  capabilities = null
}
