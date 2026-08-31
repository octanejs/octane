/**
 * The same fixture runs through @octanejs/thinking-orbs and thinking-orbs@0.2.0.
 */
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { mountDifferential } from '../../../octane/tests/differential/_rig.js';

const FIXTURE = resolve(__dirname, '../_fixtures/thinking-orbs-diff.tsrx');
const CACHE = resolve(__dirname, '.react-cache');

describe('differential: @octanejs/thinking-orbs vs thinking-orbs@0.2.0', () => {
	it('matches mount markup for avatar and inline presets', async () => {
		const differential = await mountDifferential(
			FIXTURE,
			'ThinkingOrbsDiff',
			{ prefix: 'diff' },
			CACHE,
		);
		await differential.step('initial mount', () => {});
		expect(differential.octane.find('#working')).not.toBeNull();
		expect(differential.octane.find('#inline')).not.toBeNull();
		differential.unmount();
	});
});
