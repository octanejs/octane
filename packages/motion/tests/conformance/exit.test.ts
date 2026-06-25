import { describe, it, expect, vi, beforeEach } from 'vitest';
const { animateMock } = vi.hoisted(() => ({ animateMock: vi.fn() }));
vi.mock('motion', () => ({
	animate: animateMock,
	hover: vi.fn(() => vi.fn()),
	press: vi.fn(() => vi.fn()),
}));
import { mount, nextPaint } from '../_helpers';
import { Toggle } from '../_fixtures/exit.tsrx';

describe('AnimatePresence exit animations', () => {
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
});
