import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import {
	mountDifferential,
	preloadDifferentialFixture,
} from '../../../octane/tests/differential/_rig.js';

const CACHE = resolve(__dirname, '.react-cache');
const ICONS_FIXTURE = resolve(__dirname, '../_fixtures/icons.tsrx');
const DYNAMIC_FIXTURE = resolve(__dirname, '../_fixtures/dynamic.tsrx');

await Promise.all([
	preloadDifferentialFixture(ICONS_FIXTURE, CACHE),
	preloadDifferentialFixture(DYNAMIC_FIXTURE, CACHE),
]);

describe('differential: @octanejs/lucide vs lucide-react@1.24.0', () => {
	// @parity-case differential:lucide-icons
	it('renders named, provided, accessible, and custom icons identically', async () => {
		const differential = await mountDifferential(ICONS_FIXTURE, 'IconGallery', undefined, CACHE);
		await differential.step('mount', () => {});
		differential.unmount();
	});

	// @parity-case differential:lucide-dynamic
	it('loads a dynamic icon identically', async () => {
		const differential = await mountDifferential(
			DYNAMIC_FIXTURE,
			'DynamicGallery',
			undefined,
			CACHE,
		);
		await differential.observe('start loading', () => {});
		const deadline = Date.now() + 2_000;
		while (
			(differential.octane.findAll('svg').length === 0 ||
				differential.react.findAll('svg').length === 0) &&
			Date.now() < deadline
		) {
			await differential.observe('wait for loaded icon', async () => {
				await new Promise(function (resolvePromise) {
					setTimeout(resolvePromise, 10);
				});
			});
		}
		if (
			differential.octane.findAll('svg').length === 0 ||
			differential.react.findAll('svg').length === 0
		) {
			throw new Error('Timed out waiting for dynamic icon SVG in both runtimes');
		}
		await differential.step('loaded', () => {});
		expect(differential.octane.find('svg').classList.contains('lucide')).toBe(true);
		expect(differential.octane.findAll('[data-loading]')).toHaveLength(0);
		differential.unmount();
	});
});
