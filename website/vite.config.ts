import { defineConfig, type Plugin } from 'vite';
import { octane } from '@octanejs/vite-plugin';
import { octaneMdx } from '@octanejs/mdx/vite';
import { websiteMdxOptions } from './mdx-options.ts';

// SSR alias: on the server, bare `import … from 'octane'` must resolve to the
// SERVER runtime (`octane/server`), never the client runtime (which touches
// `document`). The octane compiler already rewrites this for the `.tsrx`/`.tsx`
// it transforms, but the @octanejs/* binding packages' raw `.ts` sources
// (excluded from the compiler below) import bare `'octane'` — redirect those
// for the SSR module graph. Client builds are untouched. (Same plugin as
// examples/hacker-news — with @octanejs/vite-plugin this is still needed.)
function octaneServerAlias(): Plugin {
	return {
		name: 'octane-ssr-server-alias',
		enforce: 'pre',
		async resolveId(source, importer, options) {
			if (!options?.ssr) return null;
			if (source !== 'octane') return null;
			const resolved = await this.resolve('octane/server', importer, { skipSelf: true });
			return resolved?.id ?? null;
		},
	};
}

export default defineConfig({
	plugins: [
		octaneServerAlias(),
		// octaneMdx() owns `.mdx` (full pipeline: @mdx-js/mdx → octane compile,
		// with Shiki highlighting via rehype); octane() owns `.tsrx`/`.ts` and the
		// metaframework (dev SSR + routing + hydrate). `exclude` skips the
		// hook-slotting pass for the workspace bindings' hand-slot-forwarding
		// sources — pnpm symlinks resolve them to /packages/*/src, not
		// node_modules (mirrors the root vitest config).
		octaneMdx(websiteMdxOptions),
		octane({
			exclude: ['/packages/router/src/', '/packages/mdx/src/'],
		}),
	],

	// The workspace bindings ship raw TS — Vite must transform them for the SSR
	// module graph (the plugin only covers octane + @octanejs/query).
	ssr: {
		noExternal: [/^octane($|\/)/, /^@octanejs\//],
	},

	optimizeDeps: {
		exclude: ['octane', '@octanejs/router', '@octanejs/mdx', '@octanejs/vite-plugin'],
	},

	server: {
		port: 5179,
	},

	build: {
		target: 'esnext',
	},
});
