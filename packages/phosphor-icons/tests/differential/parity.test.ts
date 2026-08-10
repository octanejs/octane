import { describe, it } from 'vitest';
import { resolve } from 'node:path';
import { mountDifferential } from '../../../octane/tests/differential/_rig.js';

const fixture = resolve(__dirname, '../_fixtures/parity.tsrx');
const cache = resolve(__dirname, '.react-cache');

describe('differential: @octanejs/phosphor-icons vs real @phosphor-icons/react', () => {
	// @parity-case differential:camera-svg
	it('Camera renders byte-identical accessible duotone SVG', async () => {
		const mounted = await mountDifferential(fixture, 'CameraFixture', undefined, cache);
		await mounted.step('mount', () => {});
		mounted.unmount();
	}, 20_000);
});
