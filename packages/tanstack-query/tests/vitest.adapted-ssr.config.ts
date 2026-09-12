import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { octane } from '../../octane/src/compiler/vite.js';
import adapted from './vitest.adapted.config';

const packageRoot = resolve(import.meta.dirname, '..');
const server = resolve(packageRoot, '../octane/src/server/index.ts');

export default defineConfig({
	...adapted,
	test: {
		...adapted.test,
		name: 'tanstack-query-adapted-ssr',
		include: ['tests/upstream/ssr.test.tsx'],
		exclude: [],
		setupFiles: [],
	},
	plugins: [adapted.plugins![0], octane({ ssr: true })],
	resolve: {
		...adapted.resolve,
		alias: [
			{ find: /^octane(?:\/server)?$/, replacement: server },
			...(adapted.resolve!.alias as []),
		],
	},
});
