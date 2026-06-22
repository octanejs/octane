import { defineConfig } from 'vitest/config';
import { vyre } from 'vyre/compiler/vite';

export default defineConfig({
	plugins: [vyre()],
	test: {
		environment: 'jsdom',
		include: ['tests/**/*.test.tsrx', 'tests/**/*.test.ts'],
		globals: false,
		// Precompiles every fixture through @tsrx/react + esbuild before any
		// test loads — runs in pure Node so esbuild's TextEncoder requirements
		// are satisfied (jsdom's TextEncoder breaks esbuild's binary protocol).
		globalSetup: ['./tests/differential/_setup.ts'],
	},
});
