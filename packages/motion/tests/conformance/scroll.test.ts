import { describe, it, expect, vi } from 'vitest';
const { scrollMock } = vi.hoisted(() => ({ scrollMock: vi.fn(() => vi.fn()) }));
vi.mock('motion', async (orig) => ({ ...((await orig()) as any), scroll: scrollMock }));
import { mount, nextPaint } from '../_helpers';
import { ScrollBox } from '../_fixtures/scroll.tsrx';

describe('useScroll', () => {
	it('returns scroll-linked MotionValues driven by motion.scroll', async () => {
		let progress: any;
		const r = mount(ScrollBox, { onReady: (mv: any) => (progress = mv) });
		await nextPaint();
		expect(typeof progress.get).toBe('function'); // a MotionValue
		expect(scrollMock).toHaveBeenCalled();

		// Drive the reported scroll callback → the progress value updates.
		const onScroll = scrollMock.mock.calls[0][0] as (p: number) => void;
		onScroll(0.42);
		expect(progress.get()).toBe(0.42);
		r.unmount();
	});
});
