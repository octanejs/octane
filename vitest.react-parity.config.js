import baseConfig from './vitest.config.js';
import {
	buildParityVitestProjects,
	loadRequiredVitestLanes,
} from './scripts/react-parity/vitest-batch-lib.mjs';

const root = import.meta.dirname;
const lanes = loadRequiredVitestLanes(root);

export default {
	...baseConfig,
	test: {
		...baseConfig.test,
		projects: buildParityVitestProjects({
			baseProjects: baseConfig.test.projects,
			lanes,
			root,
		}),
	},
};
