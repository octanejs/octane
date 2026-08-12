/**
 * The same fixture runs through @octanejs/sonner and published sonner@2.0.7.
 * Every step compares normalized innerHTML after driving identical events.
 */
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { act } from 'react';
import { drainPassiveEffects, flushSync } from 'octane';
import {
	mountDifferential,
	preloadDifferentialFixture,
} from '../../../octane/tests/differential/_rig.js';

const FIXTURE = resolve(__dirname, '../_fixtures/sonner-diff.tsrx');
const CACHE = resolve(__dirname, '.react-cache');

async function waitFor(condition: () => boolean, timeout = 2000): Promise<void> {
	const deadline = Date.now() + timeout;
	for (;;) {
		drainPassiveEffects();
		flushSync(() => {});
		await act(async () => {});
		if (condition()) return;
		if (Date.now() >= deadline) throw new Error('Timed out waiting for Sonner parity state');
		await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
	}
}

await Promise.all([preloadDifferentialFixture(FIXTURE, CACHE)]);

describe('differential: @octanejs/sonner vs sonner@2.0.7', () => {
	// @parity-case differential:sonner-toast-lifecycle
	it('matches mount, toast creation, updates and actions', async () => {
		const differential = await mountDifferential(FIXTURE, 'SonnerDiff', { prefix: 'diff' }, CACHE);
		await differential.step('empty toaster', () => {});
		await differential.step('show toast', async (octane, react) => {
			await octane.click('#normal');
			await react.click('#normal');
			await waitFor(
				() =>
					octane.findAll('[data-sonner-toast]').length === 1 &&
					react.findAll('[data-sonner-toast]').length === 1,
			);
		});
		await differential.step('update toast', async (octane, react) => {
			await octane.click('#update');
			await react.click('#update');
			await waitFor(
				() =>
					octane.find('[data-sonner-toast]').getAttribute('data-type') === 'success' &&
					react.find('[data-sonner-toast]').getAttribute('data-type') === 'success',
			);
		});
		await differential.step('show action toast', async (octane, react) => {
			await octane.click('#action');
			await react.click('#action');
			await waitFor(
				() =>
					octane.findAll('[data-sonner-toast]').length === 2 &&
					react.findAll('[data-sonner-toast]').length === 2,
			);
		});
		await differential.step('invoke action callback', async (octane, react) => {
			await octane.click('[data-action]');
			await react.click('[data-action]');
			await waitFor(
				() =>
					octane.find('#action-count').textContent === '1' &&
					react.find('#action-count').textContent === '1' &&
					octane.findAll('[data-sonner-toast]').length === 2 &&
					react.findAll('[data-sonner-toast]').length === 2,
			);
		});

		expect(differential.octane.findAll('[data-sonner-toast]')).toHaveLength(2);
		expect(differential.octane.find('#action-count').textContent).toBe('1');
		differential.unmount();
	});
});
