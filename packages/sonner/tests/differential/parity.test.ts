/**
 * The same fixture runs through @octanejs/sonner and published sonner@2.0.7.
 * Every step compares normalized innerHTML after driving identical events.
 */
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { act } from 'react';
import { mountDifferential } from '../../../octane/tests/differential/_rig.js';

const FIXTURE = resolve(__dirname, '../_fixtures/sonner-diff.tsrx');
const CACHE = resolve(__dirname, '.react-cache');

async function settle(): Promise<void> {
	await act(async () => {
		await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
	});
}

describe('differential: @octanejs/sonner vs sonner@2.0.7', () => {
	it('matches mount, toast creation, updates and actions', async () => {
		const differential = await mountDifferential(FIXTURE, 'SonnerDiff', { prefix: 'diff' }, CACHE);
		await differential.step('empty toaster', () => {});
		await differential.step('show toast', async (octane, react) => {
			await octane.click('#normal');
			await react.click('#normal');
			await settle();
		});
		await differential.step('update toast', async (octane, react) => {
			await octane.click('#update');
			await react.click('#update');
			await settle();
		});
		await differential.step('show action toast', async (octane, react) => {
			await octane.click('#action');
			await react.click('#action');
			await settle();
		});

		expect(differential.octane.findAll('[data-sonner-toast]')).toHaveLength(2);
		differential.unmount();
	});
});
