import { describe, it, expect, vi, afterEach } from 'vitest';
const { animateMock } = vi.hoisted(() => ({ animateMock: vi.fn(() => ({ stop: vi.fn() })) }));
vi.mock('motion', () => ({
	animate: animateMock,
	hover: vi.fn(() => vi.fn()),
	press: vi.fn(() => vi.fn()),
	inView: vi.fn(() => vi.fn()),
}));
import { mount, nextPaint } from '../_helpers';
import { Hero } from '../_fixtures/hero.tsrx';

const orig = Element.prototype.getBoundingClientRect;
afterEach(() => {
	Element.prototype.getBoundingClientRect = orig;
});

describe('layoutId (shared-element crossfade)', () => {
	it('FLIPs a newly-mounted element from a same-id element that just unmounted', async () => {
		let box: any = { left: 0, top: 0, width: 100, height: 100 }; // position A
		Element.prototype.getBoundingClientRect = vi.fn(() => box);

		const a = mount(Hero);
		await nextPaint();
		a.unmount(); // records box A under "hero"

		box = { left: 200, top: 0, width: 100, height: 100 }; // position B
		animateMock.mockClear();
		const b = mount(Hero);
		await nextPaint();
		const div = b.find('#hero');
		// New element starts at the old box (delta = 0 - 200 = -200) then animates home.
		expect(div.style.transform).toContain('translate(-200px, 0px)');
		expect(animateMock).toHaveBeenCalledWith(
			div,
			{ transform: 'translate(0px, 0px) scale(1, 1)' },
			{ duration: 0.4 },
		);
		b.unmount();
	});
});
