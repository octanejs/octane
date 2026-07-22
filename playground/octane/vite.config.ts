import { defineConfig } from 'vite';
import { octane } from 'octane/compiler/vite';

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
		// provides the compiler at `octane/compiler`. Pre-bundling would snapshot
		// stale output and require `vite --force` on every workspace edit.
		//
		// The bindings are the same shape: they ship `.tsrx`/`.ts` sources that the
		// octane plugin has to compile, so they must not be pre-bundled either.
		exclude: ['octane', '@octanejs/cmdk', '@octanejs/radix'],
	},
});
