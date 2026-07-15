import { defineConfig, type Plugin, type ResolvedConfig } from 'vite';
import { createRequire } from 'node:module';
import { octane } from '@octanejs/vite-plugin';
import { octaneMdx } from '@octanejs/mdx/vite';
import { websiteMdxOptions } from './mdx-options.ts';

// The playground executes user code in a sandboxed iframe with an OPAQUE
// origin (src/lib/playground-sandbox.ts). That iframe can't import the site's
// bundled octane (blob URLs are origin-bound and cross-origin module fetches
// need CORS), so the parent hands it the runtime as TEXT — which requires a
// SELF-CONTAINED single-file ESM bundle of the octane client runtime. This
// plugin builds one with esbuild: served on demand in dev, emitted as a
// stable-named client asset in the production build.
function playgroundRuntime(): Plugin {
	const RUNTIME_PATH = '/playground-runtime.mjs'; // = RUNTIME_MODULE_PATH in playground-sandbox.ts
	let config: ResolvedConfig;

	async function bundle(): Promise<string> {
		const esbuild = await import('esbuild');
		// Workspace link: website/node_modules/octane → packages/octane, whose
		// exports map points "." at src/index.ts (raw TS — esbuild handles it).
		const entry = createRequire(import.meta.url).resolve('octane');
		const out = await esbuild.build({
			entryPoints: [entry],
			bundle: true,
			format: 'esm',
			minify: true,
			write: false,
			define: { 'process.env.NODE_ENV': JSON.stringify('production') },
		});
		return out.outputFiles[0].text;
	}

	return {
		name: 'octane-playground-runtime',
		configResolved(resolved) {
			config = resolved;
		},
		configureServer(server) {
			server.middlewares.use(RUNTIME_PATH, (_req, res, next) => {
				// Rebuilt per request — esbuild bundles the runtime in ~15ms, and
				// this way dev never serves a stale runtime after octane edits.
				bundle().then((code) => {
					res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
					res.end(code);
				}, next);
			});
		},
		async generateBundle() {
			if (config.build.ssr) return; // client build only
			this.emitFile({
				type: 'asset',
				fileName: RUNTIME_PATH.slice(1),
				source: await bundle(),
			});
		},
	};
}

export default defineConfig({
	plugins: [
		playgroundRuntime(),
		// octaneMdx() owns `.mdx` (full pipeline: @mdx-js/mdx → octane compile,
		// with Shiki highlighting via rehype); octane() owns `.tsrx`/`.ts` and the
		// metaframework (dev SSR + routing + hydrate). The workspace bindings'
		// hand-slot-forwarding sources (pnpm symlinks resolve them to
		// /packages/*/src, not node_modules) declare
		// `"octane": { "hookSlots": { "manual": ["src"] } }` in their package.json, so the
		// hook-slotting pass skips them automatically — no exclude list needed.
		// Bindings without a manual hook-slot declaration still compile through
		// the pass (explicit subSlot tags compose with it), unlike router/mdx.
		octaneMdx(websiteMdxOptions),
		octane(),
	],

	optimizeDeps: {
		// Vite's dep scanner can't parse .tsrx, so dependencies reached only
		// through raw workspace sources or dynamic route imports are pre-declared
		// to avoid a mid-session optimize pass under a hydrating page.
		include: [
			// Playground editor stack + the octane compiler's deps ('octane' is
			// excluded by the compiler plugin, so imports from octane/compiler surface at request
			// time) — all reached only through the playground page's dynamic
			// imports, which the scanner can't see either.
			'@codemirror/commands',
			'@codemirror/state',
			'@codemirror/view',
			'shiki',
			'@tsrx/core',
			'esrap',
			'esrap/languages/tsx',
			'octane > devalue',
			'@octanejs/tanstack-router > @tanstack/history',
			'@octanejs/tanstack-router > @tanstack/router-core',
			'@octanejs/tanstack-router > @tanstack/store',
			// Visx primitives are raw workspace sources; these are the runtime
			// dependencies reached by the site's Bar/Axis/Group/Scale surface.
			// Resolve them through their owner under pnpm's isolated layout.
			'@octanejs/visx > classnames',
			'@octanejs/visx > d3-interpolate',
			'@octanejs/visx > d3-path',
			'@octanejs/visx > d3-scale',
			'@octanejs/visx > d3-shape',
			'@octanejs/visx > d3-time',
			'@octanejs/visx > reduce-css-calc',
			'@octanejs/visx > svg-path-properties',
		],
	},

	server: {
		port: 5179,
	},

	build: {
		target: 'esnext',
	},
});
