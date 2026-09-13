import { expect, it, vi } from 'vitest';
import type { AnimationScope, createScopedAnimate } from 'motion';
import { mount, nextPaint } from '../_helpers';
import { AnimateBox } from '../_fixtures/animate.tsrx';

it('animates through the real scoped engine, releases finished controls, and stops on unmount', async () => {
	let scope!: AnimationScope;
	let animate!: ReturnType<typeof createScopedAnimate>;
	const r = mount(AnimateBox, {
		onReady: (current: AnimationScope, run: typeof animate) => {
			scope = current;
			animate = run;
		},
	});
	try {
		await nextPaint();
		const element = r.find('#box');
		expect(scope.current).toBe(element);
		expect(() => animate('.missing', { opacity: 1 })).toThrow();
		const control = animate(element, { opacity: [0, 0.5] }, { duration: 0.05 });
		expect(scope.animations).toContain(control);
		await control.finished;
		await vi.waitFor(() => expect(scope.animations).toEqual([]));
		expect(element.style.opacity).toBe('0.5');

		const updates = vi.fn();
		animate(element, { opacity: 1 }, { duration: 20, onUpdate: updates });
		await vi.waitFor(() => expect(updates).toHaveBeenCalled());
		r.unmount();
		await nextPaint();
		const callsAfterCleanup = updates.mock.calls.length;
		await nextPaint();
		expect(updates).toHaveBeenCalledTimes(callsAfterCleanup);
		expect(scope.animations).toEqual([]);
	} finally {
		if (r.container.isConnected) r.unmount();
	}
});
