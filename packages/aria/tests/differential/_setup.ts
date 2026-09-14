import { differentialSetup } from '../../../../test-utils/differential-precompile.js';

export const { setup, teardown } = differentialSetup({
	fixtureDir: new URL('../_fixtures/', import.meta.url),
	cacheDir: new URL('./.react-cache/', import.meta.url),
	rewrites: [
		[/from\s+["']@octanejs\/aria\/stately["']/g, 'from "react-stately"'],
		[/from\s+["']@octanejs\/aria\/components["']/g, 'from "react-aria-components"'],
		[/from\s+["']@octanejs\/aria["']/g, 'from "react-aria"'],
	],
	fixtures: 'all',
	onError: 'skip',
	depsFrom: import.meta.url,
});
