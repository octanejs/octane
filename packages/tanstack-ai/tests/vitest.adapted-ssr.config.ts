import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { octane } from '../../octane/src/compiler/vite.js';
import adapted from './vitest.adapted.config.ts';
import { packageRoot, aiHelperImports, adaptedJsx } from './parity-config.ts';
export default defineConfig({
	...adapted,
	test: {
		...adapted.test,
		name: 'tanstack-ai-adapted-ssr',
		include: ['tests/upstream/chat-ui/create-ui.test.tsx'],
		exclude: [],
		setupFiles: [],
	},
	plugins: [aiHelperImports, adaptedJsx, octane({ ssr: true })],
	resolve: {
		...adapted.resolve,
		alias: [
			{
				find: /^octane(?:\/server)?$/,
				replacement: resolve(packageRoot, '../octane/src/server/index.ts'),
			},
			...(adapted.resolve!.alias as []),
		],
	},
});
