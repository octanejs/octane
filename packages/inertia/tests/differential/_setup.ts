import { join, resolve } from 'node:path';
import { differentialSetup } from '../../../../test-utils/differential-precompile.js';

const upstreamRoot = resolve(import.meta.dirname, '../../upstream/src');
const upstreamIndex = join(upstreamRoot, 'index.ts');
const upstreamServer = join(upstreamRoot, 'server.ts');
const upstreamPageContext = join(upstreamRoot, 'PageContext.ts');

export const { setup, teardown } = differentialSetup({
	fixtureDir: new URL('../_fixtures/', import.meta.url),
	cacheDir: new URL('./.react-cache/', import.meta.url),
	// Point the React oracle at the vendored upstream adapter source so
	// PageContext and usePage share one module graph (the published package
	// does not export PageContext).
	rewrites: [
		[/from\s+["']@octanejs\/inertia\/server["']/g, `from ${JSON.stringify(upstreamServer)}`],
		[/from\s+["']@octanejs\/inertia["']/g, `from ${JSON.stringify(upstreamIndex)}`],
		[/from\s+["']inertia-page-context["']/g, `from ${JSON.stringify(upstreamPageContext)}`],
	],
	fixtures: 'all',
	match: /-diff\.tsrx$/,
	onError: 'skip',
	depsFrom: import.meta.url,
});
