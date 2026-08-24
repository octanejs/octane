import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mountDifferential } from '../../../octane/tests/differential/_rig.js';

const FIXTURE = resolve(__dirname, '../_fixtures/waypoint-diff.tsrx');
const CACHE = resolve(__dirname, '.react-cache');

describe('differential: @octanejs/waypoint vs react-waypoint@6.0.0', () => {
	// @parity-case differential:marker-markup
	it('matches default and custom marker markup', async () => {
		const differential = await mountDifferential(FIXTURE, 'WaypointDiff', {}, CACHE);
		await differential.step('initial mount', () => {});
		expect(differential.octane.find('span')).not.toBeNull();
		expect(differential.octane.find('#custom')?.textContent).toBe('Marker');
		differential.unmount();
	});
});
