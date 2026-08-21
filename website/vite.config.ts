import { defineConfig, type Plugin } from 'vite';
import { cpSync, existsSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { octaneMdx } from '@octanejs/mdx/vite';
import { threeRenderers } from '@octanejs/three/config';
import { tanstackStart } from '@octanejs/tanstack-start/plugin/vite';
import { nitro } from 'nitro/vite';
import { websiteMdxOptions } from './mdx-options.ts';
import { playgroundRuntime } from './playground-runtime.ts';

// The upstream shadcn CLI fetches registry items directly from /r. Keep the
// deployed tree derived from the package's checked generated output so website
// builds cannot publish a second, independently drifting registry copy.
function prepareShadcnRegistry(): void {
	const sourceUrl = new URL('../packages/shadcn/registry/', import.meta.url);
	const source = fileURLToPath(sourceUrl);
	const destination = fileURLToPath(new URL('./public/r', import.meta.url));
	if (!existsSync(new URL('registry.json', sourceUrl))) {
		throw new Error(
			'shadcn registry is missing; run `pnpm shadcn:registry` from the repository root',
		);
	}
	rmSync(destination, { recursive: true, force: true });
	cpSync(source, destination, { recursive: true });
}

prepareShadcnRegistry();

// Does any pre-bundled dependency resolve to a checkout OUTSIDE node_modules —
// a `link:` override in pnpm-workspace.yaml pointing at a sibling repo?
//
// Pre-bundling a linked package is a trap: Vite's optimize hash covers the
// lockfile, the config and the include list — not the linked package's SOURCE —
// so an edit there stays invisible to the dev server behind a cache no browser
// reload can clear. Dropping it from `include` instead is worse: it is then
// discovered at request time and triggers a mid-session optimize pass under a
// hydrating page, which is exactly what the list below exists to prevent.
//
// So keep pre-bundling and re-optimize on every dev-server start. The cost is
// paid once at startup — and a server restart is already what you do after
// editing a linked package. Zero effect when nothing is linked.
const websiteRequire = createRequire(import.meta.url);
/** Where a bare specifier resolves from the website, or null if it does not. */
function resolveFromWebsite(specifier: string): string | null {
	try {
		return websiteRequire.resolve(specifier);
	} catch {
		return null;
	}
}
function isLinkedDependency(specifier: string): boolean {
	// `optimizeDeps` entries may be nested ('octane > devalue'); the leaf is what
	// actually gets bundled.
	const resolved = resolveFromWebsite(specifier.split('>').pop()!.trim());
	return resolved !== null && !resolved.includes('node_modules');
}
/**
 * Pre-declaring a package this app cannot reach makes Vite log a
 * `Failed to resolve dependency … present in optimizeDeps.include` line per
 * entry on every optimize pass.
 *
 * The test is DIRECT reachability, not Node resolution: under pnpm's isolated
 * layout only declared dependencies are linked into `website/node_modules`, and
 * that boundary is what Vite resolves against. A transitive package still
 * resolves through the store for `require.resolve` while being invisible here —
 * which is exactly the case that produces those warnings. Nested entries
 * ('owner > dep') are left alone; their leaf resolves through the owner.
 */
function isDeclarable(specifier: string): boolean {
	if (specifier.includes('>')) return true;
	const name = specifier.startsWith('@')
		? specifier.split('/').slice(0, 2).join('/')
		: specifier.split('/')[0];
	return existsSync(new URL(`./node_modules/${name}`, import.meta.url));
}

/**
 * `vite preview` serves the built `public/` through its own static middleware,
 * which answers `.wasm` with `application/octet-stream`. The Lynx runtime under
 * /lynx-runtime instantiates its engine with `WebAssembly.compileStreaming`,
 * which rejects anything that is not `application/wasm` — so every Lynx preview
 * on /docs/lynx renders nothing, and the production e2e suite (which drives
 * every route through `vite preview`) sees the failure as page errors.
 *
 * Only the preview server needs this. Vite's dev server and the built Nitro
 * server both type it correctly on their own.
 */
function previewWasmContentType(): Plugin {
	return {
		name: 'octane-preview-wasm-content-type',
		configurePreviewServer(server) {
			server.middlewares.use((request, response, next) => {
				if (!request.url?.split('?')[0]?.endsWith('.wasm')) return next();
				// Setting the header here is not enough on its own: the static
				// handler downstream sets its own Content-Type, and the last write
				// wins. Pin the value for this response instead of guessing where
				// the built file lives.
				const setHeader = response.setHeader.bind(response);
				response.setHeader = (name: string, value: never) =>
					name.toLowerCase() === 'content-type'
						? setHeader(name, 'application/wasm')
						: setHeader(name, value);
				setHeader('Content-Type', 'application/wasm');
				next();
			});
		},
	};
}

// Dependencies the scanner cannot reach (raw workspace sources, dynamic route
// imports) — pre-declared so no optimize pass runs mid-session.
const PREBUNDLED = [
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
	'@octanejs/tanstack-router > @tanstack/history',
	'@octanejs/tanstack-router > @tanstack/router-core',
	'@octanejs/tanstack-router > @tanstack/store',
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
	// TanStack DevTools panel-host island. The whole island is reached only
	// through @octanejs/tanstack-devtools's raw .tsrx source and the host's
	// internal dynamic import, so Vite's scanner sees none of it. Pre-declare
	// the ENTIRE island so it optimizes in ONE startup pass: that keeps the
	// host's lazy mount chunk on a hash consistent with its entry (no
	// mid-mount re-optimize → no "504 Outdated Optimize Dep") and bundles the
	// CJS dep dayjs with a synthesized `default` export. solid-js is pinned to
	// 1.9.14 for this island via the pnpm override (Solid 2 dropped
	// solid-js/web); remove this block once @tanstack/devtools ships Solid 2.
	'@tanstack/devtools',
	'@tanstack/devtools-ui',
	'@tanstack/devtools-client',
	'@tanstack/devtools-event-bus',
	'@tanstack/devtools-event-client',
	'dayjs',
	'goober',
	'@solid-primitives/event-listener',
	'@solid-primitives/keyboard',
	'@solid-primitives/resize-observer',
];

export default defineConfig({
	plugins: [
		playgroundRuntime(),
		previewWasmContentType(),
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
			// devtools: true enables profiling instrumentation in dev (compiled out
			// of prod) for the /devtools demo route's <TanStackDevtools> panel.
			octane: { renderers: threeRenderers, devtools: true },
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
						// State the Lynx runtime's wasm type rather than inherit it. The
						// engine loads through WebAssembly.compileStreaming, which
						// rejects anything that is not `application/wasm`, and the
						// symptom is a silently blank preview — see
						// previewWasmContentType above, where exactly that happened.
						{
							src: '/lynx-runtime/static/wasm/(.*)',
							headers: { 'content-type': 'application/wasm' },
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
		// See isLinkedDependency: a linked package's edits are otherwise cached
		// past any reload. Computed from the list below, so no package is named.
		force: PREBUNDLED.some(isLinkedDependency),
		// Vite's dep scanner can't parse .tsrx, so dependencies reached only
		// through raw workspace sources or dynamic route imports are pre-declared
		// to avoid a mid-session optimize pass under a hydrating page.
		include: PREBUNDLED.filter(isDeclarable),
	},

	server: {
		port: 5179,
	},
	preview: {
		port: 3000,
	},

	build: {
		target: 'baseline-widely-available',
		// The client emits hundreds of Shiki language chunks. Computing gzip
		// sizes for every chunk adds minutes after the build has already succeeded.
		reportCompressedSize: false,
	},
});
