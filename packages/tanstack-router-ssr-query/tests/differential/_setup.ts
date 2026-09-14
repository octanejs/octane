import { differentialSetup } from '../../../../test-utils/differential-precompile.js';

export const { setup, teardown } = differentialSetup({
	fixtureDir: new URL('../_fixtures/', import.meta.url),
	cacheDir: new URL('./.react-cache/', import.meta.url),
	rewrites: [[/from\s+["']@octanejs\/tanstack-query["']/g, 'from "@tanstack/react-query"']],
	fixtures: ['ssr-query-diff.tsrx'],
	depsFrom: import.meta.url,
});
