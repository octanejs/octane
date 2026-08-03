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
		//
		// `@octanejs/shadcn` and `@octanejs/base-ui` belong here for a second reason:
		// the shadcn package is consumed through PER-FAMILY SUBPATHS, and pre-bundling
		// snapshots its `exports` map when the dev server boots. Every newly added
		// family then fails to resolve — "is not exported under the conditions ..." —
		// until the server is restarted, even though the export is right there in
		// package.json.
		exclude: [
			'octane',
			'@octanejs/base-ui',
			'@octanejs/cmdk',
			'@octanejs/shadcn',
			'@octanejs/radix',
			'@octanejs/lucide',
			'@octanejs/rainbowkit',
			'@octanejs/tanstack-query',
			'@octanejs/wagmi',
		],
	},
});
