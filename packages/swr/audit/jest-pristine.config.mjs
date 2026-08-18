import { resolve } from 'node:path';

import upstreamConfig from '../upstream/jest.config.js';

const testingLibraryHarness = resolve(import.meta.dirname, 'upstream-testing-library.cjs');

export default {
	...upstreamConfig,
	moduleNameMapper: {
		...upstreamConfig.moduleNameMapper,
		'^@testing-library/react$': testingLibraryHarness,
	},
	transform: {
		'^.+\\.(t|j)sx?$': [
			'@swc/jest',
			{
				jsc: {
					parser: { syntax: 'typescript', tsx: true },
					transform: { react: { runtime: 'automatic' } },
				},
			},
		],
	},
};
