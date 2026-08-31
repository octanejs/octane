import { resolve } from 'node:path';
import { describe, it } from 'vitest';
import { mountDifferential } from '../../../octane/tests/differential/_rig.js';

describe('differential: @octanejs/sanity-loader vs @sanity/react-loader@2.2.1', () => {
	it('hydrates the same initial query snapshot', async () => {
		const fixture = resolve(__dirname, '../_fixtures/initial-query.tsrx');
		const cache = resolve(__dirname, '.react-cache');
		const differential = await mountDifferential(fixture, 'InitialQuery', undefined, cache);
		await differential.step('mount', () => {});
		differential.unmount();
	});
});
