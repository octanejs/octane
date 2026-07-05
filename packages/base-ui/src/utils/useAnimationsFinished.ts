// Ported from .base-ui/packages/react/src/internals/useAnimationsFinished.ts. Returns a
// stable function that runs a callback once all CSS animations/transitions on the element
// have finished (or immediately if there are none / no element). octane: `ReactDOM.flushSync`
// → octane `flushSync`.
//
// SLOT: plain-`.ts` hook; the trailing arg is the caller's slot.
import { flushSync } from 'octane';

import { S, splitSlot, subSlot } from '../internal';
import { useAnimationFrame } from './useAnimationFrame';
import { useStableCallback } from './useStableCallback';
import { resolveRef } from './resolveRef';

const STARTING_STYLE_ATTRIBUTE = 'data-starting-style';

export function useAnimationsFinished(
	...args: any[]
): (fnToExecute: () => void, signal?: AbortSignal | null) => void {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useAnimationsFinished');
	const elementOrRef = user[0] as { current: HTMLElement | null } | HTMLElement | null;
	const waitForStartingStyleRemoved = (user[1] as boolean | undefined) ?? false;
	const treatAbortedAsFinished = (user[2] as boolean | undefined) ?? true;

	const frame = useAnimationFrame(subSlot(slot, 'frame'));

	return useStableCallback(
		(fnToExecute: () => void, signal: AbortSignal | null = null) => {
			frame.cancel();

			const element = resolveRef(elementOrRef as any) as HTMLElement | null;
			if (element == null) {
				return;
			}
			const resolvedElement = element;

			const done = () => {
				// Synchronously flush so the browser doesn't paint an intermediate frame.
				flushSync(fnToExecute);
			};

			if (
				typeof resolvedElement.getAnimations !== 'function' ||
				(globalThis as any).BASE_UI_ANIMATIONS_DISABLED
			) {
				fnToExecute();
				return;
			}

			function exec() {
				Promise.all(resolvedElement.getAnimations().map((animation) => animation.finished))
					.then(() => {
						if (!signal?.aborted) {
							done();
						}
					})
					.catch(() => {
						if (treatAbortedAsFinished) {
							if (!signal?.aborted) {
								done();
							}
							return;
						}
						const currentAnimations = resolvedElement.getAnimations();
						if (
							!signal?.aborted &&
							currentAnimations.length > 0 &&
							currentAnimations.some(
								(animation) => animation.pending || animation.playState !== 'finished',
							)
						) {
							exec();
						}
					});
			}

			if (waitForStartingStyleRemoved) {
				if (!resolvedElement.hasAttribute(STARTING_STYLE_ATTRIBUTE)) {
					frame.request(exec);
					return;
				}
				const attributeObserver = new MutationObserver(() => {
					if (!resolvedElement.hasAttribute(STARTING_STYLE_ATTRIBUTE)) {
						attributeObserver.disconnect();
						exec();
					}
				});
				attributeObserver.observe(resolvedElement, {
					attributes: true,
					attributeFilter: [STARTING_STYLE_ATTRIBUTE],
				});
				signal?.addEventListener('abort', () => attributeObserver.disconnect(), { once: true });
				return;
			}

			frame.request(exec);
		},
		subSlot(slot, 'cb'),
	);
}
