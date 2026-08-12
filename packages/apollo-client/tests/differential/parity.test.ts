import { resolve } from 'node:path';
import { describe, it } from 'vitest';
import {
	mountDifferential,
	preloadDifferentialFixture,
} from '../../../octane/tests/differential/_rig.js';

const FIXTURE = resolve(__dirname, '../_fixtures/differential/query-diff.tsrx');
const CACHE = resolve(__dirname, '.react-cache');

await Promise.all([preloadDifferentialFixture(FIXTURE, CACHE)]);

describe('differential: @octanejs/apollo-client vs @apollo/client/react', () => {
	// @parity-case differential:apollo-cache-query
	it('ApolloProvider and cache-only useQuery render byte-identical data', async () => {
		const differential = await mountDifferential(FIXTURE, 'QueryDiff', undefined, CACHE);
		await differential.step('mount', () => {});
		differential.unmount();
	});
});
