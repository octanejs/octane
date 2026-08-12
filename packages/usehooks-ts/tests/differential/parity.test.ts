import { describe, it } from 'vitest';
import { resolve } from 'node:path';
import {
	mountDifferential,
	preloadDifferentialFixture,
} from '../../../octane/tests/differential/_rig.js';

const fixture = resolve(__dirname, '../_fixtures/hooks.tsrx');
const cache = resolve(__dirname, '.react-cache');

await Promise.all([preloadDifferentialFixture(fixture, cache)]);

describe('differential: @octanejs/usehooks-ts vs real usehooks-ts', () => {
	// @parity-case differential:state-hooks
	it('state hooks render the same interaction sequence', async () => {
		const mounted = await mountDifferential(fixture, 'StateProbe', undefined, cache);
		await mounted.step('mount', () => {});
		for (const selector of ['#first', '#second', '#increment', '#toggle', '#map', '#next']) {
			await mounted.step(selector, async (octane, react) => {
				await octane.click(selector);
				await react.click(selector);
			});
		}
		mounted.unmount();
	});
});
