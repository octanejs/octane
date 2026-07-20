import { defineConfig } from 'vite';
import { octane } from 'octane/compiler/vite';
import { octaneDevtools } from '@octanejs/devtools/vite';

export default defineConfig({
	// The compiler flag emits the runtime devtools bridge; the standalone
	// plugin injects the panel and serves the snapshot endpoint. Both are
	// serve-mode only — builds are unchanged.
	plugins: [octane({ devtools: true }), octaneDevtools()],

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
		// provides the compiler at `octane/compiler`. Pre-bundling would snapshot
		// stale output and require `vite --force` on every workspace edit.
		exclude: ['octane'],
	},
});
