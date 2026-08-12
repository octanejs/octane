import { describe, it } from 'vitest';
import { resolve } from 'node:path';
import {
	mountDifferential,
	preloadDifferentialFixture,
} from '../../../octane/tests/differential/_rig.js';

const fixture = resolve(__dirname, '../_fixtures/app.tsrx');
const cache = resolve(__dirname, '.react-cache');

await Promise.all([preloadDifferentialFixture(fixture, cache)]);

describe('differential: @octanejs/react-error-boundary vs real react-error-boundary', () => {
	// @parity-case differential:react-error-boundary-reset
	it('imperative reset: fallback → content renders byte-identical', async () => {
		const differential = await mountDifferential(fixture, 'LocalResetApp', undefined, cache);
		await differential.step('fallback', () => {});
		await differential.step('reset', async (octane, react) => {
			await octane.click('#local-reset');
			await react.click('#local-reset');
		});
		differential.unmount();
	});
});
