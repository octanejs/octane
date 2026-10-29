/**
 * The same fixture runs through @octanejs/hot-toast and published
 * react-hot-toast@2.6.1. Every step compares normalized innerHTML after driving
 * identical clicks; each side owns its own toast store.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { act } from 'react';
import { drainPassiveEffects, flushSync } from 'octane';
import {
	mountDifferential,
	preloadDifferentialFixture,
} from '../../../octane/tests/differential/_rig.js';

const FIXTURE = resolve(__dirname, '../_fixtures/hot-toast-diff.tsrx');
const CACHE = resolve(__dirname, '.react-cache');

async function waitFor(condition: () => boolean, timeout = 2000): Promise<void> {
	const deadline = Date.now() + timeout;
	for (;;) {
		drainPassiveEffects();
		flushSync(() => {});
		await act(async () => {});
		if (condition()) return;
		if (Date.now() >= deadline) throw new Error('Timed out waiting for hot-toast parity state');
		await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
	}
}

// jsdom lays nothing out. Both sides measure each toast through the same stub,
// as upstream's own test setup does, so offsets and the enter/exit animations
// are computed from a real height.
const originalRect = Element.prototype.getBoundingClientRect;
beforeAll(() => {
	Element.prototype.getBoundingClientRect = () =>
		({ width: 300, height: 40, x: 0, y: 0, top: 0, left: 0, bottom: 40, right: 300 }) as DOMRect;
});
afterAll(() => {
	Element.prototype.getBoundingClientRect = originalRect;
});

await preloadDifferentialFixture(FIXTURE, CACHE);

describe('differential: @octanejs/hot-toast vs react-hot-toast@2.6.1', () => {
	// @parity-case differential:hot-toast-lifecycle
	it('matches every toast type, updates, dismissal, removal and render props', async () => {
		const differential = await mountDifferential(FIXTURE, 'HotToastDiff', {}, CACHE);
		const count = (selector: string, expected: number) => () =>
			differential.octane.findAll(selector).length === expected &&
			differential.react.findAll(selector).length === expected;
		const text = (selector: string, expected: string) => () =>
			differential.octane.find(selector).textContent === expected &&
			differential.react.find(selector).textContent === expected;
		const clickBoth = (selector: string, settled: () => boolean) =>
			differential.step(selector, async (octane, react) => {
				await octane.click(selector);
				await react.click(selector);
				await waitFor(settled);
			});
		const toasts = '[data-rht-toaster=""] > div';

		await differential.step('empty toasters and icons', () => {});
		await clickBoth('#blank', count(toasts, 1));
		await clickBoth('#success', count(toasts, 2));
		await clickBoth('#error', count(toasts, 3));
		await clickBoth('#loading', count(toasts, 4));
		await clickBoth('#resolve', text(toasts + ':first-child [role="status"]', 'Done'));
		await clickBoth('#emoji', count(toasts, 5));
		await clickBoth('#element', count('.fn', 1));
		await clickBoth('#custom', count('.custom', 1));
		await clickBoth('#promise', count(toasts, 8));
		await differential.step('promise resolves', async () => {
			await waitFor(text(toasts + ':first-child [role="status"]', 'Got ok'));
		});
		await clickBoth('#dismiss', count(toasts, 7));
		await clickBoth('#remove', count(toasts, 6));
		await clickBoth('#bar', count('.bar-toaster > div', 1));
		await clickBoth('#headless-add', count('#headless p', 1));
		await clickBoth('#dismiss-all', () => count(toasts, 0)() && count('#headless p', 0)());

		expect(differential.octane.findAll('.bar-toaster > div')).toHaveLength(0);
		differential.unmount();
	});
});
