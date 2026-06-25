import { describe, it, expect, vi, afterEach } from 'vitest';
const { animateMock } = vi.hoisted(() => ({ animateMock: vi.fn(() => ({ stop: vi.fn() })) }));
vi.mock('motion', () => ({
	animate: animateMock,
	hover: vi.fn(() => vi.fn()),
	press: vi.fn(() => vi.fn()),
}));
import { mount, nextPaint } from '../_helpers';
import { LayoutBox } from '../_fixtures/layout.tsrx';

const orig = Element.prototype.getBoundingClientRect;
afterEach(() => {
	Element.prototype.getBoundingClientRect = orig;
});

describe('layout (FLIP)', () => {
	it('FLIPs from the old box to the new when layout changes between renders', async () => {
		let box: any = { left: 0, top: 0, width: 100, height: 100 };
		Element.prototype.getBoundingClientRect = vi.fn(() => box);

		const r = mount(LayoutBox, { label: 'a' });
		await nextPaint();
		animateMock.mockClear();
		// Simulate a layout shift: the element moved by (50, 50).
		box = { left: 50, top: 50, width: 100, height: 100 };
		r.update(LayoutBox, { label: 'b' });
		await nextPaint();

		const div = r.find('#box');
		// Inverse transform applied instantly (delta = prev - new = -50,-50) ...
		expect(div.style.transform).toContain('translate(-50px, -50px)');
		// ... then animated back to identity with the transition.
		expect(animateMock).toHaveBeenCalledWith(
			div,
			{ transform: 'translate(0px, 0px) scale(1, 1)' },
			{ duration: 0.3 },
		);
		r.unmount();
	});
});
