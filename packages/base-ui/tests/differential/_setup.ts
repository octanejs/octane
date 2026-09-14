import { differentialSetup } from '../../../../test-utils/differential-precompile.js';

export const { setup, teardown } = differentialSetup({
	fixtureDir: new URL('../_fixtures/', import.meta.url),
	cacheDir: new URL('./.react-cache/', import.meta.url),
	rewrites: [
		[/from\s+["']@octanejs\/base-ui\/([^"']+)["']/g, 'from "@base-ui/react/$1"'],
		[/from\s+["']@octanejs\/base-ui["']/g, 'from "@base-ui/react"'],
	],
	fixtures: 'all',
	onError: 'skip',
	depsFrom: import.meta.url,
});
