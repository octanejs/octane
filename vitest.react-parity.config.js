import baseConfig from './vitest.config.js';
import {
	buildParityVitestProjects,
	loadRequiredVitestLanes,
} from './scripts/react-parity/vitest-batch-lib.mjs';

const root = import.meta.dirname;
const lanes = await loadRequiredVitestLanes(root);

export default {
	...baseConfig,
	test: {
		...baseConfig.test,
		// The four CI shards already provide process-level parallelism. Capping
		// each 4-vCPU runner leaves enough headroom for Vite, browser, and jsdom
		// workers instead of intermittently losing an otherwise healthy test file.
		...(process.env.CI ? { maxWorkers: 2 } : {}),
		projects: buildParityVitestProjects({
			baseProjects: baseConfig.test.projects,
			lanes,
			root,
		}),
	},
};
