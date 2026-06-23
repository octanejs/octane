import { defineConfig } from 'vite';
import { octane } from 'octane-ts/compiler/vite';

export default defineConfig({
	plugins: [octane()],

	server: {
		port: 5173,
		host: true,
		strictPort: false,
	},

	build: {
		// Keep template-clone output legible.
		minify: false,
		target: 'esnext',
	},

	optimizeDeps: {
		// `octane` is workspace:* and points `main` at raw TS sources, and also
		// provides the compiler at `octane-ts/compiler`. Pre-bundling would snapshot
		// stale output and require `vite --force` on every workspace edit.
		exclude: ['octane-ts'],
	},
});
