import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushEffects, mount } from '../../octane/tests/_helpers';
import {
	destroyIntersectionMocking,
	intersectionMockInstance,
	mockAllIsIntersecting,
	mockIsIntersecting,
	setupIntersectionMocking,
} from '../src/test-utils';
import { defaultFallbackInView, observe } from '../src/observe';
import {
	ComponentProbe,
	EffectPoolProbe,
	EffectProbe,
	EffectStaleCleanupProbe,
	EffectSwapProbe,
	HookProbe,
	HookSwapProbe,
	PlainInViewProbe,
} from './_fixtures/probes.tsrx';

beforeEach(() => setupIntersectionMocking(vi.fn));
afterEach(() => {
	destroyIntersectionMocking();
	document.body.replaceChildren();
});

describe('observe', () => {
	it('pools matching options and disconnects after the final subscriber', () => {
		const first = document.createElement('div');
		const second = document.createElement('div');
		const stopFirst = observe(first, vi.fn(), { threshold: 0.5 });
		const stopSecond = observe(second, vi.fn(), { threshold: 0.5 });
		const observer = intersectionMockInstance(first);
		expect(intersectionMockInstance(second)).toBe(observer);
		stopFirst();
		expect(observer.unobserve).toHaveBeenCalledWith(first);
		expect(observer.disconnect).not.toHaveBeenCalled();
		stopSecond();
		expect(observer.disconnect).toHaveBeenCalledOnce();
	});

	it('keeps distinct observers registered for the same element', () => {
		const target = document.createElement('div');
		const first = vi.fn();
		const second = vi.fn();
		const stopFirst = observe(target, first, { threshold: 0.25 });
		const stopSecond = observe(target, second, { threshold: 0.75 });

		mockIsIntersecting(target, true);
		expect(first).toHaveBeenCalledOnce();
		expect(second).toHaveBeenCalledOnce();

		stopFirst();
		mockIsIntersecting(target, true);
		expect(first).toHaveBeenCalledOnce();
		expect(second).toHaveBeenCalledTimes(2);
		stopSecond();
	});

	it('derives mock intersection state from each observer threshold', () => {
		const target = document.createElement('div');
		const callback = vi.fn();
		const stop = observe(target, callback, { threshold: 0.75 });

		mockIsIntersecting(target, 0.25);
		expect(callback).toHaveBeenLastCalledWith(
			false,
			expect.objectContaining({ isIntersecting: false, intersectionRatio: 0 }),
		);
		mockIsIntersecting(target, 0.8);
		expect(callback).toHaveBeenLastCalledWith(
			true,
			expect.objectContaining({ isIntersecting: true, intersectionRatio: 0.75 }),
		);
		stop();
	});
});

describe('Octane binding', () => {
	it('updates useInView and skips the initial false notification', () => {
		const onChange = vi.fn();
		const result = mount(HookProbe, { onChange });
		flushEffects();
		const target = result.find('[data-testid="target"]');
		expect(target.textContent).toBe('hidden');
		mockIsIntersecting(target, false);
		expect(onChange).not.toHaveBeenCalled();
		mockIsIntersecting(target, false);
		expect(onChange).toHaveBeenCalledWith(false, expect.objectContaining({ target }));
		onChange.mockClear();
		mockIsIntersecting(target, true);
		expect(target.textContent).toBe('visible');
		expect(target.getAttribute('data-entry')).toBe('yes');
		expect(onChange).toHaveBeenCalledWith(true, expect.objectContaining({ target }));
		result.unmount();
	});

	it('stops observing after triggerOnce enters', () => {
		const result = mount(HookProbe, { triggerOnce: true });
		flushEffects();
		const target = result.find('[data-testid="target"]');
		const observer = intersectionMockInstance(target);
		mockIsIntersecting(target, true);
		expect(observer.unobserve).toHaveBeenCalledWith(target);
		expect(target.textContent).toBe('visible');
		result.unmount();
	});

	it('runs useOnInView without a visibility rerender contract', () => {
		const onChange = vi.fn();
		const result = mount(EffectProbe, { onChange });
		const target = result.find('[data-testid="effect"]');
		mockIsIntersecting(target, true);
		expect(onChange).toHaveBeenCalledOnce();
		result.unmount();
	});

	it('only suppresses the first false useOnInView notification', () => {
		const onChange = vi.fn();
		const result = mount(EffectProbe, { onChange });
		const target = result.find('[data-testid="effect"]');
		mockIsIntersecting(target, false);
		expect(onChange).not.toHaveBeenCalled();
		mockIsIntersecting(target, false);
		expect(onChange).toHaveBeenCalledWith(false, expect.objectContaining({ target }));
		result.unmount();
	});

	it('resets useOnInView initial-false suppression when the target changes', () => {
		const onChange = vi.fn();
		const result = mount(EffectSwapProbe, { alternate: false, onChange });
		const initial = result.find('[data-testid="effect-swap"]');
		mockIsIntersecting(initial, false);
		expect(onChange).not.toHaveBeenCalled();

		result.update(EffectSwapProbe, { alternate: true, onChange });
		const alternate = result.find('[data-testid="effect-swap"]');
		mockIsIntersecting(alternate, false);
		expect(onChange).not.toHaveBeenCalled();
		result.unmount();
	});

	it('keeps triggerOnce observing until the threshold-aware inView state is true', () => {
		const result = mount(EffectProbe, {
			onChange: vi.fn(),
			threshold: 0.75,
			triggerOnce: true,
		});
		const target = result.find('[data-testid="effect"]');
		const observer = intersectionMockInstance(target);
		mockIsIntersecting(target, 0.25);
		expect(observer.unobserve).not.toHaveBeenCalled();
		mockIsIntersecting(target, 0.75);
		expect(observer.unobserve).toHaveBeenCalledWith(target);
		result.unmount();
	});

	it('resets useInView initial-false suppression when the target changes', () => {
		const onChange = vi.fn();
		const result = mount(HookSwapProbe, { alternate: false, onChange });
		flushEffects();
		const initial = result.find('[data-testid="hook-swap"]');
		mockIsIntersecting(initial, false);
		expect(onChange).not.toHaveBeenCalled();

		result.update(HookSwapProbe, { alternate: true, onChange });
		flushEffects();
		const alternate = result.find('[data-testid="hook-swap"]');
		mockIsIntersecting(alternate, false);
		expect(onChange).not.toHaveBeenCalled();
		result.unmount();
	});

	it('uses the latest useOnInView callback immediately after a render', () => {
		const first = vi.fn();
		const second = vi.fn();
		const result = mount(EffectProbe, { onChange: first });
		const target = result.find('[data-testid="effect"]');
		result.update(EffectProbe, { onChange: second });
		mockIsIntersecting(target, true);
		expect(first).not.toHaveBeenCalled();
		expect(second).toHaveBeenCalledOnce();
		result.unmount();
	});

	it('pools useOnInView observers regardless of library-only flags', () => {
		const result = mount(EffectPoolProbe);
		const first = result.find('[data-testid="effect-first"]');
		const second = result.find('[data-testid="effect-second"]');
		expect(intersectionMockInstance(second)).toBe(intersectionMockInstance(first));
		result.unmount();
	});

	it('notifies each pooled observer subscriber once in mockAllIsIntersecting', () => {
		const onFirst = vi.fn();
		const onSecond = vi.fn();
		const result = mount(EffectPoolProbe, { onFirst, onSecond });

		mockAllIsIntersecting(true);

		expect(onFirst).toHaveBeenCalledOnce();
		expect(onSecond).toHaveBeenCalledOnce();
		result.unmount();
	});

	it('supports the InView render-prop form and ref', () => {
		const result = mount(ComponentProbe);
		flushEffects();
		const target = result.find('[data-testid="component"]');
		expect(target.tagName).toBe('SECTION');
		expect(target.textContent).toBe('outside');
		mockIsIntersecting(target, true);
		expect(target.textContent).toBe('inside');
		result.unmount();
	});

	it('keeps a stable composed host ref across InView visibility updates', () => {
		const onChange = vi.fn();
		const hostRef = vi.fn();
		const result = mount(PlainInViewProbe, {
			onChange,
			hostRef,
		});
		flushEffects();
		const target = result.find('[data-testid="plain-inview"]');
		expect(hostRef).toHaveBeenCalledWith(target);

		mockIsIntersecting(target, true);
		mockIsIntersecting(target, false);
		mockIsIntersecting(target, true);
		expect(
			onChange.mock.calls.map(function (call) {
				return call[0];
			}),
		).toEqual([true, false, true]);
		expect(
			hostRef.mock.calls.filter(function (call) {
				return call[0] == null;
			}),
		).toHaveLength(0);
		result.unmount();
	});

	it('keeps useOnInView observation when a stale cleanup runs after re-attach', () => {
		const onChange = vi.fn();
		let attach: ((node: Element | null) => void | (() => void)) | undefined;
		const result = mount(EffectStaleCleanupProbe, {
			onChange,
			onReady(next) {
				attach = next;
			},
		});
		expect(attach).toBeTypeOf('function');
		const first = document.createElement('div');
		const second = document.createElement('div');
		const staleCleanup = attach!(first);
		const activeCleanup = attach!(second);
		expect(staleCleanup).not.toBe(activeCleanup);
		staleCleanup?.();
		mockIsIntersecting(second, true);
		expect(onChange).toHaveBeenCalledOnce();
		activeCleanup?.();
		result.unmount();
	});

	it('does not re-arm useOnInView initial-false skip on same-target reattach', () => {
		const onChange = vi.fn();
		let attach: ((node: Element | null) => void | (() => void)) | undefined;
		const result = mount(EffectStaleCleanupProbe, {
			onChange,
			onReady(next) {
				attach = next;
			},
		});
		const target = document.createElement('div');
		const cleanup = attach!(target);
		mockIsIntersecting(target, false);
		expect(onChange).not.toHaveBeenCalled();
		mockIsIntersecting(target, false);
		expect(onChange).toHaveBeenCalledWith(false, expect.objectContaining({ target }));
		onChange.mockClear();
		attach!(target);
		mockIsIntersecting(target, false);
		expect(onChange).toHaveBeenCalledWith(false, expect.objectContaining({ target }));
		cleanup?.();
		result.unmount();
	});

	it('survives sync defaultFallbackInView with triggerOnce without TDZ', () => {
		const original = window.IntersectionObserver;
		// @ts-expect-error intentional unsupported environment
		delete window.IntersectionObserver;
		defaultFallbackInView(true);
		try {
			const onChange = vi.fn();
			const result = mount(EffectProbe, {
				onChange,
				triggerOnce: true,
			});
			expect(onChange).toHaveBeenCalledOnce();
			expect(onChange).toHaveBeenCalledWith(true, expect.anything());
			result.unmount();
		} finally {
			defaultFallbackInView(undefined);
			window.IntersectionObserver = original;
		}
	});
});
