import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { reactCompiler } from '../../../../react-compiler.mjs';

// Production builds only: benchmarks/bundle-size/run.mjs builds this app with its
// normalized settings.
export default defineConfig({
	plugins: [react(), reactCompiler()],
	build: { target: 'esnext' },
});
