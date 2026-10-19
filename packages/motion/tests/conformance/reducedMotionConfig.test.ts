import { describe, expect, it, vi } from 'vitest';

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
import { ReducedMotionTarget } from '../_fixtures/reduced-motion-config.tsrx';

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
});
