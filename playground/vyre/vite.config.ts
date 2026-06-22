import { defineConfig } from 'vite';
import { vyre } from 'vyre/compiler/vite';

export default defineConfig({
	plugins: [vyre()],

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
		// `vyre` is workspace:* and points `main` at raw TS sources, and also
		// provides the compiler at `vyre/compiler`. Pre-bundling would snapshot
		// stale output and require `vite --force` on every workspace edit.
		exclude: ['vyre'],
	},
});
