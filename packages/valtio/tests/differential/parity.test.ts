import { describe, it } from 'vitest';
import { resolve } from 'node:path';
import { mountDifferential } from '../../../octane/tests/differential/_rig.js';

const fixture = resolve(__dirname, '../_fixtures/store.tsrx');
const cache = resolve(__dirname, '.react-cache');

describe('differential: @octanejs/valtio vs valtio', () => {
	// @parity-case differential:valtio-snapshot
	it('renders and updates accessed snapshot paths identically', async () => {
		const differential = await mountDifferential(fixture, 'DifferentialCounter', undefined, cache);
		await differential.step('mount', () => {});
		await differential.step('increment', async (octane, react) => {
			await octane.click('#increment');
			await react.click('#increment');
		});
		differential.unmount();
	});

	// @parity-case differential:valtio-use-proxy
	it('reads snapshots and mutates the source proxy identically through useProxy', async () => {
		const differential = await mountDifferential(
			fixture,
			'DifferentialMutableProxy',
			undefined,
			cache,
		);
		await differential.step('mount', () => {});
		await differential.step('increment', async (octane, react) => {
			await octane.click('#proxy-count');
			await react.click('#proxy-count');
		});
		differential.unmount();
	});
});
