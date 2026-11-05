import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
		include: ['tests/**/*.test.ts'],
		// Execute the built server with Node's loader, including Rspack's file: chunk imports.
		server: { deps: { external: [/\/octane-rsbuild-build-[^/]+\/build\/server\//] } },
		sequence: {
			concurrent: false,
		},
	},
});
