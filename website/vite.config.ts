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
		// metaframework (dev SSR + routing + hydrate). The workspace bindings'
		// hand-slot-forwarding sources (pnpm symlinks resolve them to
		// /packages/*/src, not node_modules) declare
		// `"octane": { "hookSlots": { "manual": ["src"] } }` in their package.json, so the
		// hook-slotting pass skips them automatically — no exclude list needed.
		// @octanejs/recharts + @octanejs/redux carry no declaration and DO compile
		// through the pass (explicit subSlot tags compose with it), unlike
		// router/mdx.
		octaneMdx(websiteMdxOptions),
		octane(),
	],

	// The workspace bindings ship raw TS — Vite must transform them for the SSR
	// module graph (the plugin only covers octane + @octanejs/tanstack-query).
	ssr: {
		noExternal: [/^octane($|\/)/, /^@octanejs\//],
	},

	optimizeDeps: {
		exclude: [
			'octane',
			'@octanejs/tanstack-router',
			'@octanejs/mdx',
			'@octanejs/vite-plugin',
			'@octanejs/recharts',
			'@octanejs/redux',
		],
		// Vite's dep scanner can't parse .tsrx, so the deps that
		// @octanejs/recharts/@octanejs/redux (raw workspace TS, excluded above)
		// pull in are only discovered at request time — pre-declare them so the
		// first optimize pass covers everything and dev never mid-session
		// re-optimizes under the hydrating page.
		include: [
			// Playground editor stack + the octane compiler's deps ('octane' is
			// excluded above, so imports from octane/compiler surface at request
			// time) — all reached only through the playground page's dynamic
			// imports, which the scanner can't see either.
			'@codemirror/commands',
			'@codemirror/state',
			'@codemirror/view',
			'shiki',
			'@tsrx/core',
			'esrap',
			'esrap/languages/tsx',
			'@reduxjs/toolkit',
			'clsx',
			'decimal.js-light',
			'es-toolkit/compat',
			'eventemitter3',
			'immer',
			'reselect',
			'tiny-invariant',
			'victory-vendor/d3-scale',
			'victory-vendor/d3-shape',
		],
	},

	server: {
		port: 5179,
	},

	build: {
		target: 'esnext',
	},
});
