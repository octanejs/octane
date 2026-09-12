import { defineConfig } from 'vitest/config';
import { octane } from '../../octane/src/compiler/vite.js';
import { packageRoot, aiAliases, aiHelperImports, adaptedJsx } from './parity-config.ts';
export default defineConfig({
	root: packageRoot,
	test: {
		name: 'tanstack-ai-adapted',
		include: ['tests/upstream/**/*.test.{ts,tsx}'],
		exclude: ['tests/upstream/chat-ui/create-ui.test.tsx'],
		environment: 'jsdom',
		globals: true,
		setupFiles: ['tests/upstream/setup.ts', 'tests/conformance/test-setup.ts'],
	},
	plugins: [aiHelperImports, adaptedJsx, octane()],
	resolve: {
		dedupe: ['octane', 'vitest', '@tanstack/ai', '@tanstack/ai-client'],
		alias: aiAliases,
	},
});
