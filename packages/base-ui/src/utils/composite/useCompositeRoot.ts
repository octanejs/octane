// Ported from .base-ui/packages/react/src/internals/composite/root/useCompositeRoot.ts.
// The composite roving-focus engine: owns `highlightedIndex`, wires arrow/Home/End keyboard
// navigation over `elementsRef`, and sets the default tab stop from the item marked
// `data-composite-item-active` (or the first enabled item). octane adaptations: events are
// NATIVE (no `.nativeEvent`), so handlers read the event directly; grid navigation is via a
// caller-supplied `grid` navigator (unused by ToggleGroup).
//
// SLOT: plain-`.ts` hook; the trailing arg is the caller's slot.
import { useLayoutEffect, useRef, useState } from 'octane';

import { S, splitSlot, subSlot } from '../../internal';
import { useStableCallback } from '../useStableCallback';
import { useComposedRefs } from '../composeRefs';
import {
	ACTIVE_COMPOSITE_ITEM,
	ARROW_DOWN,
	ARROW_KEYS,
	ARROW_LEFT,
	ARROW_RIGHT,
	ARROW_UP,
	COMPOSITE_KEYS,
	END,
	HOME,
	HORIZONTAL_KEYS,
	HORIZONTAL_KEYS_WITH_EXTRA_KEYS,
	MODIFIER_KEYS,
	VERTICAL_KEYS,
	VERTICAL_KEYS_WITH_EXTRA_KEYS,
	isElementDisabled,
	isNativeInput,
	scrollIntoViewIfNeeded,
	type ModifierKey,
	type TextDirection,
} from './keys';
import {
	findNonDisabledListIndex,
	getMaxListIndex,
	getMinListIndex,
	getTarget,
	isIndexOutOfListBounds,
	isListIndexDisabled,
} from './list-utils';
import type { CompositeMetadata } from './CompositeList';

export interface UseCompositeRootParameters {
	orientation?: 'horizontal' | 'vertical' | 'both';
	grid?: ((params: any) => number) | undefined;
	loopFocus?: boolean;
	onLoop?:
		| ((
				event: any,
				prevIndex: number,
				nextIndex: number,
				elementsRef: { current: Array<HTMLElement | null> },
		  ) => number)
		| undefined;
	highlightedIndex?: number;
	onHighlightedIndexChange?: (index: number) => void;
	direction: TextDirection;
	rootRef?: any;
	enableHomeAndEndKeys?: boolean;
	stopEventPropagation?: boolean;
	disabledIndices?: number[];
	modifierKeys?: ModifierKey[];
}

const EMPTY_ARRAY: never[] = [];

function isModifierKeySet(event: any, ignoredModifierKeys: ModifierKey[]): boolean {
	for (const key of MODIFIER_KEYS.values()) {
		if (ignoredModifierKeys.includes(key)) {
			continue;
		}
		if (event.getModifierState(key)) {
			return true;
		}
	}
	return false;
}

export function useCompositeRoot(...args: any[]): {
	props: Record<string, any>;
	highlightedIndex: number;
	onHighlightedIndexChange: (index: number, shouldScrollIntoView?: boolean) => void;
	elementsRef: { current: Array<HTMLElement | null> };
	disabledIndices: number[] | undefined;
	onMapChange: (map: Map<Element, CompositeMetadata<any>>) => void;
	relayKeyboardEvent: (event: any) => void;
} {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useCompositeRoot');
	const params = user[0] as UseCompositeRootParameters;
	const {
		loopFocus = true,
		orientation = 'both',
		grid,
		onLoop,
		direction,
		highlightedIndex: externalHighlightedIndex,
		onHighlightedIndexChange: externalSetHighlightedIndex,
		rootRef: externalRef,
		enableHomeAndEndKeys = false,
		stopEventPropagation = false,
		disabledIndices,
		modifierKeys = EMPTY_ARRAY,
	} = params;

	const [internalHighlightedIndex, internalSetHighlightedIndex] = useState(0, subSlot(slot, 'hi'));
	const isGrid = grid != null;

	const rootRef = useRef<HTMLElement | null>(null, subSlot(slot, 'root'));
	const mergedRef = useComposedRefs(rootRef, externalRef, subSlot(slot, 'merged'));

	const elementsRef = useRef<Array<HTMLElement | null>>([], subSlot(slot, 'els'));
	const hasSetDefaultIndexRef = useRef(false, subSlot(slot, 'hasSet'));

	const highlightedIndex = externalHighlightedIndex ?? internalHighlightedIndex;
	const onHighlightedIndexChange = useStableCallback(
		(index: number, shouldScrollIntoView = false) => {
			(externalSetHighlightedIndex ?? internalSetHighlightedIndex)(index);
			if (shouldScrollIntoView) {
				const newActiveItem = elementsRef.current[index];
				scrollIntoViewIfNeeded(rootRef.current, newActiveItem, direction, orientation);
			}
		},
		subSlot(slot, 'ohic'),
	);

	const onMapChange = useStableCallback(
		(map: Map<Element, CompositeMetadata<any>>) => {
			if (map.size === 0 || hasSetDefaultIndexRef.current) {
				return;
			}
			hasSetDefaultIndexRef.current = true;
			const sortedElements = Array.from(map.keys()) as Array<HTMLElement | null>;
			const activeItem =
				sortedElements.find((compositeElement) =>
					compositeElement?.hasAttribute(ACTIVE_COMPOSITE_ITEM),
				) ?? null;
			const activeIndex = activeItem ? sortedElements.indexOf(activeItem) : -1;

			if (activeIndex !== -1) {
				onHighlightedIndexChange(activeIndex);
			} else if (
				isListIndexDisabled({ current: sortedElements }, highlightedIndex, disabledIndices)
			) {
				const firstEnabledIndex = findNonDisabledListIndex(
					{ current: sortedElements },
					{ disabledIndices },
				);
				if (!isIndexOutOfListBounds({ current: sortedElements }, firstEnabledIndex)) {
					onHighlightedIndexChange(firstEnabledIndex);
				}
			}

			scrollIntoViewIfNeeded(rootRef.current, activeItem, direction, orientation);
		},
		subSlot(slot, 'omc'),
	);

	useLayoutEffect(
		() => {
			if (
				disabledIndices == null ||
				externalHighlightedIndex != null ||
				!hasSetDefaultIndexRef.current
			) {
				return;
			}
			const elements = elementsRef.current;
			if (isListIndexDisabled(elementsRef, highlightedIndex, disabledIndices)) {
				const firstEnabledIndex = findNonDisabledListIndex(elementsRef, { disabledIndices });
				if (!isIndexOutOfListBounds({ current: elements }, firstEnabledIndex)) {
					onHighlightedIndexChange(firstEnabledIndex);
				}
			}
		},
		[
			disabledIndices,
			externalHighlightedIndex,
			highlightedIndex,
			elementsRef,
			onHighlightedIndexChange,
		],
		subSlot(slot, 'e:validate'),
	);

	const onKeyDown = useStableCallback(
		(event: any) => {
			const RELEVANT_KEYS = enableHomeAndEndKeys ? COMPOSITE_KEYS : ARROW_KEYS;
			if (!RELEVANT_KEYS.has(event.key)) {
				return;
			}
			if (isModifierKeySet(event, modifierKeys)) {
				return;
			}

			const element = rootRef.current;
			if (!element) {
				return;
			}

			const isRtl = direction === 'rtl';
			const horizontalForwardKey = isRtl ? ARROW_LEFT : ARROW_RIGHT;
			const forwardKey = {
				horizontal: horizontalForwardKey,
				vertical: ARROW_DOWN,
				both: horizontalForwardKey,
			}[orientation];
			const horizontalBackwardKey = isRtl ? ARROW_RIGHT : ARROW_LEFT;
			const backwardKey = {
				horizontal: horizontalBackwardKey,
				vertical: ARROW_UP,
				both: horizontalBackwardKey,
			}[orientation];

			// octane: the handler already receives the native event.
			const target = getTarget(event);
			if (target != null && isNativeInput(target) && !isElementDisabled(target as HTMLElement)) {
				const input = target as HTMLInputElement;
				const selectionStart = input.selectionStart;
				const selectionEnd = input.selectionEnd;
				const textContent = input.value ?? '';
				if (selectionStart == null || event.shiftKey || selectionStart !== selectionEnd) {
					return;
				}
				if (event.key !== backwardKey && selectionStart < textContent.length) {
					return;
				}
				if (event.key !== forwardKey && selectionStart > 0) {
					return;
				}
			}

			let nextIndex = highlightedIndex;
			const minIndex = getMinListIndex(elementsRef, disabledIndices);
			const maxIndex = getMaxListIndex(elementsRef, disabledIndices);

			if (grid != null) {
				nextIndex = grid({
					disabledIndices,
					elementsRef,
					event,
					highlightedIndex,
					loopFocus,
					maxIndex,
					minIndex,
					onLoop: (e: any, prev: number, next: number) =>
						onLoop ? onLoop(e, prev, next, elementsRef) : next,
					orientation,
					rtl: isRtl,
				});
			}

			const forwardKeys = {
				horizontal: [horizontalForwardKey],
				vertical: [ARROW_DOWN],
				both: [horizontalForwardKey, ARROW_DOWN],
			}[orientation];
			const backwardKeys = {
				horizontal: [horizontalBackwardKey],
				vertical: [ARROW_UP],
				both: [horizontalBackwardKey, ARROW_UP],
			}[orientation];

			const preventedKeys = isGrid
				? RELEVANT_KEYS
				: {
						horizontal: enableHomeAndEndKeys ? HORIZONTAL_KEYS_WITH_EXTRA_KEYS : HORIZONTAL_KEYS,
						vertical: enableHomeAndEndKeys ? VERTICAL_KEYS_WITH_EXTRA_KEYS : VERTICAL_KEYS,
						both: RELEVANT_KEYS,
					}[orientation];

			if (enableHomeAndEndKeys) {
				if (event.key === HOME) {
					nextIndex = minIndex;
				} else if (event.key === END) {
					nextIndex = maxIndex;
				}
			}

			if (
				nextIndex === highlightedIndex &&
				(forwardKeys.includes(event.key) || backwardKeys.includes(event.key))
			) {
				if (loopFocus && nextIndex === maxIndex && forwardKeys.includes(event.key)) {
					nextIndex = minIndex;
					if (onLoop) {
						nextIndex = onLoop(event, highlightedIndex, nextIndex, elementsRef);
					}
				} else if (loopFocus && nextIndex === minIndex && backwardKeys.includes(event.key)) {
					nextIndex = maxIndex;
					if (onLoop) {
						nextIndex = onLoop(event, highlightedIndex, nextIndex, elementsRef);
					}
				} else {
					nextIndex = findNonDisabledListIndex(elementsRef, {
						startingIndex: nextIndex,
						decrement: backwardKeys.includes(event.key),
						disabledIndices,
					});
				}
			}

			if (nextIndex !== highlightedIndex && !isIndexOutOfListBounds(elementsRef, nextIndex)) {
				if (stopEventPropagation) {
					event.stopPropagation();
				}
				if (preventedKeys.has(event.key)) {
					event.preventDefault();
				}
				onHighlightedIndexChange(nextIndex, true);

				// Wait for FocusManager `returnFocus` to execute.
				queueMicrotask(() => {
					elementsRef.current[nextIndex]?.focus();
				});
			}
		},
		subSlot(slot, 'okd'),
	);

	const props: Record<string, any> = {
		ref: mergedRef,
		onFocus(event: any) {
			const element = rootRef.current;
			const target = getTarget(event);
			if (!element || target == null || !isNativeInput(target)) {
				return;
			}
			const input = target as HTMLInputElement;
			input.setSelectionRange(0, input.value.length ?? 0);
		},
		onKeyDown,
	};

	return {
		props,
		highlightedIndex,
		onHighlightedIndexChange,
		elementsRef,
		disabledIndices,
		onMapChange,
		relayKeyboardEvent: onKeyDown,
	};
}
