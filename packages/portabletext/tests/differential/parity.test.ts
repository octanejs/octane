import { describe, it } from 'vitest';
import { resolve } from 'node:path';
import { mountDifferential } from '../../../octane/tests/differential/_rig.js';

const cache = resolve(__dirname, '.react-cache');
const fixture = resolve(__dirname, '../_fixtures/render.tsrx');

describe('differential: @octanejs/portabletext vs @portabletext/react@8.0.1', () => {
	it('renders the default component set identically', async () => {
		const differential = await mountDifferential(
			fixture,
			'DefaultPortableTextFixture',
			undefined,
			cache,
		);
		await differential.step('mount', () => {});
		differential.unmount();
	});

	it('renders custom components identically', async () => {
		const differential = await mountDifferential(
			fixture,
			'CustomPortableTextFixture',
			undefined,
			cache,
		);
		await differential.step('mount', () => {});
		differential.unmount();
	});
});
