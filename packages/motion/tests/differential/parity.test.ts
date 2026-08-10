import { resolve } from 'node:path';
import { describe, it } from 'vitest';
import { mountDifferential } from '../../../octane/tests/differential/_rig.js';

const FIXTURE = resolve(__dirname, '../_fixtures/render-diff.tsrx');
const CACHE = resolve(__dirname, '.react-cache');
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
});
