import { differentialSetup } from '../../../../test-utils/differential-precompile.js';

// 'skip' because core fixtures legitimately use octane-only syntax
// (@switch, multi-ref, Dynamic shapes) that @tsrx/react rejects.
export const { setup, teardown } = differentialSetup({
	fixtureDir: new URL('../_fixtures/', import.meta.url),
	cacheDir: new URL('./.react-cache/', import.meta.url),
	fixtures: 'all',
	onError: 'skip',
	depsFrom: import.meta.url,
});
