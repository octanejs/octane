import { resolve } from 'node:path';
import { configDefaults, defineConfig } from 'vitest/config';
import { octane } from './packages/octane/src/compiler/vite.js';

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
				plugins: [octane()],
			},
			{
				test: {
					name: 'zustand',
					include: ['packages/zustand/tests/**/*.test.ts'],
					environment: 'jsdom',
					// Same differential precompile, but for zustand fixtures: also rewrites
					// `@octane-ts/zustand` → `zustand` so the React side runs real zustand.
					globalSetup: ['packages/zustand/tests/differential/_setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				// `@octane-ts/zustand` is the package under test; alias the public name
				// (and its subpaths) to source so fixtures import it exactly as a consumer
				// would (and the differential React side rewrites the same specifiers to
				// `zustand`). Regex aliases so `@octane-ts/zustand/shallow` → src/shallow.ts
				// without the bare entry's file path swallowing the subpath.
				resolve: {
					alias: [
						{
							find: /^@octane-ts\/zustand$/,
							replacement: resolve(import.meta.dirname, 'packages/zustand/src/index.ts'),
						},
						{
							find: /^@octane-ts\/zustand\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/zustand/src') + '/$1.ts',
						},
					],
				},
			},
		],
	},
});
