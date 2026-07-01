import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    exclude: ['node_modules/**', '.next/**'],
    setupFiles: ['tests/integration/setup.ts'],
    // Integration tests share a real Postgres connection/schema — running
    // them concurrently risks cross-test interference.
    fileParallelism: false,
  },
})
