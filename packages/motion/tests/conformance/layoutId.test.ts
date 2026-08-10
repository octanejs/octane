import { describe, it, expect, vi, afterEach } from 'vitest';
const { animateMock } = vi.hoisted(() => ({ animateMock: vi.fn(() => ({ stop: vi.fn() })) }));
vi.mock('motion', () => ({
	animate: animateMock,
	hover: vi.fn(() => vi.fn()),
	press: vi.fn(() => vi.fn()),
	inView: vi.fn(() => vi.fn()),
}));
import { mount, nextPaint } from '../_helpers';
import { Hero, NamedHero } from '../_fixtures/hero.tsrx';

const orig = Element.prototype.getBoundingClientRect;
afterEach(() => {
	Element.prototype.getBoundingClientRect = orig;
	animateMock.mockClear();
});

describe('layoutId (shared-element crossfade)', () => {
	// @parity-case conformance:bounded-layoutId
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

	it('expires an unclaimed layoutId box before a later reopen', async () => {
		let box: any = { left: 0, top: 0, width: 100, height: 100 };
		Element.prototype.getBoundingClientRect = vi.fn(() => box);

		const first = mount(NamedHero, { layoutId: 'reopened-hero' });
		await nextPaint();
		first.unmount();
		await Promise.resolve();

		box = { left: 200, top: 0, width: 100, height: 100 };
		animateMock.mockClear();
		const reopened = mount(NamedHero, { layoutId: 'reopened-hero' });
		await nextPaint();

		expect(reopened.find('#named-hero').style.transform).toBe('');
		expect(animateMock).not.toHaveBeenCalled();
		reopened.unmount();
	});

	it('preserves an existing transform when the selected layout mode has no delta', async () => {
		let box: any = { left: 0, top: 0, width: 100, height: 100 };
		Element.prototype.getBoundingClientRect = vi.fn(() => box);
		const props = {
			layoutId: 'position-only-hero',
			layout: 'position',
			style: { transform: 'rotate(15deg)' },
		};

		const first = mount(NamedHero, props);
		await nextPaint();
		first.unmount();

		box = { left: 0, top: 0, width: 200, height: 200 };
		animateMock.mockClear();
		const second = mount(NamedHero, props);
		await nextPaint();

		expect(second.find('#named-hero').style.transform).toBe('rotate(15deg)');
		expect(animateMock).not.toHaveBeenCalled();
		second.unmount();
	});
});
