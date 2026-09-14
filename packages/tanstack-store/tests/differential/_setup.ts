import {
	differentialSetup,
	type DifferentialPrecompileConfig,
} from '../../../../test-utils/differential-precompile.js';

export const differentialConfig: DifferentialPrecompileConfig = {
	fixtureDir: new URL('../_fixtures/differential/', import.meta.url),
	cacheDir: new URL('./.react-cache/', import.meta.url),
	rewrites: [
		[
			/from\s+["']@octanejs\/tanstack-store(\/[^"']*)?["']/g,
			function rewriteTanstackStore(_match: string, subpath: string | undefined) {
				return `from "@tanstack/react-store${subpath || ''}"`;
			},
		],
	],
	fixtures: 'all' as const,
	rejectResidualOctane: true,
	depsFrom: import.meta.url,
};

export const { setup, teardown } = differentialSetup(differentialConfig);
