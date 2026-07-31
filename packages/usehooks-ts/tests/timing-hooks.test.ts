import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, flushEffects, mount } from '../../octane/tests/_helpers';
import {
	DebounceControlsProbe,
	DebounceValueProbe,
	DisabledTimersProbe,
	IsMountedProbe,
	MissingDebounceDelayProbe,
	TimingProbe,
} from './_fixtures/hooks.tsrx';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
	vi.useRealTimers();
	document.body.replaceChildren();
});

describe('timing and lifecycle hooks', () => {
	it('disables null timers while allowing a zero-delay timeout', () => {
		const callbacks = {
			onInterval: vi.fn(),
			onNullTimeout: vi.fn(),
			onZeroTimeout: vi.fn(),
		};
		mount(DisabledTimersProbe, callbacks);
		flushEffects();
		vi.advanceTimersByTime(0);
		expect(callbacks.onInterval).not.toHaveBeenCalled();
		expect(callbacks.onNullTimeout).not.toHaveBeenCalled();
		expect(callbacks.onZeroTimeout).toHaveBeenCalledOnce();
	});

	it('reports false during render, true after passive effects, and false after unmount', () => {
		let isMounted: (() => boolean) | undefined;
		const result = mount(IsMountedProbe, {
			onReady(probe) {
				isMounted = probe;
			},
		});
		expect(result.find('p').dataset.mountedDuringRender).toBe('no');
		expect(isMounted?.()).toBe(false);
		flushEffects();
		expect(isMounted?.()).toBe(true);
		result.unmount();
		flushEffects();
		expect(isMounted?.()).toBe(false);
	});

	it('runs current callbacks and cancels timers and debounce work on unmount', () => {
		const callbacks = {
			onDebounce: vi.fn(),
			onInterval: vi.fn(),
			onTimeout: vi.fn(),
			onUnmount: vi.fn(),
		};
		const result = mount(TimingProbe, callbacks);
		flushEffects();
		result.click('#debounce');
		vi.advanceTimersByTime(40);
		expect(callbacks.onInterval).toHaveBeenCalledTimes(2);
		expect(callbacks.onTimeout).toHaveBeenCalledTimes(1);
		expect(callbacks.onDebounce).not.toHaveBeenCalled();
		result.unmount();
		flushEffects();
		vi.advanceTimersByTime(100);
		expect(callbacks.onDebounce).not.toHaveBeenCalled();
		expect(callbacks.onInterval).toHaveBeenCalledTimes(2);
		expect(callbacks.onUnmount).toHaveBeenCalledTimes(1);
	});

	it('cancels debounce work when unmounted before passive effects run', () => {
		const callbacks = {
			onDebounce: vi.fn(),
			onInterval: vi.fn(),
			onTimeout: vi.fn(),
			onUnmount: vi.fn(),
		};
		const result = mount(TimingProbe, callbacks);
		result.click('#debounce');
		result.unmount();
		vi.advanceTimersByTime(100);
		expect(callbacks.onDebounce).not.toHaveBeenCalled();
	});

	it('reports queued work and clears it on cancel, flush, and invocation', () => {
		const onDebounce = vi.fn();
		const onPending = vi.fn();
		const result = mount(DebounceControlsProbe, { onDebounce, onPending });

		result.click('#pending');
		result.click('#queue');
		result.click('#pending');
		expect(onPending.mock.calls.map(([pending]) => pending)).toEqual([false, true]);

		result.click('#cancel');
		result.click('#pending');
		vi.advanceTimersByTime(100);
		expect(onDebounce).not.toHaveBeenCalled();

		result.click('#queue');
		result.click('#flush');
		result.click('#pending');
		expect(onDebounce).toHaveBeenCalledOnce();
		expect(onDebounce).toHaveBeenLastCalledWith('queued');

		result.click('#queue');
		vi.advanceTimersByTime(50);
		result.click('#pending');
		expect(onDebounce).toHaveBeenCalledTimes(2);
		expect(onPending.mock.calls.map(([pending]) => pending)).toEqual([
			false,
			true,
			false,
			false,
			false,
		]);
	});

	it('clears pending state after a leading-only debounce cooldown', () => {
		const onDebounce = vi.fn();
		const onPending = vi.fn();
		const result = mount(DebounceControlsProbe, {
			onDebounce,
			onPending,
			options: { leading: true, trailing: false },
		});
		result.click('#queue');
		result.click('#queue');
		result.click('#pending');
		expect(onPending).toHaveBeenLastCalledWith(true);
		vi.advanceTimersByTime(50);
		result.click('#pending');
		expect(onPending).toHaveBeenLastCalledWith(false);
		expect(onDebounce).toHaveBeenCalledOnce();
	});

	it('preserves queued work across equivalent debounce option forms', () => {
		const onDebounce = vi.fn();
		const onPending = vi.fn();
		const result = mount(DebounceControlsProbe, { onDebounce, onPending });

		result.click('#queue');
		result.update(DebounceControlsProbe, {
			onDebounce,
			onPending,
			options: { leading: false, trailing: true },
		});
		vi.advanceTimersByTime(50);

		expect(onDebounce).toHaveBeenCalledOnce();
		expect(onDebounce).toHaveBeenLastCalledWith('queued');
	});

	it('uses strict equality by default for NaN and signed zero', () => {
		const onPending = vi.fn();
		const result = mount(DebounceValueProbe, { value: Number.NaN, onPending });
		result.update(DebounceValueProbe, { value: Number.NaN, onPending });
		result.click('#pending');
		expect(onPending).toHaveBeenLastCalledWith(true);

		const signedZero = mount(DebounceValueProbe, { value: 0, onPending });
		signedZero.update(DebounceValueProbe, { value: -0, onPending });
		signedZero.click('#pending');
		expect(onPending).toHaveBeenLastCalledWith(false);
	});

	it('rejects an omitted debounce value delay after removing the compiler slot', () => {
		expect(() => mount(MissingDebounceDelayProbe)).toThrow('delay is required');
	});

	it('honors a custom debounce value equality function while mounted', async () => {
		const onPending = vi.fn();
		const result = mount(DebounceValueProbe, {
			value: Number.NaN,
			equalityFn: Object.is,
			onPending,
		});
		result.update(DebounceValueProbe, {
			value: Number.NaN,
			equalityFn: Object.is,
			onPending,
		});
		result.click('#pending');
		expect(onPending).toHaveBeenLastCalledWith(false);

		result.update(DebounceValueProbe, { value: 0, equalityFn: Object.is, onPending });
		await act(() => vi.advanceTimersByTime(50));
		expect(result.find('#value').textContent).toBe('0');
		result.update(DebounceValueProbe, { value: -0, equalityFn: Object.is, onPending });
		result.click('#pending');
		expect(onPending).toHaveBeenLastCalledWith(true);
		await act(() => vi.advanceTimersByTime(50));
		expect(result.find('#value').textContent).toBe('-0');
	});

	it('preserves pending value updates across equivalent inline options', async () => {
		const onPending = vi.fn();
		const result = mount(DebounceValueProbe, { value: 0, onPending });
		result.update(DebounceValueProbe, { value: 1, onPending });
		result.update(DebounceValueProbe, { value: 1, onPending });

		result.click('#pending');
		expect(onPending).toHaveBeenLastCalledWith(true);
		await act(() => vi.advanceTimersByTime(50));
		expect(result.find('#value').textContent).toBe('1');
	});
});
