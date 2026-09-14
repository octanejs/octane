import { differentialSetup } from '../../../../test-utils/differential-precompile.js';

export const { setup, teardown } = differentialSetup({
	fixtureDir: new URL('../_fixtures/', import.meta.url),
	cacheDir: new URL('./.react-cache/', import.meta.url),
	rewrites: [
		[/from\s+['"]@octanejs\/email['"]/g, 'from "@react-email/components"'],
		[/from\s+['"]\.\.\/\.\.\/src\/components\.tsrx['"]/g, 'from "@react-email/components"'],
		[/from\s+['"]\.\.\/\.\.\/src\/index\.ts['"]/g, 'from "@react-email/components"'],
	],
	fixtures: 'all',
	depsFrom: import.meta.url,
});
