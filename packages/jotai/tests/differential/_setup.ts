import {
	packageRewrite,
	differentialSetup,
} from '../../../../test-utils/differential-precompile.js';

export const { setup, teardown } = differentialSetup({
	fixtureDir: new URL('../_fixtures/', import.meta.url),
	cacheDir: new URL('./.react-cache/', import.meta.url),
	rewrites: [packageRewrite('@octanejs/jotai', 'jotai')],
	fixtures: ['counter-diff.tsrx', 'providers-diff.tsrx', 'split-diff.tsrx', 'async-diff.tsrx'],
	depsFrom: import.meta.url,
});
