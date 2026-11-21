/**
 * The shared @tanstack/virtual-core must finish a scrollToIndex whose target
 * moved while the scroll settled (#2718). Replays the order captured from the
 * pinned "scrolls to last item" browser case in both lanes: the command's
 * write reads back, a row above the fold measures smaller (the core writes
 * its own correction) while rows below grow the sizer, and the at-rest scroll
 * report of that correction arrives before reconcile's animation frame.
 * Guards patches/@tanstack__virtual-core@3.19.11.patch (TanStack/virtual#1375).
 */
import { expect, it } from 'vitest';
import { Virtualizer } from '@tanstack/virtual-core';

it('lands scrollToIndex on a target that moved before its at-rest report', () => {
	const frames: FrameRequestCallback[] = [];
	const el = {
		scrollTop: 0,
		scrollHeight: 0,
		clientHeight: 400,
		ownerDocument: {
			defaultView: {
				requestAnimationFrame: (cb: FrameRequestCallback) => frames.push(cb),
				cancelAnimationFrame: () => {},
			},
		},
	};
	let report!: (offset: number, isScrolling: boolean) => void;
	const v = new Virtualizer<any, any>({
		count: 20,
		estimateSize: () => 50,
		getScrollElement: () => el,
		observeElementRect: (_, cb) => cb({ width: 100, height: 400 }),
		observeElementOffset: (_, cb) => {
			report = cb;
		},
		scrollToFn: (offset, { adjustments = 0 }) => {
			el.scrollTop = Math.min(Math.max(offset + adjustments, 0), el.scrollHeight - 400);
		},
		// The consumer's sizer commits the layout's total.
		onChange: (instance) => {
			el.scrollHeight = instance.getTotalSize();
		},
	});
	v._willUpdate();
	el.scrollHeight = v.getTotalSize();

	v.scrollToIndex(19);
	expect(el.scrollTop).toBe(600);
	report(600, true);

	v.resizeItem(15, 101); // in view, below the fold top: grows the max
	v.resizeItem(0, 33); // above the fold: the core corrects by -17
	el.scrollHeight = v.getTotalSize();
	expect(el.scrollTop).toBe(583);
	report(583, true);
	// The correction reported again at rest, before reconcile runs.
	report(583, false);

	for (let i = 0; i < 10 && frames.length; i++) frames.shift()!(0);
	expect(el.scrollTop).toBe(el.scrollHeight - 400);
	expect(el.scrollTop).toBe(634);
});
