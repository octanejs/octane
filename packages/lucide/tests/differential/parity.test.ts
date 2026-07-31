import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { mountDifferential } from '../../../octane/tests/differential/_rig.js';

const CACHE = resolve(__dirname, '.react-cache');

describe('differential: @octanejs/lucide vs lucide-react@1.24.0', () => {
	// This case is dominated by loading `@octanejs/lucide`, whose index barrels
	// ~2k generated icon modules; that cost is inherent (exports.test.ts asserts
	// the whole public surface) and Vite caches it across the project's files, so
	// narrowing THIS fixture's imports would not buy the run anything. Alone the
	// case takes seconds; inside a full run it overran even 30s purely from
	// machine contention. The budget exists to catch a hang, not to police how
	// loaded the box is.
	it('renders named, provided, accessible, and custom icons identically', async () => {
		const fixture = resolve(__dirname, '../_fixtures/icons.tsrx');
		const differential = await mountDifferential(fixture, 'IconGallery', undefined, CACHE);
		await differential.step('mount', () => {});
		differential.unmount();
	}, 60_000);

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
