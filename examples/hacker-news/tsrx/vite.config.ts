import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { octane } from 'octane/compiler/vite';
import { stylex } from '@octanejs/stylex/vite';

export default defineConfig({
	// index.html lives here; ../shared is imported across the dir boundary.
	root: fileURLToPath(new URL('.', import.meta.url)),
	// JSX and TSRX servers run concurrently in the E2E fixture. Give each client
	// graph its own optimizer cache so one Vite process cannot replace another
	// process's cold-start metadata.
	cacheDir: fileURLToPath(new URL('../node_modules/.vite-tsrx-client', import.meta.url)),

	plugins: [
		// The compiler discovers raw bindings from the parent package manifest,
		// routes their bare `octane` imports to the SSR runtime, and full-compiles
		// the app's `.tsx`/`.tsrx`. The binding packages'
		// hand-written slot-forwarding `.ts` sources declare
		// `"octane": { "hookSlots": { "manual": ["src"] } }` in their package.json, so the
		// plugin skips re-slotting them automatically. The shared app `.ts` files
		// (hooks/routes) carry no declaration, so their octane hook call-sites
		// still get slotted.
		octane(),
		stylex(),
	],

	build: {
		target: 'esnext',
	},
});
