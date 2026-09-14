import { differentialSetup } from '../../../../test-utils/differential-precompile.js';

export const { setup, teardown } = differentialSetup({
	fixtureDir: new URL('../_fixtures/', import.meta.url),
	cacheDir: new URL('./.react-cache/', import.meta.url),
	rewrites: [
		[
			/from\s+["']@octanejs\/formisch(\/[^"']*)?["']/g,
			function (_match: string, subpath: string | undefined) {
				return `from "@formisch/react${subpath || ''}"`;
			},
		],
	],
	fixtures: 'all',
	depsFrom: import.meta.url,
});
