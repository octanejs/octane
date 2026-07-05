// Ported from .base-ui/packages/react/src/internals/useTransitionStatus.ts +
// internals/stateAttributesMapping.ts (transitionStatusMapping). Drives the CSS enter/exit
// animation status ('starting' | 'ending' | 'idle' | undefined) and the `mounted` flag.
// `useIsoLayoutEffect` → octane `useLayoutEffect`; the render-phase `setState` calls are kept
// as-is (octane supports bounded render-phase updates, like React).
//
// SLOT: `useTransitionStatus` is a plain-`.ts` hook; the trailing arg is the caller's slot.
import { useLayoutEffect, useState } from 'octane';

import { S, splitSlot, subSlot } from '../internal';
import { AnimationFrame } from './useAnimationFrame';
import type { StateAttributesMapping } from './getStateAttributesProps';

export type TransitionStatus = 'starting' | 'ending' | 'idle' | undefined;

const STARTING_HOOK = { 'data-starting-style': '' };
const ENDING_HOOK = { 'data-ending-style': '' };

export const transitionStatusMapping: StateAttributesMapping<{
	transitionStatus: TransitionStatus;
}> = {
	transitionStatus(value: TransitionStatus): Record<string, string> | null {
		if (value === 'starting') {
			return STARTING_HOOK;
		}
		if (value === 'ending') {
			return ENDING_HOOK;
		}
		return null;
	},
};

export function useTransitionStatus(...args: any[]): {
	mounted: boolean;
	setMounted: (next: boolean | ((prev: boolean) => boolean)) => void;
	transitionStatus: TransitionStatus;
} {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useTransitionStatus');
	const open = user[0] as boolean;
	const enableIdleState = (user[1] as boolean | undefined) ?? false;
	const deferEndingState = (user[2] as boolean | undefined) ?? false;

	const [transitionStatus, setTransitionStatus] = useState<TransitionStatus>(
		open && enableIdleState ? 'idle' : undefined,
		subSlot(slot, 'ts'),
	);
	const [mounted, setMounted] = useState(open, subSlot(slot, 'mounted'));

	if (open && !mounted) {
		setMounted(true);
		setTransitionStatus('starting');
	}

	if (!open && mounted && transitionStatus !== 'ending' && !deferEndingState) {
		setTransitionStatus('ending');
	}

	if (!open && !mounted && transitionStatus === 'ending') {
		setTransitionStatus(undefined);
	}

	useLayoutEffect(
		() => {
			if (!open && mounted && transitionStatus !== 'ending' && deferEndingState) {
				const frame = AnimationFrame.request(() => {
					setTransitionStatus('ending');
				});
				return () => {
					AnimationFrame.cancel(frame);
				};
			}
			return undefined;
		},
		[open, mounted, transitionStatus, deferEndingState],
		subSlot(slot, 'e:defer'),
	);

	useLayoutEffect(
		() => {
			if (!open || enableIdleState) {
				return undefined;
			}
			const frame = AnimationFrame.request(() => {
				setTransitionStatus(undefined);
			});
			return () => {
				AnimationFrame.cancel(frame);
			};
		},
		[enableIdleState, open],
		subSlot(slot, 'e:clear'),
	);

	useLayoutEffect(
		() => {
			if (!open || !enableIdleState) {
				return undefined;
			}
			if (open && mounted && transitionStatus !== 'idle') {
				setTransitionStatus('starting');
			}
			const frame = AnimationFrame.request(() => {
				setTransitionStatus('idle');
			});
			return () => {
				AnimationFrame.cancel(frame);
			};
		},
		[enableIdleState, open, mounted, transitionStatus],
		subSlot(slot, 'e:idle'),
	);

	return { mounted, setMounted, transitionStatus };
}
