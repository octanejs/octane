import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { octane } from 'octane/compiler/vite';
import { stylex } from '@octanejs/stylex/vite';

export default defineConfig({
	// index.html lives here; ../shared is imported across the dir boundary.
	root: fileURLToPath(new URL('.', import.meta.url)),

	plugins: [
		// Full-compile the app's `.tsx`/`.tsrx`, but DON'T re-slot the binding
		// packages' hand-written slot-forwarding `.ts` sources (they already forward
		// hook slots themselves). The shared app `.ts` files (hooks/routes) are NOT
		// excluded, so their octane hook call-sites still get slotted.
		octane({
			exclude: ['/packages/router/src/', '/packages/stylex/src/', '/packages/query/src/'],
		}),
		stylex(),
	],

	optimizeDeps: {
		// All workspace:* pointing at raw TS sources — pre-bundling would snapshot
		// stale output and demand `vite --force` on every workspace edit.
		exclude: ['octane', '@octanejs/router', '@octanejs/stylex', '@octanejs/query'],
	},

	build: {
		target: 'esnext',
	},
});
