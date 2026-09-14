import {
	packageRewrite,
	differentialSetup,
} from '../../../../test-utils/differential-precompile.js';

export const { setup, teardown } = differentialSetup({
	fixtureDir: new URL('../_fixtures/', import.meta.url),
	cacheDir: new URL('./.react-cache/', import.meta.url),
	rewrites: [packageRewrite('@octanejs/i18next', 'react-i18next')],
	fixtures: 'all',
	match: /-diff\.tsrx$/,
	onError: 'skip',
	depsFrom: import.meta.url,
});
