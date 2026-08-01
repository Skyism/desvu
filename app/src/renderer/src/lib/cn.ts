export type ClassValue = string | number | false | null | undefined | ClassValue[]

/**
 * Join class names. Deliberately not `clsx` — this is the whole of what we need and
 * `app/package.json` is owned by the orchestrator.
 */
export function cn(...values: ClassValue[]): string {
  const out: string[] = []
  for (const value of values) {
    if (!value) continue
    if (Array.isArray(value)) {
      const nested = cn(...value)
      if (nested) out.push(nested)
    } else {
      out.push(String(value))
    }
  }
  return out.join(' ')
}
