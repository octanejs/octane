import { describe, it } from 'vitest';
import { resolve } from 'node:path';
import {
	mountDifferential,
	preloadDifferentialFixture,
} from '../../../octane/tests/differential/_rig.js';
const fixture = resolve(__dirname, '../_fixtures/state-hooks.tsrx');
const cache = resolve(__dirname, '.react-cache');
await Promise.all([preloadDifferentialFixture(fixture, cache)]);

describe('differential: @octanejs/mantine-hooks vs real @mantine/hooks', () => {
	// @parity-case differential:state-hooks
	it('counter, disclosure, and list state render the same interaction sequence', async () => {
		const mounted = await mountDifferential(fixture, 'StateHooks', undefined, cache);
		await mounted.step('mount', () => {});
		for (const selector of ['#increment', '#increment', '#open', '#append']) {
			await mounted.step(selector, async (octane, react) => {
				await octane.click(selector);
				await react.click(selector);
			});
		}
		mounted.unmount();
	});
});
