import { describe, it, expect, vi, beforeEach } from 'vitest';
const { animateMock } = vi.hoisted(() => ({ animateMock: vi.fn() }));
vi.mock('motion', () => ({
	animate: animateMock,
	hover: vi.fn(() => vi.fn()),
	press: vi.fn(() => vi.fn()),
}));
import { mount, nextPaint } from '../_helpers';
import { ActivityToggle, Toggle } from '../_fixtures/exit.tsrx';

beforeEach(() => {
	animateMock.mockReset();
});

describe('AnimatePresence exit animations', () => {
	// @parity-case conformance:exit-cleanup-before-detach
	it('animates a clone of the leaving element, removing it when the exit finishes', async () => {
		let exitDone: () => void = () => {};
		animateMock.mockImplementation(() => ({
			then: (res: () => void) => {
				exitDone = res;
			},
			stop: vi.fn(),
		}));
		const r = mount(Toggle, { show: true });
		await nextPaint();
		expect(r.container.querySelector('#box')).not.toBeNull();

		r.update(Toggle, { show: false });
		await nextPaint();
		// octane removed the original, but a clone is animating the exit.
		expect(animateMock).toHaveBeenCalledWith(expect.anything(), { opacity: 0 }, { duration: 0.2 });
		const clone = r.container.querySelector('#box');
		expect(clone).not.toBeNull(); // clone present, mid-exit
		expect(animateMock.mock.calls[0][0]).toBe(clone); // animated the clone

		exitDone(); // exit animation completes
		expect(r.container.querySelector('#box')).toBeNull(); // clone removed
		r.unmount();
	});

	it('hides and reveals the original host without starting an exit clone', async () => {
		animateMock.mockImplementation(() => ({ then: vi.fn(), stop: vi.fn() }));
		const r = mount(ActivityToggle, { mode: 'visible', show: true });
		await nextPaint();
		const original = r.container.querySelector('#box');
		expect(original).not.toBeNull();

		r.update(ActivityToggle, { mode: 'hidden', show: true });
		await nextPaint();
		expect([...r.container.querySelectorAll('#box')]).toEqual([original]);
		expect(animateMock).not.toHaveBeenCalled();

		r.update(ActivityToggle, { mode: 'visible', show: true });
		await nextPaint();
		expect([...r.container.querySelectorAll('#box')]).toEqual([original]);
		expect(animateMock).not.toHaveBeenCalled();
		r.unmount();
	});

	it('animates a clone when a child is removed in the commit that hides Activity', async () => {
		let exitDone: () => void = () => {};
		animateMock.mockImplementation(() => ({
			then: (resolve: () => void) => {
				exitDone = resolve;
			},
			stop: vi.fn(),
		}));
		const r = mount(ActivityToggle, { mode: 'visible', show: true });
		await nextPaint();
		const original = r.container.querySelector('#box');
		expect(original).not.toBeNull();

		r.update(ActivityToggle, { mode: 'hidden', show: false });
		await nextPaint();
		const clone = r.container.querySelector('#box');
		expect(clone).not.toBeNull();
		expect(clone).not.toBe(original);
		expect(animateMock).toHaveBeenCalledWith(clone, { opacity: 0 }, { duration: 0.2 });

		exitDone();
		expect(r.container.querySelector('#box')).toBeNull();
		r.unmount();
	});
});
