import { describe, it, expect, vi } from 'vitest';
const { animateMock } = vi.hoisted(() => ({ animateMock: vi.fn(() => ({ stop: vi.fn() })) }));
vi.mock('motion', () => ({
	animate: animateMock,
	hover: vi.fn(() => vi.fn()),
	press: vi.fn(() => vi.fn()),
	inView: vi.fn(() => vi.fn()),
}));
import { mount, nextPaint } from '../_helpers';
import { StaggerList } from '../_fixtures/stagger.tsrx';

// The animate-to-"visible" call (not the instant initial {opacity:0} one).
const animFor = (el: Element) =>
	animateMock.mock.calls.find((c) => c[0] === el && c[1] && c[1].opacity === 1);

describe('staggerChildren / delayChildren', () => {
	it('delays each variant child by delayChildren + index * staggerChildren', async () => {
		const r = mount(StaggerList, { items: ['0', '1', '2'] });
		await nextPaint();
		// container animates to its variant values (transition key stripped out).
		expect(animateMock).toHaveBeenCalledWith(
			r.find('#container'),
			{ opacity: 1 },
			expect.anything(),
		);
		// children: delay = 1 + index * 0.5  → 1, 1.5, 2
		expect(animFor(r.find('#i0'))).toEqual([r.find('#i0'), { opacity: 1 }, { delay: 1 }]);
		expect(animFor(r.find('#i1'))).toEqual([r.find('#i1'), { opacity: 1 }, { delay: 1.5 }]);
		expect(animFor(r.find('#i2'))).toEqual([r.find('#i2'), { opacity: 1 }, { delay: 2 }]);
		r.unmount();
	});
});

describe('staggerDirection', () => {
	it('reverses the order with staggerDirection: -1 (last child first)', async () => {
		const r = mount(StaggerList, { items: ['0', '1', '2'], direction: -1 });
		await nextPaint();
		const af = (el: Element) =>
			animateMock.mock.calls.find((c) => c[0] === el && c[1] && c[1].opacity === 1);
		// offset = (count - 1 - index): i0→2, i1→1, i2→0 → delays 2, 1.5, 1
		expect(af(r.find('#i0'))![2]).toEqual({ delay: 2 });
		expect(af(r.find('#i1'))![2]).toEqual({ delay: 1.5 });
		expect(af(r.find('#i2'))![2]).toEqual({ delay: 1 });
		r.unmount();
	});
});

describe('delayChildren as a function (stagger())', () => {
	it('uses delayChildren(index, total) as each child delay', async () => {
		const r = mount(StaggerList, { items: ['0', '1', '2'], delayFn: (i: number) => (i + 1) * 0.5 });
		await nextPaint();
		const af = (el: Element) =>
			animateMock.mock.calls.find((c) => c[0] === el && c[1] && c[1].opacity === 1);
		expect(af(r.find('#i0'))![2]).toEqual({ delay: 0.5 }); // (0+1)*0.5
		expect(af(r.find('#i1'))![2]).toEqual({ delay: 1 });
		expect(af(r.find('#i2'))![2]).toEqual({ delay: 1.5 });
		r.unmount();
	});
});
