import { describe, it, expect, vi, afterEach } from 'vitest';
const { animateMock } = vi.hoisted(() => ({ animateMock: vi.fn(() => ({ stop: vi.fn() })) }));
vi.mock('motion', () => ({
	animate: animateMock,
	hover: vi.fn(() => vi.fn()),
	press: vi.fn(() => vi.fn()),
}));
import { mount, nextPaint } from '../_helpers';
import { LayoutBox, LayoutModeBox } from '../_fixtures/layout.tsrx';

const orig = Element.prototype.getBoundingClientRect;
afterEach(() => {
	Element.prototype.getBoundingClientRect = orig;
	animateMock.mockClear();
});

describe('layout (FLIP)', () => {
	// @parity-case conformance:bounded-layout-flip
	it('FLIPs from the old box to the new when layout changes between renders', async () => {
		let box: any = { left: 0, top: 0, width: 100, height: 100 };
		Element.prototype.getBoundingClientRect = vi.fn(() => box);

		const r = mount(LayoutBox, { label: 'a' });
		await nextPaint();
		animateMock.mockClear();
		// Simulate a layout shift: the element moved by (50, 50).
		box = { left: 50, top: 50, width: 200, height: 200 };
		r.update(LayoutBox, { label: 'b' });
		await nextPaint();

		const div = r.find('#box');
		// Inverse transform applied instantly (delta = prev - new = -50,-50) ...
		expect(div.style.transform).toBe('translate(-50px, -50px) scale(0.5, 0.5)');
		// ... then animated back to identity with the transition.
		expect(animateMock).toHaveBeenCalledWith(
			div,
			{ transform: 'translate(0px, 0px) scale(1, 1)' },
			{ duration: 0.3 },
		);
		r.unmount();
	});

	it('layout="position" translates without applying scale', async () => {
		let box: any = { left: 0, top: 0, width: 100, height: 50 };
		Element.prototype.getBoundingClientRect = vi.fn(() => box);

		const r = mount(LayoutModeBox, {
			label: 'before',
			layout: 'position',
			transition: { duration: 0.2 },
		});
		await nextPaint();
		animateMock.mockClear();
		box = { left: 40, top: 20, width: 200, height: 100 };
		r.update(LayoutModeBox, {
			label: 'after',
			layout: 'position',
			transition: { duration: 0.2 },
		});
		await nextPaint();

		const div = r.find('#layout-mode-box');
		expect(div.style.transform).toBe('translate(-40px, -20px)');
		expect(animateMock).toHaveBeenCalledWith(
			div,
			{ transform: 'translate(0px, 0px)' },
			{ duration: 0.2 },
		);
		r.unmount();
	});

	it('supports layout="size" with transition.layout', async () => {
		let box: any = { left: 0, top: 0, width: 100, height: 50 };
		Element.prototype.getBoundingClientRect = vi.fn(() => box);
		const layoutTransition = { duration: 0.24, ease: 'easeOut' };

		const r = mount(LayoutModeBox, {
			label: 'before',
			layout: 'size',
			transition: { opacity: { duration: 0.1 }, layout: layoutTransition },
		});
		await nextPaint();
		animateMock.mockClear();
		box = { left: 40, top: 20, width: 200, height: 100 };
		r.update(LayoutModeBox, {
			label: 'after',
			layout: 'size',
			transition: { opacity: { duration: 0.1 }, layout: layoutTransition },
		});
		await nextPaint();

		const div = r.find('#layout-mode-box');
		expect(div.style.transform).toBe('scale(0.5, 0.5)');
		expect(animateMock).toHaveBeenCalledWith(div, { transform: 'scale(1, 1)' }, layoutTransition);
		r.unmount();
	});

	it('starts a fresh baseline after layout is disabled and re-enabled', async () => {
		let box: any = { left: 0, top: 0, width: 100, height: 50 };
		Element.prototype.getBoundingClientRect = vi.fn(() => box);
		const transition = { duration: 0.2 };

		const r = mount(LayoutModeBox, {
			label: 'enabled',
			layout: 'position',
			transition,
		});
		await nextPaint();
		animateMock.mockClear();

		box = { left: 40, top: 20, width: 100, height: 50 };
		r.update(LayoutModeBox, { label: 'disabled-1', layout: false, transition });
		await nextPaint();
		box = { left: 80, top: 40, width: 100, height: 50 };
		r.update(LayoutModeBox, { label: 'disabled-2', layout: false, transition });
		await nextPaint();
		expect(animateMock).not.toHaveBeenCalled();

		box = { left: 120, top: 60, width: 100, height: 50 };
		r.update(LayoutModeBox, { label: 're-enabled', layout: 'position', transition });
		await nextPaint();
		expect(r.find('#layout-mode-box').style.transform).toBe('');
		expect(animateMock).not.toHaveBeenCalled();

		box = { left: 140, top: 70, width: 100, height: 50 };
		r.update(LayoutModeBox, { label: 'changed', layout: 'position', transition });
		await nextPaint();
		const div = r.find('#layout-mode-box');
		expect(div.style.transform).toBe('translate(-20px, -10px)');
		expect(animateMock).toHaveBeenCalledWith(div, { transform: 'translate(0px, 0px)' }, transition);
		r.unmount();
	});
});
