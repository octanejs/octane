// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/utils/animation.ts).
// octane adaptations: `flushSync` comes from 'octane' (not react-dom); public hooks get the
// binding's slot threading (splitSlot/subSlot); explicit dep arrays are preserved verbatim.
// In environments without `Element#getAnimations` (jsdom), the animation completes
// immediately, exactly like upstream's JSDOM branch.
import { flushSync, useCallback, useState } from 'octane';

import { S, splitSlot, subSlot } from '../internal';
import { useLayoutEffect } from './useLayoutEffect';

type RefObject<T> = { current: T };

export function useEnterAnimation(ref: RefObject<HTMLElement | null>, isReady?: boolean): boolean;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useEnterAnimation(
	ref: RefObject<HTMLElement | null>,
	isReady: boolean | undefined,
	slot: symbol | undefined,
): boolean;
export function useEnterAnimation(...args: any[]): boolean {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useEnterAnimation');
	const ref = user[0] as RefObject<HTMLElement | null>;
	const isReady = (user[1] as boolean | undefined) ?? true;

	let [isEntering, setEntering] = useState(true, subSlot(slot, 'entering'));
	let isAnimationReady = isEntering && isReady;

	// There are two cases for entry animations:
	// 1. CSS @keyframes. The `animation` property is set during the isEntering state, and it is removed after the animation finishes.
	// 2. CSS transitions. The initial styles are applied during the isEntering state, and removed immediately, causing the transition to occur.
	//
	// In the second case, cancel any transitions that were triggered prior to the isEntering = false state (when the transition is supposed to start).
	// This can happen when isReady starts as false (e.g. popovers prior to placement calculation).
	useLayoutEffect(
		() => {
			if (isAnimationReady && ref.current && 'getAnimations' in ref.current) {
				for (let animation of ref.current.getAnimations()) {
					if (animation instanceof CSSTransition) {
						animation.cancel();
					}
				}
			}
		},
		[ref, isAnimationReady],
		subSlot(slot, 'cancelTransitions'),
	);

	useAnimation(
		ref,
		isAnimationReady,
		useCallback(() => setEntering(false), [], subSlot(slot, 'onEnd')),
		subSlot(slot, 'animation'),
	);
	return isAnimationReady;
}

export function useExitAnimation(ref: RefObject<HTMLElement | null>, isOpen: boolean): boolean;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useExitAnimation(
	ref: RefObject<HTMLElement | null>,
	isOpen: boolean,
	slot: symbol | undefined,
): boolean;
export function useExitAnimation(...args: any[]): boolean {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useExitAnimation');
	const ref = user[0] as RefObject<HTMLElement | null>;
	const isOpen = user[1] as boolean;

	let [exitState, setExitState] = useState<'closed' | 'open' | 'exiting'>(
		isOpen ? 'open' : 'closed',
		subSlot(slot, 'exitState'),
	);

	switch (exitState) {
		case 'open':
			// If isOpen becomes false, set the state to exiting.
			if (!isOpen) {
				setExitState('exiting');
			}
			break;
		case 'closed':
		case 'exiting':
			// If we are exiting and isOpen becomes true, the animation was interrupted.
			// Reset the state to open.
			if (isOpen) {
				setExitState('open');
			}
			break;
	}

	let isExiting = exitState === 'exiting';
	useAnimation(
		ref,
		isExiting,
		useCallback(
			() => {
				// Set the state to closed, which will cause the element to be unmounted.
				setExitState((state) => (state === 'exiting' ? 'closed' : state));
			},
			[],
			subSlot(slot, 'onEnd'),
		),
		subSlot(slot, 'animation'),
	);

	return isExiting;
}

function useAnimation(
	ref: RefObject<HTMLElement | null>,
	isActive: boolean,
	onEnd: () => void,
	slot: symbol | undefined,
): void {
	useLayoutEffect(
		() => {
			if (isActive && ref.current) {
				if (!('getAnimations' in ref.current)) {
					// JSDOM
					onEnd();
					return;
				}

				let animations = ref.current.getAnimations();
				if (animations.length === 0) {
					onEnd();
					return;
				}

				let canceled = false;
				Promise.allSettled(animations.map((a) => a.finished)).then(() => {
					if (!canceled) {
						flushSync(() => {
							onEnd();
						});
					}
				});

				return () => {
					canceled = true;
				};
			}
		},
		[ref, isActive, onEnd],
		subSlot(slot, 'effect'),
	);
}
