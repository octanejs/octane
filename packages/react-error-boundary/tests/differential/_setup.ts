import { differentialSetup } from '../../../../test-utils/differential-precompile.js';

export const { setup, teardown } = differentialSetup({
	fixtureDir: new URL('../_fixtures/', import.meta.url),
	cacheDir: new URL('./.react-cache/', import.meta.url),
	rewrites: [[/from\s+["']@octanejs\/react-error-boundary["']/g, 'from "react-error-boundary"']],
	fixtures: 'all',
	depsFrom: import.meta.url,
});
