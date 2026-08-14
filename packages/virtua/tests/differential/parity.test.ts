import { resolve } from 'node:path';
import { describe, it } from 'vitest';
import {
	mountDifferential,
	preloadDifferentialFixture,
} from '../../../octane/tests/differential/_rig.js';

const fixture = resolve(__dirname, '../_fixtures/vlist-diff.tsrx');
const cache = resolve(__dirname, '.react-cache');
const settle = () => new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 60));

await preloadDifferentialFixture(fixture, cache);

describe('differential: @octanejs/virtua vs virtua', () => {
	// @parity-case differential:virtua-vlist
	it('VList initial window and count updates are byte-identical', async () => {
		const differential = await mountDifferential(fixture, 'VListParity', undefined, cache);
		await differential.step('mount', settle);
		await differential.step('shrink count', async (octane, react) => {
			await octane.click('#swap-count');
			await react.click('#swap-count');
			await settle();
		});
		await differential.step('restore count', async (octane, react) => {
			await octane.click('#swap-count');
			await react.click('#swap-count');
			await settle();
		});
		differential.unmount();
	});
});
