import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	mountDifferential,
	preloadDifferentialFixture,
} from '../../../octane/tests/differential/_rig.js';

const FIXTURE = resolve(__dirname, '../_fixtures/popper-diff.tsrx');
const CACHE = resolve(__dirname, '.react-cache');

await Promise.all([preloadDifferentialFixture(FIXTURE, CACHE)]);

describe('differential: @octanejs/popper vs react-popper@2.3.0', () => {
	// @parity-case differential:popper-components
	it('matches Manager/Reference/Popper markup, placement updates, and lifecycle', async () => {
		const differential = await mountDifferential(FIXTURE, 'PopperDiff', undefined, CACHE);
		await differential.step('initial positioning', () => {});
		expect(differential.octane.find('#popper').getAttribute('data-placement')).toBe('top');
		await differential.step('placement update', async (octane, react) => {
			await octane.click('#toggle');
			await react.click('#toggle');
		});
		expect(differential.octane.find('#popper').getAttribute('data-placement')).toBe('bottom');
		await differential.step('unmount popper', async (octane, react) => {
			await octane.click('#visible');
			await react.click('#visible');
		});
		expect(differential.octane.container.querySelector('#popper')).toBeNull();
		differential.unmount();
	});
});
