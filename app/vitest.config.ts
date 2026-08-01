import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(import.meta.dirname, 'src/shared'),
      '@': resolve(import.meta.dirname, 'src/renderer/src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Each file points DESVU_VAULT at its own temp directory and the vault path is
    // memoized per module instance, so files must not share a process.
    pool: 'forks',
    poolOptions: { forks: { singleFork: false } },
  },
})
