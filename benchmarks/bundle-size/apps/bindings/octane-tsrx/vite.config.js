import { defineConfig } from 'vite';
import { octane } from 'octane/compiler/vite';

// Production builds only: benchmarks/bundle-size/run.mjs builds this app with its
// normalized minify settings. The binding packages ship source, so this config's
// Octane plugin compiles them exactly as a consuming application would.
export default defineConfig({
	plugins: [octane()],
	build: {
		target: 'esnext',
		minify: 'esbuild',
	},
});
