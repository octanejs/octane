import { describe, it } from 'vitest';
import { resolve } from 'node:path';
import {
	mountDifferential,
	preloadDifferentialFixture,
} from '../../../octane/tests/differential/_rig.js';

const fixture = resolve(__dirname, '../_fixtures/differential/parity.tsrx');
const cache = resolve(__dirname, '.react-cache');

await Promise.all([preloadDifferentialFixture(fixture, cache)]);

describe('differential: @octanejs/tanstack-store vs @tanstack/react-store', () => {
	// @parity-case differential:tanstack-store-public-contract
	it('updates selectors, atoms, created stores, actions, and context identically', async () => {
		const differential = await mountDifferential(fixture, 'StoreParity', undefined, cache);

		await differential.step('mount', () => {});
		await differential.step('update selected store state', async (octane, react) => {
			await octane.click('#store');
			await react.click('#store');
		});
		await differential.step('update ignored store state', async (octane, react) => {
			await octane.click('#ignored');
			await react.click('#ignored');
		});
		await differential.step('write the external atom', async (octane, react) => {
			await octane.click('#atom');
			await react.click('#atom');
		});
		await differential.step('write the component atom', async (octane, react) => {
			await octane.click('#local-atom');
			await react.click('#local-atom');
		});
		await differential.step('run a component store action', async (octane, react) => {
			await octane.click('#local-store');
			await react.click('#local-store');
		});
		differential.unmount();
	});
});
