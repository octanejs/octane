// Bench build config. The upstream config is preserved verbatim beside this
// file (vite.config.upstream.ts.txt) for diffing; this replaces it with the
// same app-behavior configuration minus deploy/observability tooling:
//   - Cloudflare Workers plugin, Sentry, TanStack devtools, bundle analyzer,
//     and the Takumi WASM OG-image wiring are removed — the benchmark runs
//     plain node loopback servers and never renders OG images.
//   - Everything that shapes what ships or how it renders is KEPT: the `~`
//     alias, server-compat aliases, SSR noExternal lists, dep-optimizer
//     excludes, manual chunking, and the tanstackStart() options
//     (inlineCss/code-splitting/import-protection).
//   - `@tanstack/redact` (Tanner's React-compatible engine, aliased over
//     react-dom/server upstream) is opt-IN here via BENCH_REDACT=true — the
//     react flavor benchmarks stock React; the redact flavor re-enables the
//     alias map. Upstream default is redact ON (DISABLE_REDACT opt-out).
import { defineConfig } from 'vite';
import type { PluginOption } from 'vite';
import { redact } from '@tanstack/redact/vite';
import contentCollections from '@content-collections/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import tailwindcss from '@tailwindcss/vite';
import viteReact from '@vitejs/plugin-react';
import path from 'node:path';

const isDev = process.env.NODE_ENV !== 'production';
const shouldUseRedact = process.env.BENCH_REDACT === 'true';
const SITE_URL = 'https://tanstack.com';

// Upstream: runtime-specific `react-dom/server` variants funnel to
// `@tanstack/redact/server` so Workers get a single server implementation.
const serverVariantAliases: Record<string, string> = {
	'react-dom/server': '@tanstack/redact/server',
	'react-dom/server.edge': '@tanstack/redact/server',
	'react-dom/server.node': '@tanstack/redact/server',
	'react-dom/server.bun': '@tanstack/redact/server',
	'react-dom/server.browser': '@tanstack/redact/server',
	'react-dom/static.edge': '@tanstack/redact/server',
	'react-dom/static.node': '@tanstack/redact/server',
	'react-dom/static': '@tanstack/redact/server',
};

const useSyncExternalStoreShimIndexAlias = {
	find: /^use-sync-external-store\/shim\/index\.js$/,
	replacement: '@tanstack/redact',
};

// Browser-facing packages imported by SSR assets; bundled into server output
// so the runtime never loads their raw package entries. (Upstream list minus
// the integrations removed from the bench surface.)
const serverBundledClientPackages = [
	// Redact flavor: react/react-dom/scheduler must be BUNDLED into the server
	// output so the build-time react→redact aliases apply — externalized, node
	// would load stock react at runtime beside redact's renderer (null
	// dispatcher). Upstream never hits this: the Workers build bundles
	// everything unconditionally.
	...(shouldUseRedact ? ['@tanstack/redact', 'react', 'react-dom', 'scheduler'] : []),
	/^@radix-ui\//,
	'@tanstack/highlight',
	'@tanstack/markdown',
	'@tanstack/react-hotkeys',
	'@tanstack/react-pacer',
	'@tanstack/react-table',
	'lucide-react',
	'zustand',
];

const routerSsrPackages = [
	'@tanstack/history',
	'@tanstack/query-core',
	'@tanstack/react-query',
	'@tanstack/react-router',
	'@tanstack/react-router-ssr-query',
	'@tanstack/react-router/ssr',
	'@tanstack/react-router/ssr/server',
	'@tanstack/router-core',
];

export default defineConfig({
	define: {
		__TANSTACK_ENABLE_SERVER_BUILDER_GENERATION__: JSON.stringify(false),
		__TANSTACK_ENABLE_IMAGE_TRANSFORMATIONS__: JSON.stringify(false),
		__TANSTACK_SITE_URL__: JSON.stringify(SITE_URL),
	},
	resolve: {
		alias: [
			{
				find: '~',
				replacement: path.resolve(__dirname, './src'),
			},
			{
				find: 'ejs',
				replacement: path.resolve(__dirname, './src/server/runtime/ejs-compat.server.ts'),
			},
			{
				find: 'unicorn-magic',
				replacement: 'unicorn-magic/node',
			},
			...(shouldUseRedact
				? [
						// Belt-and-braces mirror of redact()'s alias map: one server
						// chunk (content-collections' blog module) resolved bare `react`
						// after the plugin's pass, loading stock react beside redact's
						// renderer at runtime (null dispatcher). Exact-match aliases at
						// the top-level resolve close that hole.
						{ find: /^react$/, replacement: '@tanstack/redact' },
						{
							find: /^react\/jsx-runtime$/,
							replacement: '@tanstack/redact/jsx-runtime',
						},
						{
							find: /^react\/jsx-dev-runtime$/,
							replacement: '@tanstack/redact/jsx-dev-runtime',
						},
						{
							find: /^react\/compiler-runtime$/,
							replacement: '@tanstack/redact/compiler-runtime',
						},
						{ find: /^react-dom$/, replacement: '@tanstack/redact/dom' },
						{
							find: /^react-dom\/client$/,
							replacement: '@tanstack/redact/dom-client',
						},
						{ find: /^scheduler$/, replacement: '@tanstack/redact/scheduler' },
						useSyncExternalStoreShimIndexAlias,
						...Object.entries(serverVariantAliases).map(([find, replacement]) => ({
							find,
							replacement,
						})),
					]
				: []),
		],
	},
	server: {
		port: Number(process.env.PORT) || 3000,
	},
	environments: {
		ssr: {
			optimizeDeps: {
				exclude: ['@tanstack/create'],
			},
			resolve: {
				// Bundle EVERYTHING, exactly like the Workers build upstream
				// deploys. For redact it is also load-bearing: any externalized
				// react-consumer (visx, devtools, ai-react) would load stock react at
				// runtime beside redact's renderer and crash with a null dispatcher.
				// Applying it to every flavor keeps the server builds config-identical
				// for the perf comparison.
				noExternal: true,
			},
		},
	},
	ssr: {
		external: [],
		noExternal: true,
	},
	optimizeDeps: {
		exclude: [
			'@tanstack/create',
			...(isDev ? ['@tanstack/cli'] : []),
			// Lucide can resolve differently across Vite environments; excluding it
			// keeps resolution deterministic (upstream note).
			'lucide-react',
		],
	},
	build: {
		minify: 'esbuild',
		sourcemap: false,
		reportCompressedSize: false,
		rollupOptions: {
			output: {
				manualChunks: (id) => {
					if (
						id.includes('/node_modules/@tanstack/react-start') ||
						id.includes('/node_modules/@tanstack/start-')
					) {
						return 'tanstack-start';
					}
					if (id.includes('/src/db/types.ts') || id.includes('/src/libraries/ids.ts')) {
						return 'shared-constants';
					}
					if (
						id.includes('/node_modules/@tanstack/react-router') ||
						id.includes('/node_modules/@tanstack/router-core') ||
						id.includes('/node_modules/@tanstack/history')
					) {
						return 'tanstack-router';
					}
					if (
						id.includes('/node_modules/@tanstack/react-query') ||
						id.includes('/node_modules/@tanstack/query-core')
					) {
						return 'tanstack-query';
					}
					if (id.includes('node_modules')) {
						if (id.includes('lucide-react')) {
							return 'icons';
						}
						if (
							id.includes('node_modules/react-dom/') ||
							id.includes('node_modules/react/') ||
							id.includes('node_modules/scheduler/')
						) {
							return 'react';
						}
					}
				},
			},
		},
	},
	plugins: [
		// The redact() plugin carries the full react→redact alias map (the
		// manual server-variant aliases above are the same supplement upstream
		// keeps alongside it).
		...(shouldUseRedact ? [redact()] : []),
		tanstackStart({
			server: {
				build: {
					inlineCss: false,
				},
			},
			importProtection: {
				behavior: 'error',
				client: {
					files: ['**/*.server.*', '**/server/**'],
					specifiers: ['@tanstack/react-start/server'],
				},
			},
			router: {
				codeSplittingOptions: {
					defaultBehavior: [
						['component', 'pendingComponent', 'errorComponent', 'notFoundComponent', 'loader'],
					],
				},
			},
		}),
		viteReact(),
		contentCollections(),
		tailwindcss(),
	] as PluginOption[],
});
