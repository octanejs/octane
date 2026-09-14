import {
	packageRewrite,
	differentialSetup,
	type DifferentialPrecompileConfig,
} from '../../../../test-utils/differential-precompile.js';

export const differentialConfig: DifferentialPrecompileConfig = {
	fixtureDir: new URL('../_fixtures/', import.meta.url),
	cacheDir: new URL('./.react-cache/', import.meta.url),
	rewrites: [packageRewrite('@octanejs/tanstack-virtual', '@tanstack/react-virtual')],
	fixtures: 'all' as const,
	match: /-diff\.tsrx$/,
	depsFrom: import.meta.url,
};

export const { setup, teardown } = differentialSetup(differentialConfig);
