import {
	packageRewrite,
	differentialSetup,
} from '../../../../test-utils/differential-precompile.js';

export const { setup, teardown } = differentialSetup({
	fixtureDir: new URL('../_fixtures/', import.meta.url),
	cacheDir: new URL('./.react-cache/', import.meta.url),
	rewrites: [
		packageRewrite('@octanejs/wagmi', 'wagmi'),
		packageRewrite('@octanejs/tanstack-query', '@tanstack/react-query'),
	],
	fixtures: 'all',
	depsFrom: import.meta.url,
});
