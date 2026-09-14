import {
	packageRewrite,
	differentialSetup,
} from '../../../../test-utils/differential-precompile.js';

export const { setup, teardown } = differentialSetup({
	fixtureDir: new URL('../_fixtures/', import.meta.url),
	cacheDir: new URL('./.react-cache/', import.meta.url),
	rewrites: [packageRewrite('@octanejs/lexical', '@lexical/react')],
	fixtures: 'all',
	depsFrom: import.meta.url,
});
