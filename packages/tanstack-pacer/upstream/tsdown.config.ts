import { defineConfig } from 'tsdown'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  entry: [
    './src/index.ts',
    './src/async-batcher/index.ts',
    './src/async-debouncer/index.ts',
    './src/async-queuer/index.ts',
    './src/async-rate-limiter/index.ts',
    './src/async-retryer/index.ts',
    './src/async-throttler/index.ts',
    './src/batcher/index.ts',
    './src/debouncer/index.ts',
    './src/provider/index.ts',
    './src/queuer/index.ts',
    './src/rate-limiter/index.ts',
    './src/throttler/index.ts',
    './src/types/index.ts',
    './src/utils/index.ts',
  ],
  format: ['esm', 'cjs'],
  unbundle: true,
  dts: true,
  sourcemap: true,
  clean: true,
  minify: false,
  fixedExtension: false,
  exports: true,
  publint: {
    strict: true,
  },
})
