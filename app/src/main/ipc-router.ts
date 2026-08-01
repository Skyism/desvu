import type { IpcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc'
import type { DeepPartial, IpcChannel } from '@shared/ipc'
import type {
  CreateTodoInput,
  DateString,
  LibraryStatus,
  Meal,
  Purchase,
  Settings,
  UpdateTodoInput,
  UpsertJournalInput,
  Workout,
} from '@shared/types'
import type { CreateLibraryInput } from './repos'
import {
  brainDumpRepository,
  calendarRepository,
  financeRepository,
  inboxRepository,
  journalRepository,
  libraryRepository,
  mealRepository,
  searchRepository,
  settingsRepository,
  systemRepository,
  todoRepository,
  workoutRepository,
} from './repos'

type Handler = (...args: never[]) => Promise<unknown>

/**
 * One handler per entry in `IPC_CHANNELS`, and no handler without a channel.
 *
 * Typing this as `Record<IpcChannel, Handler>` makes parity a **compile** error rather
 * than a runtime surprise: a channel added to the shared contract without a handler here
 * fails `tsc`, and a handler for a channel that is not in the allowlist fails it too.
 * `test/ipc-contract.test.ts` asserts the same thing at runtime, since the preload
 * allowlist is built from the array rather than from this object.
 */
export const ipcHandlers = {
  // --- todos -------------------------------------------------------------------------
  'todos:list': () => todoRepository.list(),
  'todos:forDate': (date: DateString) => todoRepository.forDate(date),
  'todos:create': (input: CreateTodoInput) => todoRepository.create(input),
  'todos:update': (id: string, updates: UpdateTodoInput) => todoRepository.update(id, updates),
  'todos:complete': (id: string, actualMinutes: number | null) =>
    todoRepository.complete(id, actualMinutes ?? null),
  'todos:reopen': (id: string) => todoRepository.reopen(id),
  'todos:remove': (id: string) => todoRepository.remove(id),
  'todos:dayLoad': (date: DateString) => todoRepository.dayLoad(date),
  'todos:correctionFactors': () => todoRepository.correctionFactors(),

  // --- journal -----------------------------------------------------------------------
  'journal:list': () => journalRepository.list(),
  'journal:byDate': (date: DateString) => journalRepository.byDate(date),
  'journal:upsert': (input: UpsertJournalInput) => journalRepository.upsert(input),
  'journal:remove': (id: string) => journalRepository.remove(id),
  'journal:streak': () => journalRepository.streak(),

  // --- finance -----------------------------------------------------------------------
  'finance:list': () => financeRepository.list(),
  'finance:create': (input: Omit<Purchase, 'id' | 'created_at'>) => financeRepository.create(input),
  'finance:update': (id: string, updates: Partial<Omit<Purchase, 'id' | 'created_at'>>) =>
    financeRepository.update(id, updates),
  'finance:remove': (id: string) => financeRepository.remove(id),
  'finance:monthSummary': (month: string) => financeRepository.monthSummary(month),

  // --- meals -------------------------------------------------------------------------
  'meals:list': () => mealRepository.list(),
  'meals:forDate': (date: DateString) => mealRepository.forDate(date),
  'meals:create': (input: Omit<Meal, 'id' | 'created_at'>) => mealRepository.create(input),
  'meals:update': (id: string, updates: Partial<Omit<Meal, 'id' | 'created_at'>>) =>
    mealRepository.update(id, updates),
  'meals:remove': (id: string) => mealRepository.remove(id),

  // --- workouts ----------------------------------------------------------------------
  'workouts:list': () => workoutRepository.list(),
  'workouts:forDate': (date: DateString) => workoutRepository.forDate(date),
  'workouts:create': (input: Omit<Workout, 'id' | 'created_at'>) => workoutRepository.create(input),
  'workouts:update': (id: string, updates: Partial<Omit<Workout, 'id' | 'created_at'>>) =>
    workoutRepository.update(id, updates),
  'workouts:remove': (id: string) => workoutRepository.remove(id),

  // --- library -----------------------------------------------------------------------
  'library:list': (options?: { includeArchived?: boolean }) => libraryRepository.list(options),
  'library:create': (input: CreateLibraryInput) => libraryRepository.create(input),
  'library:setStatus': (itemPath: string, status: LibraryStatus) =>
    libraryRepository.setStatus(itemPath, status),
  'library:setArchived': (itemPath: string, archived: boolean) =>
    libraryRepository.setArchived(itemPath, archived),
  'library:fitting': (freeMinutes: number) => libraryRepository.fitting(freeMinutes),
  'library:runAutoArchive': () => libraryRepository.runAutoArchive(),

  // --- brain dump --------------------------------------------------------------------
  'brainDump:listThreads': () => brainDumpRepository.listThreads(),
  'brainDump:readThread': (threadPath: string) => brainDumpRepository.readThread(threadPath),
  'brainDump:appendToThread': (threadPath: string, text: string) =>
    brainDumpRepository.appendToThread(threadPath, text),
  'brainDump:createThread': (topic: string, title: string, text: string) =>
    brainDumpRepository.createThread(topic, title, text),
  'brainDump:listTopics': () => brainDumpRepository.listTopics(),

  // --- inbox -------------------------------------------------------------------------
  'inbox:read': () => inboxRepository.read(),
  'inbox:count': () => inboxRepository.count(),

  // --- calendar ----------------------------------------------------------------------
  'calendar:forDate': (date: DateString) => calendarRepository.forDate(date),
  'calendar:lastRefresh': () => calendarRepository.lastRefresh(),

  // --- settings ----------------------------------------------------------------------
  'settings:get': () => settingsRepository.get(),
  'settings:update': (patch: DeepPartial<Settings>) => settingsRepository.update(patch),

  // --- search ------------------------------------------------------------------------
  'search:query': (query: string) => searchRepository.query(query),

  // --- system ------------------------------------------------------------------------
  'system:vaultPath': () => systemRepository.vaultPath(),
  'system:openInObsidian': (relativePath: string) => systemRepository.openInObsidian(relativePath),
  'system:quickCapture': (text: string) => systemRepository.quickCapture(text),
} satisfies Record<IpcChannel, Handler>

/**
 * Repository errors are ordinary `Error`s carrying a message written for a human. Electron
 * decorates anything thrown inside `handle` before it reaches the renderer, so the message
 * is re-thrown clean — someone who typed a rating of 9 should read "rating must be from
 * 1 to 7", not a stack trace with an IPC frame in it.
 */
async function invoke(channel: IpcChannel, args: unknown[]): Promise<unknown> {
  const handler = ipcHandlers[channel] as (...values: unknown[]) => Promise<unknown>
  try {
    return await handler(...args)
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error))
  }
}

export function registerIpcHandlers(ipcMain: IpcMain): void {
  for (const channel of IPC_CHANNELS) {
    ipcMain.handle(channel, (_event, ...args: unknown[]) => invoke(channel, args))
  }
}

/** Remove every handler — main-process teardown and hot reload. */
export function unregisterIpcHandlers(ipcMain: IpcMain): void {
  for (const channel of IPC_CHANNELS) {
    ipcMain.removeHandler(channel)
  }
}

/** Call a channel directly, bypassing Electron. Tests and the debug console. */
export async function callChannel(channel: IpcChannel, ...args: unknown[]): Promise<unknown> {
  return invoke(channel, args)
}
