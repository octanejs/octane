import { describe, it } from 'vitest';
import { resolve } from 'node:path';
import { mountDifferential } from '../../../octane/tests/differential/_rig.js';

const FIXTURE = resolve(__dirname, '../_fixtures/parity.tsrx');
const CACHE = resolve(__dirname, '.react-cache');

describe('differential: @octanejs/rxjs vs real @react-rxjs/core', () => {
	// @parity-case differential:bound-value
	it('bind renders current values and later emissions byte-identically', async () => {
		const d = await mountDifferential(FIXTURE, 'BoundValue', undefined, CACHE);
		await d.step('mount', () => {});
		await d.step('emit', async (octane, react) => {
			await octane.click('#next');
			await react.click('#next');
		});
		d.unmount();
	});
});
