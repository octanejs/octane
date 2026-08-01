import { octane } from 'octane/compiler/vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [octane()],
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['test/**/*.test.tsrx']
  }
})
