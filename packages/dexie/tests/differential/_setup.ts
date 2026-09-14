import {
	differentialSetup,
	type DifferentialPrecompileConfig,
} from '../../../../test-utils/differential-precompile.js';

export const differentialConfig: DifferentialPrecompileConfig = {
	fixtureDir: new URL('../_fixtures/', import.meta.url),
	cacheDir: new URL('./.react-cache/', import.meta.url),
	rewrites: [[/from\s+["']@octanejs\/dexie["']/g, 'from "dexie-react-hooks"']],
	fixtures: ['live-query.tsrx'],
	depsFrom: import.meta.url,
};

export const { setup, teardown } = differentialSetup(differentialConfig);
