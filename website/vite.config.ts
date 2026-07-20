import { defineConfig, type Plugin } from 'vite';
import { createRequire } from 'node:module';
import { octaneMdx } from '@octanejs/mdx/vite';
import { threeRenderers } from '@octanejs/three/config';
import { tanstackStart } from '@octanejs/tanstack-start/plugin/vite';
import { nitro } from 'nitro/vite';
import { websiteMdxOptions } from './mdx-options.ts';

// The playground executes user code in a sandboxed iframe with an OPAQUE
// origin (src/lib/playground-sandbox.ts). That iframe can't import the site's
// bundled octane (blob URLs are origin-bound and cross-origin module fetches
// need CORS), so the parent hands it the runtime as TEXT and the iframe turns
// it into blob modules on its own side of the boundary.
//
// The runtime ships as a JSON MANIFEST of esbuild code-split chunks rather
// than one file: `octane` and `octane/react` are separate entries sharing the
// octane core through common chunks (bundling `octane/react` standalone would
// duplicate the core — two runtimes, broken hook/context singletons). React
// itself stays EXTERNAL: the sandbox's import map resolves the react family to
// esm.sh, so react is only ever fetched when user code actually imports
// `octane/react` — pure-octane sessions never touch the network.
function playgroundRuntime(): Plugin {
	const MANIFEST_PATH = '/playground-runtime.json'; // = RUNTIME_MANIFEST_PATH in playground-sandbox.ts

	async function bundle(): Promise<string> {
		const esbuild = await import('esbuild');
		const require = createRequire(import.meta.url);
		const out = await esbuild.build({
			// Workspace link: website/node_modules/octane → packages/octane, whose
			// exports map points entries at raw TS sources — esbuild handles them.
			entryPoints: {
				octane: require.resolve('octane'),
				'octane-react': require.resolve('octane/react'),
			},
			bundle: true,
			splitting: true,
			format: 'esm',
			minify: true,
			write: false,
			outdir: 'playground-runtime',
			entryNames: '[name]',
			chunkNames: 'chunk-[hash]',
			outExtension: { '.js': '.mjs' },
			external: [
				'react',
				'react-dom',
				'react-dom/client',
				'react/jsx-runtime',
				'react/jsx-dev-runtime',
			],
			define: { 'process.env.NODE_ENV': JSON.stringify('production') },
		});

		const files: Record<string, string> = {};
		for (const file of out.outputFiles) {
			files[file.path.replace(/^.*[/\\]/, '')] = file.text;
		}

		// The sandbox creates a blob URL per file and splices it into the files
		// that import it, so files must arrive dependencies-first. Topo-sort the
		// chunk graph (esbuild inter-chunk specifiers are exactly `./<name>.mjs`).
		const deps = new Map<string, string[]>();
		for (const [name, code] of Object.entries(files)) {
			const imported: string[] = [];
			for (const match of code.matchAll(/(["'])\.\/([\w.-]+\.mjs)\1/g)) {
				if (files[match[2]] && !imported.includes(match[2])) imported.push(match[2]);
			}
			deps.set(name, imported);
		}
		const order: string[] = [];
		const state = new Map<string, 'visiting' | 'done'>();
		const visit = (name: string, chain: string[]) => {
			if (state.get(name) === 'done') return;
			if (state.get(name) === 'visiting') {
				throw new Error(
					`playground runtime chunks import each other cyclically (${[...chain, name].join(' → ')}) — the sandbox's dependencies-first blob ordering cannot represent that`,
				);
			}
			state.set(name, 'visiting');
			for (const dep of deps.get(name) ?? []) visit(dep, [...chain, name]);
			state.set(name, 'done');
			order.push(name);
		};
		for (const name of deps.keys()) visit(name, []);

		return JSON.stringify({
			entries: { octane: 'octane.mjs', 'octane/react': 'octane-react.mjs' },
			order,
			files,
		});
	}

	return {
		name: 'octane-playground-runtime',
		configureServer(server) {
			server.middlewares.use(MANIFEST_PATH, (_req, res, next) => {
				// Rebuilt per request — esbuild bundles the runtime in ~15ms, and
				// this way dev never serves a stale runtime after octane edits.
				bundle().then((code) => {
					res.setHeader('Content-Type', 'application/json; charset=utf-8');
					res.end(code);
				}, next);
			});
		},
		async generateBundle() {
			if (this.environment.name !== 'client') return;
			this.emitFile({
				type: 'asset',
				fileName: MANIFEST_PATH.slice(1),
				source: await bundle(),
			});
		},
	};
}

export default defineConfig({
	plugins: [
		playgroundRuntime(),
		// octaneMdx() owns `.mdx` (full pipeline: @mdx-js/mdx → Octane compile,
		// with Shiki highlighting via rehype). tanstackStart() supplies the Octane
		// compiler plus file routing, SSR, hydration, and the Start runtime. The
		// workspace bindings'
		// hand-slot-forwarding sources (pnpm symlinks resolve them to
		// /packages/*/src, not node_modules) declare
		// `"octane": { "hookSlots": { "manual": ["src"] } }` in their package.json, so the
		// hook-slotting pass skips them automatically — no exclude list needed.
		// Bindings without a manual hook-slot declaration still compile through
		// the pass (explicit subSlot tags compose with it), unlike router/mdx.
		octaneMdx(websiteMdxOptions),
		tanstackStart({
			// Scene modules stay client-only during Start SSR, matching the website's
			// existing Octane renderer contract while still shipping through Vite.
			octane: { renderers: threeRenderers },
		}),
		nitro({
			// Keep production on the runtime selected by the previous Vercel
			// adapter instead of deriving it from whichever Node version builds.
			vercel: {
				functions: { runtime: 'nodejs24.x' },
				config: {
					version: 3,
					// Apply immutable asset headers, then resolve static files before
					// falling through to Start's server function.
					routes: [
						{
							src: '/assets/(.*)',
							headers: { 'cache-control': 'public,max-age=31536000,immutable' },
							continue: true,
						},
						{ handle: 'filesystem' },
						{ src: '/(.*)', dest: '/__server' },
					],
				},
			},
		}),
	],

	resolve: {
		// @tsrx/prettier-plugin does `import { doc } from 'prettier'` — Node
		// prettier's entry. In the browser the equivalent surface (incl. `doc`)
		// lives in prettier/standalone, so anchor-alias exactly the bare
		// specifier; `prettier/standalone` and `prettier/plugins/*` pass through
		// untouched. Nothing else in website/ imports bare `prettier`.
		alias: [{ find: /^prettier$/, replacement: 'prettier/standalone' }],
	},

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
			// Playground module graph + formatter — also dynamic-import-only.
			'es-module-lexer',
			'sucrase',
			'prettier/standalone',
			'prettier/plugins/typescript',
			'prettier/plugins/estree',
			'@tsrx/prettier-plugin',
			'octane > devalue',
			'@tanstack/octane-router > @tanstack/history',
			'@tanstack/octane-router > @tanstack/router-core',
			'@tanstack/octane-router > @tanstack/store',
			// The home page's 3D logo section is reached only through a deferred
			// Hydrate chunk, so the scanner never sees three; pre-declare it (and
			// the SVGLoader example module) to avoid a mid-session optimize pass.
			'three',
			'three/examples/jsm/loaders/SVGLoader.js',
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
	preview: {
		port: 3000,
	},

	build: {
		target: 'esnext',
	},
});
