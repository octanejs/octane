import { configDefaults, defineConfig } from 'vitest/config';
import { vyre } from 'vyre/compiler/vite';

export default defineConfig({
	test: {
		...configDefaults,
		projects: [
			{
				test: {
					name: 'vyre',
					include: [
						'packages/vyre/tests/**/*.test.tsrx',
						'packages/vyre/tests/**/*.test.ts',
					],
					environment: 'jsdom',
					// Precompiles every fixture through @tsrx/react + esbuild before any
					// test loads — runs in pure Node so esbuild's TextEncoder requirements
					// are satisfied (jsdom's TextEncoder breaks esbuild's binary protocol).
					globalSetup: ['packages/vyre/tests/differential/_setup.ts'],
					globals: false,
				},
				plugins: [vyre()],
			},
		],
	},
});
