import { afterEach, describe, expect, it, vi } from 'vitest';

const { animateMock } = vi.hoisted(() => ({
	animateMock: vi.fn(() => ({ stop: vi.fn() })),
}));
vi.mock('motion', () => ({
	animate: animateMock,
	hover: vi.fn(() => vi.fn()),
	press: vi.fn(() => vi.fn()),
	inView: vi.fn(() => vi.fn()),
}));

import { mount, nextPaint } from '../_helpers';
import { ReducedMotionLayout, ReducedMotionTarget } from '../_fixtures/reduced-motion-config.tsrx';

const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;

afterEach(() => {
	Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
});

describe('MotionConfig reducedMotion', () => {
	it('makes positional values instant while preserving non-positional animation', async () => {
		const result = mount(ReducedMotionTarget);
		await nextPaint();

		expect(animateMock).toHaveBeenCalledWith(
			result.find('#reduced-target'),
			{ opacity: 0.5, x: 100 },
			{
				duration: 0.5,
				x: { delay: 0, duration: 0, type: false },
			},
		);
		result.unmount();
	});

	it('still measures every layout commit and skips the inverse FLIP transform', async () => {
		let box: any = { left: 0, top: 0, width: 100, height: 100 };
		Element.prototype.getBoundingClientRect = vi.fn(() => box);

		const result = mount(ReducedMotionLayout, { label: 'first' });
		await nextPaint();
		animateMock.mockClear();

		box = { left: 80, top: 20, width: 120, height: 100 };
		result.update(ReducedMotionLayout, { label: 'second' });
		await nextPaint();

		expect(Element.prototype.getBoundingClientRect).toHaveBeenCalled();
		expect(result.find('#reduced-layout').style.transform).toBe('');
		expect(animateMock).not.toHaveBeenCalled();
		result.unmount();
	});
});
