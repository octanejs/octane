import { describe, it, expect, vi } from 'vitest';
vi.mock('motion', () => ({
	createScopedAnimate: vi.fn(({ scope }: any) => (...a: any[]) => {
		const c = { stop: vi.fn() };
		scope.animations.push(c);
		return c;
	}),
	animate: vi.fn(() => ({ stop: vi.fn() })),
	hover: vi.fn(() => vi.fn()),
	press: vi.fn(() => vi.fn()),
}));
import { mount, nextPaint } from '../_helpers';
import { AnimateBox } from '../_fixtures/animate.tsrx';

describe('useAnimate', () => {
	it('attaches the scope to the element + returns a scoped animate fn', async () => {
		let scope: any, animateFn: any;
		const r = mount(AnimateBox, {
			onReady: (s: any, a: any) => {
				scope = s;
				animateFn = a;
			},
		});
		await nextPaint();
		expect(scope.current).toBe(r.find('#box')); // scope ref attached
		expect(typeof animateFn).toBe('function');
		r.unmount();
	});

	it('stops tracked animations on unmount', async () => {
		let scope: any, animateFn: any;
		const r = mount(AnimateBox, {
			onReady: (s: any, a: any) => {
				scope = s;
				animateFn = a;
			},
		});
		await nextPaint();
		const ctrl = animateFn(scope.current, { x: 100 });
		expect(scope.animations).toContain(ctrl);
		r.unmount();
		expect(ctrl.stop).toHaveBeenCalled();
	});
});
