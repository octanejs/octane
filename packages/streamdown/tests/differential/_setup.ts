import { differentialSetup } from '../../../../test-utils/differential-precompile.js';

export const { setup, teardown } = differentialSetup({
	fixtureDir: new URL('../_fixtures/', import.meta.url),
	cacheDir: new URL('./.react-cache/', import.meta.url),
	rewrites: [
		[/from\s+["']@octanejs\/streamdown\/code["']/g, 'from "@streamdown/code"'],
		[/from\s+["']@octanejs\/streamdown\/math["']/g, 'from "@streamdown/math"'],
		[/from\s+["']@octanejs\/streamdown\/mermaid["']/g, 'from "@streamdown/mermaid"'],
		[/from\s+["']@octanejs\/streamdown\/cjk["']/g, 'from "@streamdown/cjk"'],
		[/from\s+["']@octanejs\/streamdown["']/g, 'from "streamdown"'],
	],
	fixtures: ['markdown-parity.tsrx', 'feature-parity.tsrx'],
	depsFrom: import.meta.url,
});
