import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { mountDifferential } from '../../../octane/tests/differential/_rig.js';

const CACHE = resolve(__dirname, '.react-cache');

describe('differential: @octanejs/lucide vs lucide-react@1.24.0', () => {
	it('renders named, provided, accessible, and custom icons identically', async () => {
		const fixture = resolve(__dirname, '../_fixtures/icons.tsrx');
		const differential = await mountDifferential(fixture, 'IconGallery', undefined, CACHE);
		await differential.step('mount', () => {});
		differential.unmount();
	}, 30_000);

	it('loads a dynamic icon identically', async () => {
		const fixture = resolve(__dirname, '../_fixtures/dynamic.tsrx');
		const differential = await mountDifferential(fixture, 'DynamicGallery', undefined, CACHE);
		await differential.step('fallback', () => {});
		await differential.step('loaded', async () => {
			await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
		});
		expect(differential.octane.find('svg').classList.contains('lucide')).toBe(true);
		expect(differential.octane.findAll('[data-loading]')).toHaveLength(0);
		differential.unmount();
	});
});
