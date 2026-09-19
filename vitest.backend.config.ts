import { defineConfig } from 'vitest/config'

// Deliberately independent of the Vue/Vite configuration and production env files.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['worker/tests/**/*.test.ts'],
    setupFiles: ['worker/tests/setup.ts'],
    restoreMocks: true,
    unstubGlobals: true,
    testTimeout: 15_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
})
