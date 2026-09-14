import { differentialSetup } from '../../../../test-utils/differential-precompile.js';

export const { setup, teardown } = differentialSetup({
	fixtureDir: new URL('.', import.meta.url),
	cacheDir: new URL('./.react-cache/', import.meta.url),
	rewrites: [[/from\s+["']@octanejs\/better-auth["']/g, 'from "better-auth/react"']],
	fixtures: ['auth-diff.tsrx'],
	depsFrom: import.meta.url,
});
