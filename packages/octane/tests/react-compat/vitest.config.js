import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { octane } from '../../src/compiler/vite.js';

const root = fileURLToPath(new URL('../../../../', import.meta.url));

export const reactCompatProjects = ['dev', 'prod'].map((mode) => ({
	root,
	plugins: [octane({ requireDirective: true, hmr: mode === 'prod' ? false : undefined }), react()],
	test: {
		name: `octane-hosted-react-${mode}`,
		include: ['packages/octane/tests/react-compat/**/*.test.ts'],
		environment: 'jsdom',
		setupFiles: ['packages/octane/tests/_per-test-setup.ts'],
		env: { OCTANE_TEST_COMPILE_MODE: mode },
		globals: false,
	},
}));

// These fixtures use plain server/client API functions, so no JSX transform is
// involved. Separate workers exercise the actual React production runtime too.
export const reactCompatSSRProjects = ['development', 'production'].map((mode) => ({
	root,
	resolve: {
		alias: [
			{ find: 'octane/react/server', replacement: `${root}packages/octane/src/react/server.ts` },
			{ find: 'octane/react', replacement: `${root}packages/octane/src/react/index.ts` },
			{ find: 'octane/server', replacement: `${root}packages/octane/src/server/index.ts` },
			{ find: 'octane/static', replacement: `${root}packages/octane/src/static/index.ts` },
			{ find: /^octane$/, replacement: `${root}packages/octane/src/index.ts` },
		],
	},
	test: {
		name: `octane-hosted-react-ssr-${mode}`,
		include: ['packages/octane/tests/react-compat-ssr.test.ts'],
		environment: 'jsdom',
		env: { NODE_ENV: mode },
		globals: false,
	},
}));

export default defineConfig({
	test: { silent: true, projects: [...reactCompatProjects, ...reactCompatSSRProjects] },
});
