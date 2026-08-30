import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { octane } from '../../packages/octane/src/compiler/vite.js';

const root = fileURLToPath(new URL('../../', import.meta.url));

// A private feasibility project: React source must remain React-owned while
// the surrounding .tsrx fixture uses Octane's real compiler and runtime.
export const reactCompatSpikeProjects = [
	...['dev', 'prod'].map((mode) => ({
		root,
		plugins: [
			octane({ requireDirective: true, hmr: mode === 'prod' ? false : undefined }),
			react(),
		],
		test: {
			name: `react-compat-transport-${mode}`,
			include: ['packages/octane/tests/react-compat-spike/**/*.test.ts'],
			environment: 'jsdom',
			setupFiles: ['packages/octane/tests/_per-test-setup.ts'],
			env: { OCTANE_TEST_COMPILE_MODE: mode },
			globals: false,
		},
	})),
	{
		root,
		// CI's unit shards do not install Chromium. Existing execution-group
		// discovery sends only these two files to the heavy browser lane, while
		// the materializer safety checks remain in the ordinary Node shards.
		testExecution: {
			group: 'heavy-browser',
			browsers: ['chromium'],
			include: [
				'experiments/react-compat/browser-probes.test.ts',
				'experiments/react-compat/candidate-probes.test.ts',
			],
		},
		test: {
			name: 'react-compat-browser-probes',
			include: ['experiments/react-compat/*.test.ts', 'experiments/react-compat/patch/*.test.ts'],
			environment: 'node',
			globals: false,
			hookTimeout: 60_000,
			testTimeout: 30_000,
		},
	},
];

export default defineConfig({ test: { silent: true, projects: reactCompatSpikeProjects } });
