import { defineConfig } from 'vite';
import { octane } from 'octane/compiler/vite';

// Identical to ../octane-tsrx/vite.config.js except the dev port, so the naive
// twin's build output differs from the tuned fixture ONLY by authoring shape.
export default defineConfig({
	plugins: [octane()],
	optimizeDeps: {
		exclude: ['octane', 'octane/compiler'],
	},
	build: {
		target: 'esnext',
		minify: 'esbuild',
	},
	server: { port: 5213, strictPort: true },
});
