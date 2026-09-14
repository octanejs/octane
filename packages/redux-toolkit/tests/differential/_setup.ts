import { differentialSetup } from '../../../../test-utils/differential-precompile.js';

export const { setup, teardown } = differentialSetup({
	fixtureDir: new URL('../_fixtures/', import.meta.url),
	cacheDir: new URL('./.react-cache/', import.meta.url),
	rewrites: [
		['@octanejs/redux-toolkit/query/react', '@reduxjs/toolkit/query/react'],
		['@octanejs/redux-toolkit/react', '@reduxjs/toolkit/react'],
		['@octanejs/redux-toolkit/query', '@reduxjs/toolkit/query'],
		['@octanejs/redux-toolkit', '@reduxjs/toolkit'],
		['@octanejs/redux', 'react-redux'],
	],
	fixtures: ['rtk-query.tsrx'],
	depsFrom: import.meta.url,
});
