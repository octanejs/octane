import {
	differentialSetup,
	type DifferentialPrecompileConfig,
} from '../../../../test-utils/differential-precompile.js';

export const differentialConfig: DifferentialPrecompileConfig = {
	fixtureDir: new URL('../_fixtures/', import.meta.url),
	cacheDir: new URL('./.react-cache/', import.meta.url),
	rewrites: [
		[
			/from\s+["']@octanejs\/nuqs\/adapters\/([^"']+)["']/g,
			(_match, adapter) => `from "nuqs/adapters/${adapter}"`,
		],
		[/from\s+["']@octanejs\/nuqs["']/g, 'from "nuqs"'],
	],
	fixtures: 'all' as const,
	depsFrom: import.meta.url,
};

export const { setup, teardown } = differentialSetup(differentialConfig);
