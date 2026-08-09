import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { octane } from 'octane/compiler/vite';
import { threeRenderers } from '@octanejs/three/config';
import tailwindcss from '@tailwindcss/vite';
import { freshWorkspaceExports } from './vite-plugins/fresh-workspace-exports';

// `@octanejs/shadcn` is consumed through per-family subpaths, and vite caches a package's exports
// map for the life of the dev server — so each newly added family would otherwise 404 until a
// restart. This resolves those subpaths against the same map, re-read from disk each time.
const SHADCN_DIR = fileURLToPath(new URL('../../packages/shadcn', import.meta.url));

export default defineConfig({
	plugins: [
		freshWorkspaceExports([{ name: '@octanejs/shadcn', dir: SHADCN_DIR }]),
		octane({ renderers: threeRenderers }),
		tailwindcss(),
	],

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
		// `@octanejs/shadcn` and `@octanejs/base-ui` belong here for the same
		// raw-source reason as the rest.
		//
		// EXCLUDING THEM DOES NOT MAKE NEW SUBPATHS HOT-RESOLVE — vite caches a
		// package's resolved `exports` map for the life of the dev server,
		// independently of pre-bundling, so a newly added family used to fail with
		// "is not exported under the conditions ..." until a RESTART. That is what the
		// `fresh-workspace-exports` plugin above now handles, by resolving those
		// subpaths against the same map re-read from disk. No restart needed.
		exclude: [
			'octane',
			'@octanejs/animejs',
			'@octanejs/base-ui',
			'@octanejs/cmdk',
			'@octanejs/shadcn',
			'@octanejs/radix',
			'@octanejs/lucide',
			'@octanejs/livestore',
			'@octanejs/rainbowkit',
			'@octanejs/tanstack-query',
			'@octanejs/wagmi',
		],
	},
});
