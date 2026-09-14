import { differentialSetup } from '../../../../test-utils/differential-precompile.js';

export const { setup, teardown } = differentialSetup({
	fixtureDir: new URL('../_fixtures/', import.meta.url),
	cacheDir: new URL('./.react-cache/', import.meta.url),
	rewrites: [[/from\s+["']@octanejs\/mobx["']/g, 'from "mobx-react-lite"']],
	fixtures: 'all',
	depsFrom: import.meta.url,
});
