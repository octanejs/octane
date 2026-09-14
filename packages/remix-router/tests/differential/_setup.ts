import {
	packageRewrite,
	differentialSetup,
} from '../../../../test-utils/differential-precompile.js';

export const { setup, teardown } = differentialSetup({
	fixtureDir: new URL('../_fixtures/', import.meta.url),
	cacheDir: new URL('./.react-cache/', import.meta.url),
	rewrites: [packageRewrite('@octanejs/remix-router', 'react-router')],
	fixtures: [
		'nested-layouts-diff.tsrx',
		'loader-redirect-error-diff.tsrx',
		'await-deferred-diff.tsrx',
		'pending-navigation-diff.tsrx',
		'declarative-diff.tsrx',
		'navlink-diff.tsrx',
		'forms-diff.tsrx',
		'guards-diff.tsrx',
	],
	depsFrom: import.meta.url,
});
