import { v4 as uuidv4 } from 'uuid'

/** Every record's id. Kept behind a function so the generator is swappable in one place. */
export function newId(): string {
  return uuidv4()
}
