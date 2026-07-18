// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/disclosure/useDisclosure.ts).
// octane adaptations: `flushSync` from 'octane'; React's HTMLAttributes → structural
// prop bag; public-hook slot threading.
import type { PressEvent, RefObject } from '@react-types/shared';
import { flushSync, useCallback, useEffect, useRef } from 'octane';

import { S, splitSlot, subSlot } from '../internal';
import type { AriaButtonProps } from '../button/useButton';
import type { DisclosureState } from '../stately/disclosure/useDisclosureState';
import { useEvent } from '../utils/useEvent';
import { useId } from '../utils/useId';
import { useIsSSR } from '../ssr/SSRProvider';
import { useLayoutEffect } from '../utils/useLayoutEffect';

export interface AriaDisclosureProps {
	/** Whether the disclosure is disabled. */
	isDisabled?: boolean;
	/** Handler that is called when the disclosure's expanded state changes. */
	onExpandedChange?: (isExpanded: boolean) => void;
	/** Whether the disclosure is expanded (controlled). */
	isExpanded?: boolean;
	/** Whether the disclosure is expanded by default (uncontrolled). */
	defaultExpanded?: boolean;
}

export interface DisclosureAria {
	/** Props for the disclosure button. */
	buttonProps: AriaButtonProps;
	/** Props for the disclosure panel. */
	panelProps: Record<string, any>;
}

/**
 * Provides the behavior and accessibility implementation for a disclosure component.
 */
export function useDisclosure(
	props: AriaDisclosureProps,
	state: DisclosureState,
	ref: RefObject<HTMLElement | null>,
): DisclosureAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useDisclosure(
	props: AriaDisclosureProps,
	state: DisclosureState,
	ref: RefObject<HTMLElement | null>,
	slot: symbol | undefined,
): DisclosureAria;
export function useDisclosure(...args: any[]): DisclosureAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useDisclosure');
	const props = user[0] as AriaDisclosureProps;
	const state = user[1] as DisclosureState;
	const ref = user[2] as RefObject<HTMLElement | null>;

	let { isDisabled } = props;
	let triggerId = useId(subSlot(slot, 'triggerId'));
	let panelId = useId(subSlot(slot, 'panelId'));
	let isSSR = useIsSSR(subSlot(slot, 'ssr'));

	let raf = useRef<number | null>(null, subSlot(slot, 'raf'));

	let handleBeforeMatch = useCallback(
		() => {
			// Wait a frame to revert browser's removal of hidden attribute
			raf.current = requestAnimationFrame(() => {
				if (ref.current) {
					ref.current.setAttribute('hidden', 'until-found');
				}
			});
			// Force sync state update
			flushSync(() => {
				state.toggle();
			});
		},
		[ref, state],
		subSlot(slot, 'beforeMatch'),
	);

	useEvent(ref, 'beforematch', handleBeforeMatch, subSlot(slot, 'beforeMatchEvent'));

	let isExpandedRef = useRef<boolean | null>(null, subSlot(slot, 'wasExpanded'));
	useLayoutEffect(
		() => {
			// Cancel any pending RAF to prevent stale updates
			if (raf.current) {
				cancelAnimationFrame(raf.current);
			}
			if (ref.current && !isSSR) {
				let panel = ref.current;

				if (isExpandedRef.current == null || typeof panel.getAnimations !== 'function') {
					// On initial render (and in tests), set attributes without animation.
					if (state.isExpanded) {
						panel.removeAttribute('hidden');
						panel.style.setProperty('--disclosure-panel-width', 'auto');
						panel.style.setProperty('--disclosure-panel-height', 'auto');
					} else {
						panel.setAttribute('hidden', 'until-found');
						panel.style.setProperty('--disclosure-panel-width', '0px');
						panel.style.setProperty('--disclosure-panel-height', '0px');
					}
				} else if (state.isExpanded !== isExpandedRef.current) {
					if (state.isExpanded) {
						panel.removeAttribute('hidden');

						// Set the width and height as pixels so they can be animated.
						panel.style.setProperty('--disclosure-panel-width', panel.scrollWidth + 'px');
						panel.style.setProperty('--disclosure-panel-height', panel.scrollHeight + 'px');

						Promise.all(panel.getAnimations().map((a) => a.finished))
							.then(() => {
								// After the animations complete, switch back to auto so the content can resize.
								panel.style.setProperty('--disclosure-panel-width', 'auto');
								panel.style.setProperty('--disclosure-panel-height', 'auto');
							})
							.catch(() => {});
					} else {
						panel.style.setProperty('--disclosure-panel-width', panel.scrollWidth + 'px');
						panel.style.setProperty('--disclosure-panel-height', panel.scrollHeight + 'px');

						// Force style re-calculation to trigger animations.
						window.getComputedStyle(panel).height;

						// Animate to zero size.
						panel.style.setProperty('--disclosure-panel-width', '0px');
						panel.style.setProperty('--disclosure-panel-height', '0px');

						// Wait for animations to apply the hidden attribute.
						Promise.all(panel.getAnimations().map((a) => a.finished))
							.then(() => panel.setAttribute('hidden', 'until-found'))
							.catch(() => {});
					}
				}

				isExpandedRef.current = state.isExpanded;
			}
		},
		[isDisabled, ref, state.isExpanded, isSSR],
		subSlot(slot, 'panelSync'),
	);

	useEffect(
		() => {
			return () => {
				if (raf.current) {
					cancelAnimationFrame(raf.current);
				}
			};
		},
		[],
		subSlot(slot, 'rafCleanup'),
	);

	return {
		buttonProps: {
			id: triggerId,
			'aria-expanded': state.isExpanded,
			'aria-controls': panelId,
			onPress: (e: PressEvent) => {
				if (!isDisabled && e.pointerType !== 'keyboard') {
					state.toggle();
				}
			},
			isDisabled,
			onPressStart(e: PressEvent) {
				if (e.pointerType === 'keyboard' && !isDisabled) {
					state.toggle();
				}
			},
		},
		panelProps: {
			id: panelId,
			// This can be overridden at the panel element level.
			role: 'group',
			'aria-labelledby': triggerId,
			'aria-hidden': !state.isExpanded,
			hidden: isSSR ? !state.isExpanded : undefined,
		},
	};
}
