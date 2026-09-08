import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // Use the react build of @formisch/core for testing
      '@formisch/core': path.resolve(__dirname, '../core/dist/index.react.js'),
    },
  },
  test: {
    environment: 'jsdom',
    coverage: {
      include: ['src'],
      exclude: [
        'src/types',
        'src/vitest',
        '**/index.ts',
        '**/types.ts',
        '**/*.test.ts',
        '**/*.test-d.ts',
      ],
    },
  },
});
