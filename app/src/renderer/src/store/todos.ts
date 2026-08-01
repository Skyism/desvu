import type {
  CorrectionFactor,
  CreateTodoInput,
  DateString,
  DayLoad,
  Todo,
  UpdateTodoInput,
} from '@shared/types'

import { bridge } from '@/lib/bridge'
import { useVaultQuery, type VaultQuery } from './useVaultQuery'
import { invalidateVault } from './vault'

/**
 * Todo reads and writes, following the shape of `store/inbox.ts` exactly: a read is a
 * hook around `useVaultQuery`, a write is a plain async function that calls `bridge()`
 * and then `invalidateVault()`.
 *
 * Nothing here caches. Four processes write to this vault — the app, the Telegram bot,
 * `/sort-inbox` and Obsidian — so a mirrored copy of a todo in a store would be wrong the
 * moment anyone else touched `data/todos.json`. The vault is the cache; `vaultChanged`
 * is the invalidation.
 */

// ---------------------------------------------------------------------------
// reads
// ---------------------------------------------------------------------------

/**
 * Open and doing todos due on or before `date` — today's problem, overdue included.
 *
 * `bucket` exists because free time shrinks as the day passes: passing a coarse clock
 * bucket re-runs the query every few minutes so a rail drawn at 9am is not still claiming
 * 9am's free time at noon. It is deliberately coarse; a per-second dependency would
 * re-read the vault sixty times a minute for a number that moves in five-minute steps.
 *
 * Note this call materializes recurrence instances in the main process, which is why the
 * ids it returns are real and completing one works.
 */
export function useTodosForDate(date: DateString, bucket = 0): VaultQuery<Todo[]> {
  return useVaultQuery(() => bridge().todos.forDate(date), [date, bucket])
}

/** Every todo the user can act on, all statuses. Templates excluded by the repository. */
export function useTodos(): VaultQuery<Todo[]> {
  return useVaultQuery(() => bridge().todos.list(), [])
}

/**
 * The recurrence templates. This is the only route to a template id, and therefore the
 * only way a recurring task can be edited or switched off (PRD T10). Instances never
 * appear here, and templates never appear in `useTodos`/`useTodosForDate`.
 */
export function useTodoTemplates(): VaultQuery<Todo[]> {
  return useVaultQuery(() => bridge().todos.listTemplates(), [])
}

/** PRD T5 — committed vs free, and the todos that do not fit (`overflow`). */
export function useDayLoad(date: DateString, bucket = 0): VaultQuery<DayLoad> {
  return useVaultQuery(() => bridge().todos.dayLoad(date), [date, bucket])
}

/**
 * PRD T11. One row per category, always — `confident` is the flag that says whether the
 * multiplier means anything yet. **Never render a factor whose `confident` is false.**
 */
export function useCorrectionFactors(): VaultQuery<CorrectionFactor[]> {
  return useVaultQuery(() => bridge().todos.correctionFactors(), [])
}

/**
 * The create-form defaults (PRD T3 default priority, T4 default estimate).
 *
 * Deliberately re-exported from `store/settings.ts` rather than re-implemented: two hooks
 * reading `settings.json` would be two places to change when the shape moves.
 */
export { useSettings } from './settings'

// ---------------------------------------------------------------------------
// writes
// ---------------------------------------------------------------------------

export async function createTodo(input: CreateTodoInput): Promise<Todo> {
  const todo = await bridge().todos.create(input)
  invalidateVault()
  return todo
}

export async function updateTodo(id: string, updates: UpdateTodoInput): Promise<Todo> {
  const todo = await bridge().todos.update(id, updates)
  invalidateVault()
  return todo
}

/**
 * Complete now, ask about the actual later.
 *
 * PRD T11 wants `actual_minutes` captured in one tap, and the way to lose that habit is
 * to put a modal between the user and the tick. So completion always writes immediately
 * with `null`, and the number — if it is offered at all — is banked afterwards by
 * `recordActualMinutes`. A skipped capture costs one completion of calibration data; a
 * blocked completion costs the whole feature.
 */
export async function completeTodo(id: string): Promise<Todo> {
  const todo = await bridge().todos.complete(id, null)
  invalidateVault()
  return todo
}

/** Bank the actual against an already-completed todo. Feeds the T11 correction factors. */
export async function recordActualMinutes(id: string, minutes: number): Promise<Todo> {
  const todo = await bridge().todos.update(id, { actual_minutes: Math.max(0, Math.round(minutes)) })
  invalidateVault()
  return todo
}

export async function reopenTodo(id: string): Promise<Todo> {
  const todo = await bridge().todos.reopen(id)
  invalidateVault()
  return todo
}

/** Status `dropped` — off the list, still in the corpus, still findable (PRD S3). */
export async function dropTodo(id: string): Promise<Todo> {
  return updateTodo(id, { status: 'dropped' })
}

/**
 * Deleting a template **detaches** its instances rather than deleting them — the tasks it
 * already created survive as ordinary one-offs. The UI must say so; a user expecting a
 * cascade will otherwise be surprised. See `todoRepository.remove`.
 */
export async function removeTodo(id: string): Promise<void> {
  await bridge().todos.remove(id)
  invalidateVault()
}
