import { defineConfig } from 'vitest/config'

// Engine tests are pure TypeScript (no JSX), so we don't load the React plugin
// here — that keeps this config independent of the app's Vite version.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
