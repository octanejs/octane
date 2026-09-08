import { resolve } from 'node:path';

import { defineConfig } from 'vitest/config';

const root = resolve(import.meta.dirname, '../..');

export default defineConfig({
	root,
	resolve: { dedupe: ['vitest'] },
	test: {
		environment: 'jsdom',
		include: ['packages/resizable-panels/upstream/lib/**/*.test.{ts,tsx}'],
		setupFiles: ['packages/resizable-panels/upstream/vitest.setup.ts'],
		server: {
			deps: { inline: ['@testing-library/jest-dom', 'vitest-fail-on-console'] },
		},
	},
});
