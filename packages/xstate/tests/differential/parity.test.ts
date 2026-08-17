import { describe, it } from 'vitest';
import { resolve } from 'node:path';
import { mountDifferential } from '../../../octane/tests/differential/_rig.js';

const fixture = resolve(__dirname, '../_fixtures/parity.tsrx');
const cache = resolve(__dirname, '.react-cache');

describe('differential: @octanejs/xstate vs @xstate/react', () => {
	it('runs machines and actor contexts with byte-identical output', async () => {
		const differential = await mountDifferential(fixture, 'XStateParity', undefined, cache);

		await differential.step('mount', () => {});
		await differential.step('increment local actor', async (octane, react) => {
			await octane.click('#increment');
			await react.click('#increment');
		});
		await differential.step('increment context actor', async (octane, react) => {
			await octane.click('#context-increment');
			await react.click('#context-increment');
		});
		await differential.step('reset local actor', async (octane, react) => {
			await octane.click('#reset');
			await react.click('#reset');
		});
		differential.unmount();
	});
});
