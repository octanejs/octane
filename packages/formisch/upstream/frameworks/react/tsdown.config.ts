import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['./src/index.ts'],
  outDir: 'dist',
  outExtensions: () => ({
    js: '.js',
    dts: '.d.ts',
  }),
  dts: {
    resolve: ['@formisch/core/vanilla', '@formisch/methods/vanilla'],
  },
});
