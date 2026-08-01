import path from 'node:path'
import { resolveVaultPath } from '@shared/vault'
import { ValidationError } from '../lib/errors'
import { inboxRepository } from './inboxRepository'

/**
 * Build an `obsidian://open` URL for a vault-relative path.
 *
 * Both parameters are percent-encoded: the vault name carries an accent ("Dès vu") and
 * paths contain spaces ("Brain Dump/..."), either of which breaks the handler raw. The
 * `.md` extension is dropped because Obsidian resolves notes by name, and keeping it
 * makes the link miss for files it has indexed without one.
 */
export function obsidianUrl(vaultName: string, relativePath: string): string {
  const file = relativePath.replace(/^\/+/, '').replace(/\.md$/i, '')
  const vault = encodeURIComponent(vaultName.normalize('NFC'))
  return `obsidian://open?vault=${vault}&file=${encodeURIComponent(file)}`
}

type ExternalOpener = (url: string) => Promise<void>

/**
 * Electron is only importable inside the Electron runtime, and these repositories are
 * unit-tested under plain Node. The import is therefore deferred to call time and
 * swappable, so the URL construction can be tested without booting a browser process.
 */
let openExternal: ExternalOpener = async (url) => {
  const { shell } = await import('electron')
  await shell.openExternal(url)
}

/** Tests only. */
export function setExternalOpener(opener: ExternalOpener): void {
  openExternal = opener
}

export const systemRepository = {
  async vaultPath(): Promise<string> {
    return resolveVaultPath()
  },

  async openInObsidian(relativePath: string): Promise<void> {
    if (typeof relativePath !== 'string' || relativePath.trim() === '') {
      throw new ValidationError('a vault-relative path is required')
    }
    if (path.isAbsolute(relativePath)) {
      throw new ValidationError(`path must be vault-relative, not absolute ("${relativePath}")`)
    }
    if (relativePath.split('/').includes('..')) {
      throw new ValidationError(`path "${relativePath}" escapes the vault and was refused`)
    }

    const vaultName = path.basename(resolveVaultPath())
    await openExternal(obsidianUrl(vaultName, relativePath))
  },

  /** Desktop quick capture. Identical bytes to what the bot writes (PRD C8). */
  async quickCapture(text: string): Promise<void> {
    await inboxRepository.append(text, 'app')
  },
}

export type SystemRepository = typeof systemRepository
