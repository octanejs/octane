// Ported from .base-ui/packages/react/src/internals/useOpenChangeComplete.tsx. Calls
// `onComplete` once the element's open/close CSS animation finishes (or immediately when
// there's no animation / no element).
//
// SLOT: plain-`.ts` hook; the trailing arg is the caller's slot.
import { useEffect } from 'octane';

import { S, splitSlot, subSlot } from '../internal';
import { useStableCallback } from './useStableCallback';
import { useAnimationsFinished } from './useAnimationsFinished';

export interface UseOpenChangeCompleteParameters {
	enabled?: boolean;
	open?: boolean;
	ref: { current: HTMLElement | null };
	onComplete: () => void;
}

export function useOpenChangeComplete(...args: any[]): void {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useOpenChangeComplete');
	const {
		enabled = true,
		open,
		ref,
		onComplete: onCompleteParam,
	} = user[0] as UseOpenChangeCompleteParameters;

	const onComplete = useStableCallback(onCompleteParam, subSlot(slot, 'oc'));
	const runOnceAnimationsFinish = useAnimationsFinished(ref, open, false, subSlot(slot, 'raf'));

	useEffect(
		() => {
			if (!enabled) {
				return undefined;
			}
			const abortController = new AbortController();
			runOnceAnimationsFinish(onComplete, abortController.signal);
			return () => {
				abortController.abort();
			};
		},
		[enabled, open, onComplete, runOnceAnimationsFinish],
		subSlot(slot, 'e:run'),
	);
}
