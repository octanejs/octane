import { afterEach, describe, expect, it, vi } from 'vitest';
import { drainPassiveEffects, flushSync } from 'octane';
import { mount } from '../../../octane/tests/_helpers';
import { DragFixture, MeasureLifecycleFixture } from '../_fixtures/behavior.tsrx';

const mounted: Array<ReturnType<typeof mount>> = [];

function render(body, props?) {
	const result = mount(body, props);
	mounted.push(result);
	return result;
}

afterEach(() => {
	while (mounted.length > 0) mounted.pop()?.unmount();
	vi.restoreAllMocks();
});

describe('@octanejs/visx stateful behavior', () => {
	it('drives Drag with native pointer events and applies restrictions', () => {
		const view = render(DragFixture);
		const target = view.find('#drag-target');
		vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 160, 100));

		flushSync(() =>
			target.dispatchEvent(
				new MouseEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10 }),
			),
		);
		flushSync(() =>
			target.dispatchEvent(
				new MouseEvent('pointermove', { bubbles: true, clientX: 130, clientY: 90 }),
			),
		);
		expect(target.getAttribute('data-native')).toBe('true');
		expect(Number(target.getAttribute('data-dx'))).toBeLessThanOrEqual(100);
		expect(Number(target.getAttribute('data-dy'))).toBeLessThanOrEqual(80);

		flushSync(() => target.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })));
		expect(target.getAttribute('data-dragging')).toBe('false');
	});

	it('rebinds measurement observers and listeners when its ref target remounts', () => {
		vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
			callback(0);
			return 1;
		});
		const addEventListener = vi.spyOn(window, 'addEventListener');
		const removeEventListener = vi.spyOn(window, 'removeEventListener');
		const observers = [];
		class ResizeObserverImpl {
			callback;
			observe = vi.fn();
			disconnect = vi.fn();

			constructor(callback) {
				this.callback = callback;
				observers.push(this);
			}
		}

		const view = render(MeasureLifecycleFixture, { ResizeObserverImpl });
		const firstTarget = view.find('#measure-target');
		expect(observers).toHaveLength(1);
		expect(observers[0].observe).toHaveBeenCalledWith(firstTarget);
		const resizeHandler = addEventListener.mock.calls.find(([type]) => type === 'resize')?.[1];
		const scrollHandler = addEventListener.mock.calls.find(([type]) => type === 'scroll')?.[1];

		flushSync(() =>
			view.find('#toggle-measure-target').dispatchEvent(new MouseEvent('click', { bubbles: true })),
		);
		expect(observers[0].disconnect).toHaveBeenCalledOnce();
		expect(removeEventListener).toHaveBeenCalledWith('resize', resizeHandler);
		expect(removeEventListener).toHaveBeenCalledWith('scroll', scrollHandler, true);

		flushSync(() =>
			view.find('#toggle-measure-target').dispatchEvent(new MouseEvent('click', { bubbles: true })),
		);
		const secondTarget = view.find('#measure-target');
		expect(secondTarget).not.toBe(firstTarget);
		expect(observers).toHaveLength(2);
		expect(observers[1].observe).toHaveBeenCalledWith(secondTarget);

		vi.spyOn(secondTarget, 'getBoundingClientRect').mockReturnValue(new DOMRect(5, 7, 123, 45));
		flushSync(() => observers[1].callback([], observers[1]));
		expect(view.find('#measure-width').textContent).toBe('123');
	});
});
