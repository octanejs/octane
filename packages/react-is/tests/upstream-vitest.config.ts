import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { octane } from '../../octane/src/compiler/vite.js';
export default defineConfig({
	plugins: [octane()],
	test: {
		name: 'react-is-pristine',
		root: resolve(import.meta.dirname, '../../..'),
		include: ['packages/react-is/tests/pristine-entry.test.ts'],
		environment: 'jsdom',
		maxWorkers: 2,
	},
});
