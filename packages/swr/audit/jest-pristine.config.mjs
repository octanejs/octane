import upstreamConfig from '../upstream/jest.config.js';

export default {
	...upstreamConfig,
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
