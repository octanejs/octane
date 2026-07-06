// Ported from .base-ui/packages/utils/src/useAnimationFrame.ts. `AnimationFrame` is a
// module-level rAF scheduler (request returns an id; cancel takes it); `useAnimationFrame`
// is a per-instance frame that cancels its pending callback on unmount. Base UI's Scheduler
// batches many callbacks into one rAF for perf — the observable behavior (run-next-frame,
// cancelable) is identical, so this delegates straight to requestAnimationFrame.
//
// SLOT: `useAnimationFrame` is a plain-`.ts` hook; the trailing arg is the caller's slot.
import { useLayoutEffect, useMemo, useRef } from 'octane';

import { S, splitSlot, subSlot } from '../internal';

export interface Frame {
	request: (fn: FrameRequestCallback) => number;
	cancel: () => void;
}

export const AnimationFrame = {
	request(fn: FrameRequestCallback): number {
		return requestAnimationFrame(fn);
	},
	cancel(id: number | null): void {
		if (id != null) {
			cancelAnimationFrame(id);
		}
	},
	// A per-instance frame that supersedes its own pending callback (like `useAnimationFrame`'s
	// return, but usable outside a component — e.g. useScrollLock's resize handler).
	create(): Frame {
		let id: number | null = null;
		return {
			request(fn: FrameRequestCallback): number {
				if (id != null) {
					cancelAnimationFrame(id);
				}
				id = requestAnimationFrame((ts) => {
					id = null;
					fn(ts);
				});
				return id;
			},
			cancel(): void {
				if (id != null) {
					cancelAnimationFrame(id);
					id = null;
				}
			},
		};
	},
};

export function useAnimationFrame(...args: any[]): Frame {
	const [, slotArg] = splitSlot(['_', ...args]);
	const slot = slotArg ?? S('useAnimationFrame');
	const idRef = useRef<number | null>(null, subSlot(slot, 'id'));

	const frame = useMemo<Frame>(
		() => ({
			request(fn: FrameRequestCallback): number {
				if (idRef.current != null) {
					cancelAnimationFrame(idRef.current);
				}
				idRef.current = requestAnimationFrame((ts) => {
					idRef.current = null;
					fn(ts);
				});
				return idRef.current;
			},
			cancel(): void {
				if (idRef.current != null) {
					cancelAnimationFrame(idRef.current);
					idRef.current = null;
				}
			},
		}),
		[],
		subSlot(slot, 'frame'),
	);

	useLayoutEffect(() => () => frame.cancel(), [], subSlot(slot, 'e:clean'));

	return frame;
}
