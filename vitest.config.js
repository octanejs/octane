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
					// Drains DEFERRED unmount passive destroys after each test so they
					// can't leak into the next test's first flush (see the file).
					setupFiles: ['packages/octane/tests/_per-test-setup.ts'],
					globals: false,
				},
				plugins: [
					octane({
						// The parallel-use pipeline (memoized creations, batched unwrap,
						// fetch-tree warming) runs at its DEFAULT (on). Tests that pin
						// the opt-out output call compile() with `parallelUse: false`.
						exclude: [
							'/packages/zustand/src/',
							'/packages/tanstack-query/src/',
							'/packages/motion/src/',
						],
					}),
				],
			},
			{
				// The SAME octane test files compiled in PRODUCTION mode (`hmr: false`
				// → no HMR wrapper, no dev LOC metadata, plain Symbol("<hash>#<n>")
				// hook slots). Vitest runs the plugin in serve mode, so without this
				// project the prod compile branch has ZERO runtime coverage — which is
				// how the 2026-07-08 bare-Symbol() slot regression shipped past 2,400
				// green tests and broke website hydration on every route. Any test
				// that specifically asserts DEV-ONLY plugin output belongs in the
				// exclude list below (tests that call compile() with explicit flags
				// are unaffected — they control their own options).
				test: {
					name: 'octane-prod',
					include: ['packages/octane/tests/**/*.test.tsrx', 'packages/octane/tests/**/*.test.ts'],
					environment: 'jsdom',
					globalSetup: ['packages/octane/tests/differential/_setup.ts'],
					setupFiles: ['packages/octane/tests/_per-test-setup.ts'],
					globals: false,
					// Mode probe for the handful of tests that assert DEV-ONLY runtime
					// warnings (gated on the dev-compile __oct_loc stamp — silent in
					// prod, like React's prod bundle): they conditionalize on this.
					env: { OCTANE_TEST_COMPILE_MODE: 'prod' },
				},
				plugins: [
					octane({
						hmr: false,
						exclude: [
							'/packages/zustand/src/',
							'/packages/tanstack-query/src/',
							'/packages/motion/src/',
						],
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
						exclude: [
							'/packages/zustand/src/',
							'/packages/tanstack-query/src/',
							'/packages/motion/src/',
						],
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
					name: 'tanstack-query',
					include: ['packages/tanstack-query/tests/**/*.test.ts'],
					environment: 'jsdom',
					// Differential precompile for query fixtures: rewrites
					// `@octanejs/tanstack-query` → `@tanstack/react-query` so the React side runs
					// real react-query.
					globalSetup: ['packages/tanstack-query/tests/differential/_setup.ts'],
					globals: false,
				},
				plugins: [
					octane({
						exclude: [
							'/packages/zustand/src/',
							'/packages/tanstack-query/src/',
							'/packages/motion/src/',
						],
					}),
				],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/tanstack-query$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-query/src/index.ts'),
						},
						{
							find: /^@octanejs\/tanstack-query\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-query/src') + '/$1.ts',
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
						exclude: [
							'/packages/zustand/src/',
							'/packages/tanstack-query/src/',
							'/packages/motion/src/',
						],
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
					name: 'hook-form',
					include: [
						'packages/hook-form/tests/**/*.test.ts',
						'packages/hook-form/tests/**/*.test.tsx',
					],
					exclude: [...configDefaults.exclude, 'packages/hook-form/tests/**/*.server.test.tsx'],
					environment: 'jsdom',
					// Differential precompile: rewrites `@octanejs/hook-form` →
					// `react-hook-form` so the React side runs the real binding.
					globalSetup: ['packages/hook-form/tests/differential/_setup.ts'],
					// The ported upstream suite uses @testing-library/jest-dom matchers
					// (toBeVisible, toBeInTheDocument, …) — same as react-hook-form's own
					// jest setup. clear/reset/restore mirror upstream's jest config so
					// spy state never leaks between ported tests.
					setupFiles: ['packages/hook-form/tests/_setup.ts'],
					clearMocks: true,
					mockReset: true,
					restoreMocks: true,
					globals: false,
				},
				// hook-form's `.ts` hooks are auto-slotted (same as redux); the
				// testing-library the ported suite mounts through is NOT (its harness
				// calls hooks with explicit slot symbols).
				plugins: [
					octane({
						exclude: [
							'/packages/zustand/src/',
							'/packages/tanstack-query/src/',
							'/packages/motion/src/',
							'/packages/testing-library/src/',
						],
					}),
				],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/hook-form$/,
							replacement: resolve(import.meta.dirname, 'packages/hook-form/src/index.ts'),
						},
						{
							find: /^@octanejs\/hook-form\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/hook-form/src') + '/$1.ts',
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
				// react-hook-form's own jest config runs `*.server.test.tsx` in a
				// node environment; same split here — node transform mode also makes
				// the octane plugin compile in `mode: 'server'`, which the server
				// renderer (renderToStaticMarkup) requires.
				test: {
					name: 'hook-form-server',
					include: ['packages/hook-form/tests/**/*.server.test.tsx'],
					environment: 'node',
					globals: false,
				},
				plugins: [
					octane({
						exclude: [
							'/packages/zustand/src/',
							'/packages/tanstack-query/src/',
							'/packages/motion/src/',
						],
					}),
				],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/hook-form$/,
							replacement: resolve(import.meta.dirname, 'packages/hook-form/src/index.ts'),
						},
						{
							find: /^@octanejs\/hook-form\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/hook-form/src') + '/$1.ts',
						},
						{
							// The binding's plain `.ts` sources import hooks from 'octane'
							// (the CLIENT runtime). Under this node/SSR project the server
							// renderer drives the components, so those imports must resolve
							// to the SERVER runtime's hook implementations — same module
							// instance the server-compiled .tsrx components use
							// ('octane/server' emissions are untouched by this bare alias).
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'recharts',
					include: ['packages/recharts/tests/**/*.test.ts'],
					environment: 'jsdom',
					// The differential oracle (real recharts + vendored d3) is expensive
					// to load and charts settle over many raf rounds — slow CI runners
					// tripped the 5s default on the file's first test.
					testTimeout: 30_000,
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
						exclude: [
							'/packages/zustand/src/',
							'/packages/tanstack-query/src/',
							'/packages/motion/src/',
						],
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
					name: 'tanstack-router',
					include: ['packages/tanstack-router/tests/**/*.test.ts'],
					environment: 'jsdom',
					// Differential precompile for router fixtures: rewrites
					// `@octanejs/tanstack-router` → `@tanstack/react-router` so the React side
					// runs real react-router.
					globalSetup: ['packages/tanstack-router/tests/differential/_setup.ts'],
					globals: false,
				},
				plugins: [
					octane({
						exclude: [
							'/packages/zustand/src/',
							'/packages/tanstack-query/src/',
							'/packages/motion/src/',
							'/packages/tanstack-router/src/',
						],
					}),
				],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/tanstack-router$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-router/src/index.ts'),
						},
						{
							find: /^@octanejs\/tanstack-router\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-router/src') + '/$1.ts',
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
						exclude: [
							'/packages/zustand/src/',
							'/packages/tanstack-query/src/',
							'/packages/motion/src/',
						],
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
							'/packages/tanstack-query/src/',
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
							'/packages/tanstack-query/src/',
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
							'/packages/tanstack-query/src/',
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
							'/packages/tanstack-query/src/',
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
							'/packages/tanstack-query/src/',
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
							'/packages/tanstack-query/src/',
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
							'/packages/tanstack-query/src/',
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
					// ssr-smoke and ssr-hydration.e2e both run a REAL production
					// `vite build` into the same output roots (website/dist,
					// website/.vercel/output) and the e2e file then serves that
					// output with octane-preview. Running the files in parallel
					// would let one build delete/rewrite artifacts the other is
					// building or serving, so this project is file-serial by
					// contract, not by timing.
					fileParallelism: false,
				},
				// The website app stack: octaneMdx() compiles the site's .mdx documents
				// (same shared options — Shiki + tsrx langAlias — the app itself uses);
				// octane() compiles the .tsrx pages and slots hooks in app .ts files.
				// The bindings' own `.ts` sources hand-forward slots, so they are
				// excluded from the auto-slotting pass (same reasoning as the projects
				// above). Package imports (@octanejs/tanstack-router, octane, …) resolve through
				// website/node_modules workspace links — no aliases needed.
				plugins: [
					octaneMdx(websiteMdxOptions),
					octane({
						exclude: [
							'/packages/tanstack-router/src/',
							'/packages/mdx/src/',
							'/packages/testing-library/src/',
						],
					}),
				],
			},
		],
	},
});
