import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'octane';
import { flushEffects, mount } from '../../../octane/tests/_helpers';
import {
	BatcherProbe,
	DebouncedCallbackProbe,
	DebouncedValueProbe,
	ThrottledCallbackProbe,
} from '../_fixtures/pacer.tsrx';

beforeEach(function () {
	vi.useFakeTimers();
});

afterEach(function () {
	vi.clearAllTimers();
	vi.useRealTimers();
	document.body.replaceChildren();
});

describe('adapted: @octanejs/tanstack-pacer scheduler lifecycle', () => {
	it('executes a debounced callback only after the configured delay', async function () {
		const onValue = vi.fn();
		const result = mount(DebouncedCallbackProbe, { value: 'first', onValue });
		flushEffects();

		result.click('#debounced-callback');
		await vi.advanceTimersByTimeAsync(99);
		expect(onValue).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1);
		expect(onValue).toHaveBeenCalledExactlyOnceWith('first');
		result.unmount();
	});

	it('debounces repeated calls to the latest rendered value', async function () {
		const onValue = vi.fn();
		const result = mount(DebouncedCallbackProbe, { value: 'first', onValue });
		flushEffects();

		result.click('#debounced-callback');
		result.update(DebouncedCallbackProbe, { value: 'latest', onValue });
		result.click('#debounced-callback');
		await vi.advanceTimersByTimeAsync(100);

		expect(onValue).toHaveBeenCalledExactlyOnceWith('latest');
		result.unmount();
	});

	it('renders a debounced input value only after its timer expires', async function () {
		const result = mount(DebouncedValueProbe, { value: 'first' });
		flushEffects();

		result.update(DebouncedValueProbe, { value: 'latest' });
		flushEffects();
		expect(result.find('#debounced-value').textContent).toBe('first');

		await vi.advanceTimersByTimeAsync(100);
		flushSync(function () {});

		expect(result.find('#debounced-value').textContent).toBe('latest');
		result.unmount();
	});

	it('throttles repeated callbacks through the real Pacer scheduler', async function () {
		const onValue = vi.fn();
		const result = mount(ThrottledCallbackProbe, { value: 'first', onValue });
		flushEffects();

		result.click('#throttled-callback');
		expect(onValue).toHaveBeenCalledExactlyOnceWith('first');

		result.update(ThrottledCallbackProbe, { value: 'latest', onValue });
		result.click('#throttled-callback');
		expect(onValue).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(100);
		expect(onValue).toHaveBeenCalledTimes(2);
		expect(onValue).toHaveBeenLastCalledWith('latest');
		result.unmount();
	});

	it('flushes a real batch as soon as it reaches its maximum size', function () {
		const onBatch = vi.fn();
		const result = mount(BatcherProbe, { onBatch });
		flushEffects();

		result.click('#batch-first');
		expect(onBatch).not.toHaveBeenCalled();
		result.click('#batch-second');

		expect(onBatch).toHaveBeenCalledExactlyOnceWith(['first', 'second']);
		result.unmount();
	});

	it('cancels a pending debounced callback when its component unmounts', async function () {
		const onValue = vi.fn();
		const result = mount(DebouncedCallbackProbe, { value: 'pending', onValue });
		flushEffects();

		result.click('#debounced-callback');
		result.unmount();
		await vi.advanceTimersByTimeAsync(100);

		expect(onValue).not.toHaveBeenCalled();
	});
});
