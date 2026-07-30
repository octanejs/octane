import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { octane } from 'octane/compiler/vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
	plugins: [octane(), tailwindcss()],

	resolve: {
		// The shadcn CLI installs registry components importing via the `@/`
		// alias (components.json `aliases`); mirror it for Vite.
		alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
	},

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
		// octane plugin has to compile, so they must not be pre-bundled either. That
		// covers both the cmdk demo and the registry-installed shadcn components,
		// which build on the raw-source radix and lucide bindings.
		exclude: [
			'octane',
			'@octanejs/cmdk',
			'@octanejs/radix',
			'@octanejs/lucide',
			'@octanejs/rainbowkit',
			'@octanejs/tanstack-query',
			'@octanejs/wagmi',
		],
	},
});
