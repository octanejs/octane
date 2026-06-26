import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { octane } from 'octane/compiler/vite';
import { stylex } from '@octanejs/stylex/vite';

// SSR alias: on the server, bare `import … from 'octane'` must resolve to the
// SERVER runtime (`octane/server`), never the client runtime (which touches
// `document`). The octane compiler already rewrites this for the app's own
// `.tsx`/`.tsrx` it transforms, but the `@octanejs/*` binding packages' raw `.ts`
// sources (excluded from the compiler below) import bare `'octane'` — so we
// redirect those for the SSR module graph here. Client builds are untouched.
function octaneServerAlias(): Plugin {
	return {
		name: 'octane-ssr-server-alias',
		enforce: 'pre',
		async resolveId(source, importer, options) {
			if (!options?.ssr) return null;
			if (source !== 'octane') return null;
			// Avoid recursing on the already-redirected id.
			const resolved = await this.resolve('octane/server', importer, { skipSelf: true });
			return resolved?.id ?? null;
		},
	};
}

export default defineConfig({
	// index.html lives here; ../shared is imported across the dir boundary.
	root: fileURLToPath(new URL('.', import.meta.url)),

	plugins: [
		octaneServerAlias(),
		// Full-compile the app's `.tsx`/`.tsrx`, but DON'T re-slot the binding
		// packages' hand-written slot-forwarding `.ts` sources (they already forward
		// hook slots themselves). The shared app `.ts` files (hooks/routes) are NOT
		// excluded, so their octane hook call-sites still get slotted.
		octane({
			exclude: ['/packages/router/src/', '/packages/stylex/src/', '/packages/query/src/'],
		}),
		stylex(),
	],

	// `octane` (+ the @octanejs/* bindings) ship raw TS, so Vite must TRANSFORM
	// them for the SSR module graph instead of externalizing (a Node require of
	// raw `.ts`/`.tsrx` would fail, and the server runtime needs compiling).
	ssr: {
		noExternal: [/^octane($|\/)/, /^@octanejs\//],
	},

	optimizeDeps: {
		// All workspace:* pointing at raw TS sources — pre-bundling would snapshot
		// stale output and demand `vite --force` on every workspace edit.
		exclude: ['octane', '@octanejs/router', '@octanejs/stylex', '@octanejs/query'],
	},

	build: {
		target: 'esnext',
	},
});
