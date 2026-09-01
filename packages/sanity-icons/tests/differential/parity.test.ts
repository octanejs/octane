import { describe, it } from 'vitest';
import { resolve } from 'node:path';
import { mountDifferential } from '../../../octane/tests/differential/_rig.js';

describe('differential: @octanejs/sanity-icons vs @sanity/icons@5.2.1', () => {
	it('renders representative outline and multicolor icons identically', async () => {
		const fixture = resolve(__dirname, '../_fixtures/icons.tsrx');
		const cache = resolve(__dirname, '.react-cache');
		const differential = await mountDifferential(fixture, 'SanityIconGallery', undefined, cache);
		await differential.step('mount', () => {});
		differential.unmount();
	});
});
