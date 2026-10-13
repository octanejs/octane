import { defineConfig } from 'vite';
import { octane } from 'octane/compiler/vite';

// Production builds only: benchmarks/bundle-size/run.mjs builds this app with its
// normalized settings.
export default defineConfig({
	plugins: [octane()],
	build: { target: 'esnext' },
});
