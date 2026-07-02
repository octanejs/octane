import { resolve } from 'node:path';
import { configDefaults, defineConfig } from 'vitest/config';
import { octane } from './packages/octane/src/compiler/vite.js';
import { stylex } from './packages/stylex/src/vite.js';

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
					name: 'router',
					include: ['packages/router/tests/**/*.test.ts'],
					environment: 'jsdom',
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
				// full-compiled and inject the trailing slot).
				plugins: [
					octane({
						exclude: [
							'/packages/zustand/src/',
							'/packages/query/src/',
							'/packages/motion/src/',
							'/packages/radix/src/',
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
		],
	},
});
