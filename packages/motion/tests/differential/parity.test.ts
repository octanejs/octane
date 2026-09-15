import { resolve } from 'node:path';
import { describe, it } from 'vitest';
import {
	mountDifferential,
	preloadDifferentialFixture,
} from '../../../octane/tests/differential/_rig.js';

const FIXTURE = resolve(__dirname, '../_fixtures/render-diff.tsrx');
const CONFIG_FIXTURE = resolve(__dirname, '../_fixtures/config.tsrx');
const CACHE = resolve(__dirname, '.react-cache');
await Promise.all([
	preloadDifferentialFixture(FIXTURE, CACHE),
	preloadDifferentialFixture(CONFIG_FIXTURE, CACHE),
]);

describe('differential: @octanejs/motion vs motion/react', () => {
	// @parity-case differential:motion-render
	it('motion host rendering, filtered props, and child updates are byte-identical', async () => {
		const differential = await mountDifferential(FIXTURE, 'MotionCard', undefined, CACHE);
		await differential.step('mount', () => {});
		await differential.step('update child', async (octane, react) => {
			await octane.click('#toggle');
			await react.click('#toggle');
		});
		differential.unmount();
	});

	// @parity-case differential:motion-config-prop-filtering
	it('nested provider filters and live updates preserve the same public DOM and clicks', async () => {
		const differential = await mountDifferential(
			CONFIG_FIXTURE,
			'InteractiveFilterTree',
			undefined,
			CACHE,
		);
		try {
			await differential.step('scoped filters', () => {});
			await differential.step('native click', async (octane, react) => {
				await octane.click('#filtered');
				await react.click('#filtered');
			});
			await differential.step('replace filter', async (octane, react) => {
				await octane.click('#change-filter');
				await react.click('#change-filter');
			});
			await differential.step('click after replacing filter', async (octane, react) => {
				await octane.click('#filtered');
				await react.click('#filtered');
			});
		} finally {
			differential.unmount();
		}
	});
});
