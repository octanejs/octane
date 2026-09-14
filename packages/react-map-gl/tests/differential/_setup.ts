import { differentialSetup } from '../../../../test-utils/differential-precompile.js';

export const { setup, teardown } = differentialSetup({
	fixtureDir: new URL('../_fixtures/differential/', import.meta.url),
	cacheDir: new URL('./.react-cache/', import.meta.url),
	rewrites: [[/from\s+["']@octanejs\/react-map-gl["']/g, 'from "@vis.gl/react-mapbox"']],
	fixtures: 'all',
	depsFrom: import.meta.url,
});
