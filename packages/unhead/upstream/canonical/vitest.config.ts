import { resolve } from 'node:path'
/// <reference types="vitest" />
/// <reference types="vitest/globals" />
import { defineConfig } from 'vitest/config'

export default defineConfig({
  oxc: {
    jsx: {
      runtime: 'automatic',
    },
  },
  resolve: {
    alias: {
      '@unhead/bundler/framework': resolve(__dirname, '../bundler/src/unplugin/framework.ts'),
      '@unhead/bundler': resolve(__dirname, '../bundler/src'),
      'unhead/stream/server': resolve(__dirname, '../unhead/src/stream/server.ts'),
      'unhead/stream/client': resolve(__dirname, '../unhead/src/stream/client.ts'),
      'unhead/stream/unplugin': resolve(__dirname, '../unhead/src/stream/unplugin.ts'),
      'unhead/server': resolve(__dirname, '../unhead/src/server/index.ts'),
      'unhead/client': resolve(__dirname, '../unhead/src/client/index.ts'),
      'unhead/minify': resolve(__dirname, '../unhead/src/minify/index.ts'),
      'unhead/types': resolve(__dirname, '../unhead/src/types/index.ts'),
      'unhead/plugins': resolve(__dirname, '../unhead/src/plugins/index.ts'),
      'unhead/utils': resolve(__dirname, '../unhead/src/utils/index.ts'),
      'unhead/scripts': resolve(__dirname, '../unhead/src/scripts/index.ts'),
      'unhead/parser': resolve(__dirname, '../unhead/src/parser/index.ts'),
      'unhead/legacy': resolve(__dirname, '../unhead/src/legacy.ts'),
      'unhead': resolve(__dirname, '../unhead/src/index.ts'),
    },
  },
  test: {
    globals: true,
  },
})
