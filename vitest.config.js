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
		],
	},
});
