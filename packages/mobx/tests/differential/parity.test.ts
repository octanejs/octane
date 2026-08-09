import { describe, it } from 'vitest';
import { resolve } from 'node:path';
import { mountDifferential } from '../../../octane/tests/differential/_rig.js';
const fixture = resolve(__dirname, '../_fixtures/store.tsrx');
const cache = resolve(__dirname, '.react-cache');
describe('differential: @octanejs/mobx vs real mobx-react-lite', () => {
	// @parity-case differential:local-observable
	it('observer and useLocalObservable render action updates identically', async () => {
		const mounted = await mountDifferential(fixture, 'LocalObservable', undefined, cache);
		await mounted.step('mount', () => {});
		await mounted.step('increment', async (octane, react) => {
			await octane.click('#local');
			await react.click('#local');
		});
		mounted.unmount();
	});
});
