import {
	packageRewrite,
	differentialSetup,
} from '../../../../test-utils/differential-precompile.js';

export const { setup, teardown } = differentialSetup({
	fixtureDir: new URL('../_fixtures/', import.meta.url),
	cacheDir: new URL('./.react-cache-ssr/', import.meta.url),
	rewrites: [packageRewrite('@octanejs/remix-router', 'react-router')],
	fixtures: ['static-ssr-diff.tsrx'],
	depsFrom: import.meta.url,
});
