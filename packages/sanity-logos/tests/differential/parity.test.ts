import { describe, it } from 'vitest';
import { resolve } from 'node:path';
import { mountDifferential } from '../../../octane/tests/differential/_rig.js';

describe('differential: @octanejs/sanity-logos vs @sanity/logos@2.2.5', () => {
	it('renders every logo and color variant identically', async () => {
		const fixture = resolve(__dirname, '../_fixtures/logos.tsrx');
		const cache = resolve(__dirname, '.react-cache');
		const differential = await mountDifferential(fixture, 'SanityLogoGallery', undefined, cache);
		await differential.step('mount', () => {});
		differential.unmount();
	});
});
