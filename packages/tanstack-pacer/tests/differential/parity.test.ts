import { resolve } from 'node:path';
import { act as reactAct } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { drainPassiveEffects } from 'octane';
import {
	mountDifferential,
	preloadDifferentialFixture,
} from '../../../octane/tests/differential/_rig.js';

const fixture = resolve(__dirname, '../_fixtures/pacer-diff.tsrx');
const cache = resolve(__dirname, '.react-cache');

async function advanceWait(ms: number): Promise<void> {
	await vi.advanceTimersByTimeAsync(ms);
}

async function flushBothRuntimes(): Promise<void> {
	drainPassiveEffects();
	await reactAct(async function () {
		const wait = new Promise<void>(function (resolveWait) {
			setTimeout(resolveWait, 0);
		});
		await vi.advanceTimersByTimeAsync(0);
		await wait;
	});
}

beforeEach(function () {
	vi.useFakeTimers();
});

afterEach(function () {
	vi.clearAllTimers();
	vi.useRealTimers();
});

await Promise.all([preloadDifferentialFixture(fixture, cache)]);

describe('differential: @octanejs/tanstack-pacer vs @tanstack/react-pacer', () => {
	// @parity-case differential:tanstack-pacer-scheduler-lifecycle
	it('matches debounce, throttle, batch, and teardown behavior', async function () {
		const onPending = vi.fn();
		const differential = await mountDifferential(fixture, 'PacerParity', { onPending }, cache);
		await differential.step('mount', function () {});
		await differential.step('schedule debounce', async function (octane, react) {
			await octane.click('#debounce');
			await react.click('#debounce');
			expect(octane.find('#debounced').textContent).toBe('debounced:0');
			expect(react.find('#debounced').textContent).toBe('debounced:0');
		});
		await differential.step('debounce expires', async function (octane, react) {
			await advanceWait(40);
			await flushBothRuntimes();
			expect(octane.find('#debounced').textContent).toBe('debounced:1');
			expect(react.find('#debounced').textContent).toBe('debounced:1');
		});
		await differential.step('leading throttle', async function (octane, react) {
			await octane.click('#throttle');
			await react.click('#throttle');
			expect(octane.find('#throttled').textContent).toBe('throttled:1');
			expect(react.find('#throttled').textContent).toBe('throttled:1');
		});
		await differential.step('trailing throttle', async function (octane, react) {
			await octane.click('#throttle');
			await react.click('#throttle');
			expect(octane.find('#throttled').textContent).toBe('throttled:1');
			expect(react.find('#throttled').textContent).toBe('throttled:1');
			await advanceWait(40);
			await flushBothRuntimes();
			expect(octane.find('#throttled').textContent).toBe('throttled:2');
			expect(react.find('#throttled').textContent).toBe('throttled:2');
		});
		await differential.step('first batch item', async function (octane, react) {
			await octane.click('#batch-a');
			await react.click('#batch-a');
			expect(octane.find('#batch').textContent).toBe('batch:');
			expect(react.find('#batch').textContent).toBe('batch:');
		});
		await differential.step('batch reaches maximum size', async function (octane, react) {
			await octane.click('#batch-b');
			await react.click('#batch-b');
			expect(octane.find('#batch').textContent).toBe('batch:a,b');
			expect(react.find('#batch').textContent).toBe('batch:a,b');
		});
		await differential.step('schedule work before teardown', async function (octane, react) {
			await octane.click('#pending');
			await react.click('#pending');
		});
		differential.unmount();
		await advanceWait(40);
		expect(onPending).not.toHaveBeenCalled();
	});

	// @parity-case differential:tanstack-pacer-latest-prop-and-value
	it('matches latest-prop debounce/throttle and useDebouncedValue', async function () {
		const differential = await mountDifferential(fixture, 'PacerParity', {}, cache);
		await differential.step('mount', function () {});
		await differential.step('debounce keeps only the latest label', async function (octane, react) {
			await octane.click('#debounce-label');
			await react.click('#debounce-label');
			await octane.click('#set-latest');
			await react.click('#set-latest');
			await flushBothRuntimes();
			await octane.click('#debounce-label');
			await react.click('#debounce-label');
			await advanceWait(40);
			await flushBothRuntimes();
			expect(octane.find('#debounced-label').textContent).toBe('debounced-label:latest');
			expect(react.find('#debounced-label').textContent).toBe('debounced-label:latest');
			expect(octane.find('#debounced-value').textContent).toBe('debounced-value:latest');
			expect(react.find('#debounced-value').textContent).toBe('debounced-value:latest');
		});
		await differential.step(
			'throttle leading first then trailing latest',
			async function (octane, react) {
				await advanceWait(40);
				await flushBothRuntimes();
				await octane.click('#set-first');
				await react.click('#set-first');
				await flushBothRuntimes();
				await octane.click('#throttle-label');
				await react.click('#throttle-label');
				expect(octane.find('#throttled-label').textContent).toBe('throttled-label:first');
				expect(react.find('#throttled-label').textContent).toBe('throttled-label:first');
				await octane.click('#set-latest');
				await react.click('#set-latest');
				await flushBothRuntimes();
				await octane.click('#throttle-label');
				await react.click('#throttle-label');
				expect(octane.find('#throttled-label').textContent).toBe('throttled-label:first');
				expect(react.find('#throttled-label').textContent).toBe('throttled-label:first');
				await advanceWait(40);
				await flushBothRuntimes();
				expect(octane.find('#throttled-label').textContent).toBe('throttled-label:latest');
				expect(react.find('#throttled-label').textContent).toBe('throttled-label:latest');
			},
		);
		await differential.step(
			'useDebouncedValue lags then catches label',
			async function (octane, react) {
				await octane.click('#set-first');
				await react.click('#set-first');
				await flushBothRuntimes();
				await advanceWait(40);
				await flushBothRuntimes();
				expect(octane.find('#debounced-value').textContent).toBe('debounced-value:first');
				expect(react.find('#debounced-value').textContent).toBe('debounced-value:first');
				await octane.click('#set-latest');
				await react.click('#set-latest');
				await flushBothRuntimes();
				expect(octane.find('#label').textContent).toBe('label:latest');
				expect(react.find('#label').textContent).toBe('label:latest');
				expect(octane.find('#debounced-value').textContent).toBe('debounced-value:first');
				expect(react.find('#debounced-value').textContent).toBe('debounced-value:first');
				await advanceWait(40);
				await flushBothRuntimes();
				expect(octane.find('#debounced-value').textContent).toBe('debounced-value:latest');
				expect(react.find('#debounced-value').textContent).toBe('debounced-value:latest');
			},
		);
		differential.unmount();
	});
});
