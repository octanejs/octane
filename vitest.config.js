import { resolve } from 'node:path';
import { configDefaults, defineConfig } from 'vitest/config';
import { octane } from './packages/octane/src/compiler/vite.js';
import { octaneMdx } from './packages/mdx/src/vite.js';
import { stylex } from './packages/stylex/src/vite.js';
import { websiteMdxOptions } from './website/mdx-options.ts';

export default defineConfig({
	test: {
		...configDefaults,
		projects: [
			{
				test: {
					name: 'octane',
					include: ['packages/octane/tests/**/*.test.tsrx', 'packages/octane/tests/**/*.test.ts'],
					environment: 'jsdom',
					// Precompiles every fixture through @tsrx/react + esbuild before any
					// test loads — runs in pure Node so esbuild's TextEncoder requirements
					// are satisfied (jsdom's TextEncoder breaks esbuild's binary protocol).
					globalSetup: ['packages/octane/tests/differential/_setup.ts'],
					globals: false,
				},
				plugins: [
					octane({
						exclude: ['/packages/zustand/src/', '/packages/query/src/', '/packages/motion/src/'],
					}),
				],
			},
			{
				test: {
					name: 'zustand',
					include: ['packages/zustand/tests/**/*.test.ts'],
					environment: 'jsdom',
					// Same differential precompile, but for zustand fixtures: also rewrites
					// `@octanejs/zustand` → `zustand` so the React side runs real zustand.
					globalSetup: ['packages/zustand/tests/differential/_setup.ts'],
					globals: false,
				},
				plugins: [
					octane({
						exclude: ['/packages/zustand/src/', '/packages/query/src/', '/packages/motion/src/'],
					}),
				],
				// `@octanejs/zustand` is the package under test; alias the public name
				// (and its subpaths) to source so fixtures import it exactly as a consumer
				// would (and the differential React side rewrites the same specifiers to
				// `zustand`). Regex aliases so `@octanejs/zustand/shallow` → src/shallow.ts
				// without the bare entry's file path swallowing the subpath.
				resolve: {
					alias: [
						{
							find: /^@octanejs\/zustand$/,
							replacement: resolve(import.meta.dirname, 'packages/zustand/src/index.ts'),
						},
						{
							find: /^@octanejs\/zustand\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/zustand/src') + '/$1.ts',
						},
					],
				},
			},
			{
				test: {
					name: 'query',
					include: ['packages/query/tests/**/*.test.ts'],
					environment: 'jsdom',
					// Differential precompile for query fixtures: rewrites
					// `@octanejs/query` → `@tanstack/react-query` so the React side runs
					// real react-query.
					globalSetup: ['packages/query/tests/differential/_setup.ts'],
					globals: false,
				},
				plugins: [
					octane({
						exclude: ['/packages/zustand/src/', '/packages/query/src/', '/packages/motion/src/'],
					}),
				],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/query$/,
							replacement: resolve(import.meta.dirname, 'packages/query/src/index.ts'),
						},
						{
							find: /^@octanejs\/query\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/query/src') + '/$1.ts',
						},
					],
				},
			},
			{
				test: {
					name: 'redux',
					include: ['packages/redux/tests/**/*.test.ts'],
					environment: 'jsdom',
					// Differential precompile: rewrites `@octanejs/redux` →
					// `react-redux` so the React side runs the real binding.
					globalSetup: ['packages/redux/tests/differential/_setup.ts'],
					globals: false,
				},
				plugins: [
					octane({
						exclude: ['/packages/zustand/src/', '/packages/query/src/', '/packages/motion/src/'],
					}),
				],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/redux$/,
							replacement: resolve(import.meta.dirname, 'packages/redux/src/index.ts'),
						},
						{
							find: /^@octanejs\/redux\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/redux/src') + '/$1.ts',
						},
					],
				},
			},
			{
				test: {
					name: 'recharts',
					include: ['packages/recharts/tests/**/*.test.ts'],
					environment: 'jsdom',
					// Differential precompile for recharts fixtures: rewrites
					// `@octanejs/recharts` → `recharts` so the React side runs the real
					// recharts as the byte-for-byte SVG oracle.
					globalSetup: ['packages/recharts/tests/differential/_setup.ts'],
					globals: false,
					// Inline the oracle so it resolves the SAME module graph a real
					// bundled app does: recharts has no exports map, so externalized
					// node loading takes its CJS `main` → victory-vendor's `require`
					// condition → the vendored PRE-3.2 d3-shape build (full-precision
					// paths). Inlined, both sides take the `import` condition →
					// victory-vendor/es → real d3-shape@3.2 (3-digit path rounding).
					server: {
						deps: {
							inline: ['recharts', 'victory-vendor'],
						},
					},
				},
				plugins: [
					octane({
						exclude: ['/packages/zustand/src/', '/packages/query/src/', '/packages/motion/src/'],
					}),
				],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/recharts$/,
							replacement: resolve(import.meta.dirname, 'packages/recharts/src/index.ts'),
						},
						{
							find: /^@octanejs\/recharts\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/recharts/src') + '/$1.ts',
						},
						{
							// SSR resolution ignores the `module` field, so bare 'recharts'
							// would enter through its CJS `main` even when inlined — send it
							// to the es6 build explicitly (no exports map, deep path is legal)
							// so the oracle runs the same ESM graph a bundled app runs.
							find: /^recharts$/,
							replacement: 'recharts/es6/index.js',
						},
					],
				},
			},
			{
				test: {
					name: 'router',
					include: ['packages/router/tests/**/*.test.ts'],
					environment: 'jsdom',
					// Differential precompile for router fixtures: rewrites
					// `@octanejs/router` → `@tanstack/react-router` so the React side
					// runs real react-router.
					globalSetup: ['packages/router/tests/differential/_setup.ts'],
					globals: false,
				},
				plugins: [
					octane({
						exclude: [
							'/packages/zustand/src/',
							'/packages/query/src/',
							'/packages/motion/src/',
							'/packages/router/src/',
						],
					}),
				],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/router$/,
							replacement: resolve(import.meta.dirname, 'packages/router/src/index.ts'),
						},
						{
							find: /^@octanejs\/router\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/router/src') + '/$1.ts',
						},
					],
				},
			},
			{
				test: {
					name: 'motion',
					include: ['packages/motion/tests/**/*.test.ts'],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [
					octane({
						exclude: ['/packages/zustand/src/', '/packages/query/src/', '/packages/motion/src/'],
					}),
				],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/motion$/,
							replacement: resolve(import.meta.dirname, 'packages/motion/src/index.ts'),
						},
						{
							find: /^@octanejs\/motion\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/motion/src') + '/$1.ts',
						},
					],
				},
			},
			{
				test: {
					name: 'lexical',
					include: ['packages/lexical/tests/**/*.test.ts', 'packages/lexical/tests/**/*.test.tsx'],
					environment: 'jsdom',
					// Precompiles `.tsrx` fixtures → real @lexical/react for the differential
					// oracle (rewrites `@octanejs/lexical/X` → `@lexical/react/X`).
					globalSetup: ['packages/lexical/tests/differential/_setup.ts'],
					globals: false,
				},
				plugins: [
					octane({
						exclude: [
							'/packages/zustand/src/',
							'/packages/query/src/',
							'/packages/motion/src/',
							'/packages/lexical/src/',
							// @octanejs/floating-ui's hooks forward the caller's slot via subSlot;
							// like its own project, they must skip the auto-slotting pass when a
							// lexical .tsrx (e.g. LexicalNodeContextMenuPlugin) imports them.
							'/packages/floating-ui/src/',
						],
					}),
				],
				resolve: {
					// `.tsrx` is added so extensionless subpath imports
					// (`@octanejs/lexical/LexicalComposer`) resolve to a `.tsrx` component
					// OR a `.ts` hook — mirroring @lexical/react's per-subpath module layout.
					extensions: ['.tsrx', '.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
					alias: [
						{
							find: /^@octanejs\/lexical$/,
							replacement: resolve(import.meta.dirname, 'packages/lexical/src/index.ts'),
						},
						{
							find: /^@octanejs\/lexical\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/lexical/src') + '/$1',
						},
						{
							find: /^@octanejs\/floating-ui$/,
							replacement: resolve(import.meta.dirname, 'packages/floating-ui/src/index.ts'),
						},
						{
							find: /^@octanejs\/floating-ui\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/floating-ui/src') + '/$1.ts',
						},
					],
				},
			},
			{
				test: {
					name: 'stylex',
					include: ['packages/stylex/tests/**/*.test.ts'],
					environment: 'jsdom',
					globals: false,
				},
				// octane() compiles the `.tsrx` fixtures; stylex() (enforce:'post') then
				// runs the StyleX compiler over that output, replacing stylex.* calls with
				// atomic class names. `dev:false` keeps class names deterministic for tests.
				plugins: [
					octane({
						exclude: [
							'/packages/zustand/src/',
							'/packages/query/src/',
							'/packages/motion/src/',
							'/packages/stylex/src/',
						],
					}),
					stylex({ dev: false }),
				],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/stylex$/,
							replacement: resolve(import.meta.dirname, 'packages/stylex/src/index.ts'),
						},
						{
							find: /^@octanejs\/stylex\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/stylex/src') + '/$1.ts',
						},
					],
				},
			},
			{
				test: {
					name: 'floating-ui',
					include: [
						'packages/floating-ui/tests/**/*.test.ts',
						'packages/floating-ui/tests/**/*.test.tsx',
					],
					environment: 'jsdom',
					globals: false,
				},
				// floating-ui's `.ts` hooks forward the caller's slot via subSlot, so they
				// must be EXCLUDED from the auto-slotting pass (the `.tsx` fixtures that call
				// them are full-compiled and inject the trailing slot).
				plugins: [
					octane({
						exclude: [
							'/packages/zustand/src/',
							'/packages/query/src/',
							'/packages/motion/src/',
							'/packages/floating-ui/src/',
						],
					}),
				],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/floating-ui$/,
							replacement: resolve(import.meta.dirname, 'packages/floating-ui/src/index.ts'),
						},
						{
							find: /^@octanejs\/floating-ui\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/floating-ui/src') + '/$1.ts',
						},
					],
				},
			},
			{
				test: {
					name: 'radix',
					include: ['packages/radix/tests/**/*.test.ts', 'packages/radix/tests/**/*.test.tsx'],
					environment: 'jsdom',
					// Differential precompile for radix fixtures: rewrites `@octanejs/radix` →
					// `radix-ui` so the React side runs the real Radix primitives.
					globalSetup: ['packages/radix/tests/differential/_setup.ts'],
					globals: false,
				},
				// radix's `.ts` foundation forwards the caller's slot via subSlot, so it must
				// be EXCLUDED from the auto-slotting pass (the `.tsx` fixtures that call it are
				// full-compiled and inject the trailing slot) — as must @octanejs/floating-ui,
				// which radix's Popper builds on.
				plugins: [
					octane({
						exclude: [
							'/packages/zustand/src/',
							'/packages/query/src/',
							'/packages/motion/src/',
							'/packages/radix/src/',
							'/packages/floating-ui/src/',
						],
					}),
				],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/radix$/,
							replacement: resolve(import.meta.dirname, 'packages/radix/src/index.ts'),
						},
						{
							find: /^@octanejs\/radix\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/radix/src') + '/$1.ts',
						},
						{
							find: /^@octanejs\/floating-ui$/,
							replacement: resolve(import.meta.dirname, 'packages/floating-ui/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'base-ui',
					include: ['packages/base-ui/tests/**/*.test.ts', 'packages/base-ui/tests/**/*.test.tsx'],
					environment: 'jsdom',
					// Differential precompile for base-ui fixtures: rewrites `@octanejs/base-ui/<sub>`
					// → `@base-ui-components/react/<sub>` so the React side runs real Base UI.
					globalSetup: ['packages/base-ui/tests/differential/_setup.ts'],
					globals: false,
				},
				// base-ui's `.ts` foundation forwards the caller's slot via subSlot, so it must
				// be EXCLUDED from the auto-slotting pass — as must @octanejs/floating-ui, which
				// base-ui's overlays build on.
				plugins: [
					octane({
						exclude: [
							'/packages/zustand/src/',
							'/packages/query/src/',
							'/packages/motion/src/',
							'/packages/base-ui/src/',
							'/packages/floating-ui/src/',
						],
					}),
				],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/base-ui$/,
							replacement: resolve(import.meta.dirname, 'packages/base-ui/src/index.ts'),
						},
						{
							find: /^@octanejs\/base-ui\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/base-ui/src') + '/$1.ts',
						},
						{
							find: /^@octanejs\/floating-ui$/,
							replacement: resolve(import.meta.dirname, 'packages/floating-ui/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'testing-library',
					include: ['packages/testing-library/tests/**/*.test.ts'],
					environment: 'jsdom',
					globals: false,
				},
				// The binding's `.ts` sources call hooks with EXPLICIT slot symbols
				// (renderHook's harness component), so they must be EXCLUDED from the
				// auto-slotting pass; the test files themselves stay included so hook
				// callbacks written inline in tests get their call-site slots.
				plugins: [
					octane({
						exclude: [
							'/packages/zustand/src/',
							'/packages/query/src/',
							'/packages/motion/src/',
							'/packages/testing-library/src/',
						],
					}),
				],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/testing-library$/,
							replacement: resolve(import.meta.dirname, 'packages/testing-library/src/index.ts'),
						},
						{
							find: /^@octanejs\/testing-library\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/testing-library/src') + '/$1.ts',
						},
					],
				},
			},
			{
				test: {
					name: 'mdx',
					include: ['packages/mdx/tests/**/*.test.ts'],
					environment: 'jsdom',
					globals: false,
				},
				// octaneMdx() owns `.mdx`/`.md` (it runs the FULL pipeline — @mdx-js/mdx →
				// octane compile — and returns final JS); octane() compiles the `.tsrx`
				// fixtures embedded in documents and the test files. The binding's own
				// `.ts` sources call hooks with EXPLICIT slot symbols, so they are
				// excluded from the auto-slotting pass — as is @octanejs/testing-library,
				// which the tests mount through.
				plugins: [
					octaneMdx(),
					octane({
						exclude: [
							'/packages/zustand/src/',
							'/packages/query/src/',
							'/packages/motion/src/',
							'/packages/mdx/src/',
							'/packages/testing-library/src/',
						],
					}),
				],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/mdx$/,
							replacement: resolve(import.meta.dirname, 'packages/mdx/src/index.ts'),
						},
						{
							// `compile`/`vite` are Node-loadable `.js` (see packages/mdx/src/vite.js);
							// the runtime entries (`server`, …) stay `.ts`.
							find: /^@octanejs\/mdx\/(compile|vite)$/,
							replacement: resolve(import.meta.dirname, 'packages/mdx/src') + '/$1.js',
						},
						{
							find: /^@octanejs\/mdx\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/mdx/src') + '/$1.ts',
						},
						{
							find: /^@octanejs\/testing-library$/,
							replacement: resolve(import.meta.dirname, 'packages/testing-library/src/index.ts'),
						},
						{
							find: /^@octanejs\/testing-library\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/testing-library/src') + '/$1.ts',
						},
					],
				},
			},
			{
				test: {
					name: 'octane-mcp-server',
					include: ['packages/octane-mcp-server/src/**/*.test.js'],
					environment: 'node',
					globals: false,
				},
			},
			{
				test: {
					name: 'vite-plugin',
					include: ['packages/vite-plugin-octane/tests/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
			},
			{
				test: {
					name: 'adapter-vercel',
					include: ['packages/adapter-vercel/tests/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
			},
			{
				test: {
					name: 'website',
					include: ['website/tests/**/*.test.ts'],
					environment: 'jsdom',
					globals: false,
				},
				// The website app stack: octaneMdx() compiles the site's .mdx documents
				// (same shared options — Shiki + tsrx langAlias — the app itself uses);
				// octane() compiles the .tsrx pages and slots hooks in app .ts files.
				// The bindings' own `.ts` sources hand-forward slots, so they are
				// excluded from the auto-slotting pass (same reasoning as the projects
				// above). Package imports (@octanejs/router, octane, …) resolve through
				// website/node_modules workspace links — no aliases needed.
				plugins: [
					octaneMdx(websiteMdxOptions),
					octane({
						exclude: [
							'/packages/router/src/',
							'/packages/mdx/src/',
							'/packages/testing-library/src/',
						],
					}),
				],
			},
		],
	},
});
