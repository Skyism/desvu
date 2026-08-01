/**
 * Error shapes the repositories throw. Messages cross the IPC boundary as strings, so
 * every one of them has to read as a complete sentence on its own.
 */

/** One or more rejected inputs. Never thrown after a write has begun. */
export class ValidationError extends Error {
  readonly issues: string[]

  constructor(issues: string[] | string) {
    const list = Array.isArray(issues) ? issues : [issues]
    super(list.join('; '))
    this.name = 'ValidationError'
    this.issues = list
  }
}

/** A record was addressed by an id or path that is not in the vault. */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NotFoundError'
  }
}

/**
 * A file on disk is not the shape it claims to be. Thrown instead of overwriting, because
 * the alternative is silently replacing the user's corpus with an empty collection.
 */
export class CorruptFileError extends Error {
  readonly filePath: string

  constructor(filePath: string, detail: string) {
    super(
      `Refusing to read or write ${filePath}: ${detail}. ` +
        `Fix or move the file by hand — nothing was written.`
    )
    this.name = 'CorruptFileError'
    this.filePath = filePath
  }
}

export function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && typeof (error as NodeJS.ErrnoException).code === 'string'
}
