// Ported from @floating-ui/react useListNavigation — arrow-key navigation of a
// list (real or virtual focus, incl. grid). octane events are NATIVE, so the React
// `event.nativeEvent` accesses become `event`.
import { isHTMLElement } from '@floating-ui/utils/dom';
import { useCallback, useMemo, useRef, useState } from 'octane';

import { splitSlot, subSlot } from './internal';
import { useFloatingParentNodeId, useFloatingTree } from './tree';
import {
	activeElement,
	contains,
	createGridCellMap,
	enqueueFocus,
	findNonDisabledListIndex,
	getDeepestNode,
	getDocument,
	getFloatingFocusElement,
	getGridCellIndexOfCorner,
	getGridCellIndices,
	getGridNavigatedIndex,
	getMaxListIndex,
	getMinListIndex,
	isIndexOutOfListBounds,
	isListIndexDisabled,
	isTypeableCombobox,
	isVirtualClick,
	isVirtualPointerEvent,
	stopEvent,
	useEffectEvent,
	useLatestRef,
	useModernLayoutEffect,
} from './utils';
import type { Dimensions } from '@floating-ui/dom';
import type { ElementProps, FloatingRootContext, MutableRefObject } from './types';

export interface UseListNavigationProps {
	/**
	 * A ref that holds an array of list items.
	 * @default empty list
	 */
	listRef: MutableRefObject<Array<HTMLElement | null>>;
	/**
	 * The index of the currently active (focused or highlighted) item, which may
	 * or may not be selected.
	 * @default null
	 */
	activeIndex: number | null;
	/**
	 * A callback that is called when the user navigates to a new active item,
	 * passed in a new `activeIndex`.
	 */
	onNavigate?: (activeIndex: number | null) => void;
	/**
	 * Whether the Hook is enabled, including all internal Effects and event
	 * handlers.
	 * @default true
	 */
	enabled?: boolean;
	/**
	 * The currently selected item index, which may or may not be active.
	 * @default null
	 */
	selectedIndex?: number | null;
	/**
	 * Whether to focus the item upon opening the floating element. 'auto' infers
	 * what to do based on the input type (keyboard vs. pointer), while a boolean
	 * value will force the value.
	 * @default 'auto'
	 */
	focusItemOnOpen?: boolean | 'auto';
	/**
	 * Whether hovering an item synchronizes the focus.
	 * @default true
	 */
	focusItemOnHover?: boolean;
	/**
	 * Whether pressing an arrow key on the navigation’s main axis opens the
	 * floating element.
	 * @default true
	 */
	openOnArrowKeyDown?: boolean;
	/**
	 * By default elements with either a `disabled` or `aria-disabled` attribute
	 * are skipped in the list navigation — however, this requires the items to
	 * be rendered.
	 * This prop allows you to manually specify indices which should be disabled,
	 * overriding the default logic.
	 * For Windows-style select menus, where the menu does not open when
	 * navigating via arrow keys, specify an empty array.
	 * @default undefined
	 */
	disabledIndices?: Array<number> | ((index: number) => boolean);
	/**
	 * Determines whether focus can escape the list, such that nothing is selected
	 * after navigating beyond the boundary of the list. In some
	 * autocomplete/combobox components, this may be desired, as screen
	 * readers will return to the input.
	 * `loop` must be `true`.
	 * @default false
	 */
	allowEscape?: boolean;
	/**
	 * Determines whether focus should loop around when navigating past the first
	 * or last item.
	 * @default false
	 */
	loop?: boolean;
	/**
	 * If the list is nested within another one (e.g. a nested submenu), the
	 * navigation semantics change.
	 * @default false
	 */
	nested?: boolean;
	/**
	 * Allows to specify the orientation of the parent list, which is used to
	 * determine the direction of the navigation.
	 * This is useful when list navigation is used within a Composite,
	 * as the hook can't determine the orientation of the parent list automatically.
	 */
	parentOrientation?: UseListNavigationProps['orientation'];
	/**
	 * Whether the direction of the floating element’s navigation is in RTL
	 * layout.
	 * @default false
	 */
	rtl?: boolean;
	/**
	 * Whether the focus is virtual (using `aria-activedescendant`).
	 * Use this if you need focus to remain on the reference element
	 * (such as an input), but allow arrow keys to navigate list items.
	 * This is common in autocomplete listbox components.
	 * Your virtually-focused list items must have a unique `id` set on them.
	 * If you’re using a component role with the `useRole()` Hook, then an `id` is
	 * generated automatically.
	 * @default false
	 */
	virtual?: boolean;
	/**
	 * The orientation in which navigation occurs.
	 * @default 'vertical'
	 */
	orientation?: 'vertical' | 'horizontal' | 'both';
	/**
	 * Specifies how many columns the list has (i.e., it’s a grid). Use an
	 * orientation of 'horizontal' (e.g. for an emoji picker/date picker, where
	 * pressing ArrowRight or ArrowLeft can change rows), or 'both' (where the
	 * current row cannot be escaped with ArrowRight or ArrowLeft, only ArrowUp
	 * and ArrowDown).
	 * @default 1
	 */
	cols?: number;
	/**
	 * Whether to scroll the active item into view when navigating. The default
	 * value uses nearest options.
	 */
	scrollItemIntoView?: boolean | ScrollIntoViewOptions;
	/**
	 * When using virtual focus management, this holds a ref to the
	 * virtually-focused item. This allows nested virtual navigation to be
	 * enabled, and lets you know when a nested element is virtually focused from
	 * the root reference handling the events. Requires `FloatingTree` to be
	 * setup.
	 */
	virtualItemRef?: MutableRefObject<HTMLElement | null>;
	/**
	 * Only for `cols > 1`, specify sizes for grid items.
	 * `{ width: 2, height: 2 }` means an item is 2 columns wide and 2 rows tall.
	 */
	itemSizes?: Dimensions[];
	/**
	 * Only relevant for `cols > 1` and items with different sizes, specify if
	 * the grid is dense (as defined in the CSS spec for `grid-auto-flow`).
	 * @default false
	 */
	dense?: boolean;
}

const ARROW_UP = 'ArrowUp';
const ARROW_DOWN = 'ArrowDown';
const ARROW_LEFT = 'ArrowLeft';
const ARROW_RIGHT = 'ArrowRight';
const ESCAPE = 'Escape';

function doSwitch(orientation: any, vertical: boolean, horizontal: boolean) {
	switch (orientation) {
		case 'vertical':
			return vertical;
		case 'horizontal':
			return horizontal;
		default:
			return vertical || horizontal;
	}
}
function isMainOrientationKey(key: string, orientation: any) {
	const vertical = key === ARROW_UP || key === ARROW_DOWN;
	const horizontal = key === ARROW_LEFT || key === ARROW_RIGHT;
	return doSwitch(orientation, vertical, horizontal);
}
function isMainOrientationToEndKey(key: string, orientation: any, rtl: boolean) {
	const vertical = key === ARROW_DOWN;
	const horizontal = rtl ? key === ARROW_LEFT : key === ARROW_RIGHT;
	return (
		doSwitch(orientation, vertical, horizontal) || key === 'Enter' || key === ' ' || key === ''
	);
}
function isCrossOrientationOpenKey(key: string, orientation: any, rtl: boolean) {
	const vertical = rtl ? key === ARROW_LEFT : key === ARROW_RIGHT;
	const horizontal = key === ARROW_DOWN;
	return doSwitch(orientation, vertical, horizontal);
}
function isCrossOrientationCloseKey(key: string, orientation: any, rtl: boolean, cols?: number) {
	const vertical = rtl ? key === ARROW_RIGHT : key === ARROW_LEFT;
	const horizontal = key === ARROW_UP;
	if (orientation === 'both' || (orientation === 'horizontal' && cols && cols > 1)) {
		return key === ESCAPE;
	}
	return doSwitch(orientation, vertical, horizontal);
}

/**
 * Adds arrow key-based navigation of a list of items, either using real DOM
 * focus or virtual focus.
 * @see https://floating-ui.com/docs/useListNavigation
 */
export function useListNavigation(
	context: FloatingRootContext,
	props: UseListNavigationProps,
	slot?: symbol,
): ElementProps;
export function useListNavigation(...args: any[]): ElementProps {
	const [user, slot] = splitSlot(args);
	const context = user[0] as FloatingRootContext;
	const props = (user[1] as UseListNavigationProps) ?? {};

	const open = context.open;
	const onOpenChange = context.onOpenChange;
	const elements = context.elements;
	const floatingId = context.floatingId;

	const listRef = props.listRef;
	const activeIndex = props.activeIndex;
	const unstableOnNavigate = props.onNavigate ?? (() => {});
	const enabled = props.enabled ?? true;
	const selectedIndex = props.selectedIndex ?? null;
	const allowEscape = props.allowEscape ?? false;
	const loop = props.loop ?? false;
	const nested = props.nested ?? false;
	const rtl = props.rtl ?? false;
	const virtual = props.virtual ?? false;
	const focusItemOnOpen = props.focusItemOnOpen ?? 'auto';
	const focusItemOnHover = props.focusItemOnHover ?? true;
	const openOnArrowKeyDown = props.openOnArrowKeyDown ?? true;
	const disabledIndices = props.disabledIndices ?? undefined;
	const orientation = props.orientation ?? 'vertical';
	const parentOrientation = props.parentOrientation;
	const cols = props.cols ?? 1;
	const scrollItemIntoView = props.scrollItemIntoView ?? true;
	const virtualItemRef = props.virtualItemRef;
	const itemSizes = props.itemSizes;
	const dense = props.dense ?? false;

	const floatingFocusElement = getFloatingFocusElement(elements.floating);
	const floatingFocusElementRef = useLatestRef(floatingFocusElement, subSlot(slot, 'ffer'));
	const parentId = useFloatingParentNodeId();
	const tree = useFloatingTree();

	useModernLayoutEffect(
		() => {
			context.dataRef.current.orientation = orientation;
		},
		[context, orientation],
		subSlot(slot, 'e:orient'),
	);

	const onNavigate = useEffectEvent(
		() => {
			unstableOnNavigate(indexRef.current === -1 ? null : indexRef.current);
		},
		subSlot(slot, 'nav'),
	);

	const typeableComboboxReference = isTypeableCombobox(elements.domReference);
	const focusItemOnOpenRef = useRef(focusItemOnOpen, subSlot(slot, 'fioo'));
	const indexRef = useRef(selectedIndex != null ? selectedIndex : -1, subSlot(slot, 'index'));
	const keyRef = useRef<string | null>(null, subSlot(slot, 'key'));
	const isPointerModalityRef = useRef(true, subSlot(slot, 'pm'));
	const previousOnNavigateRef = useRef(onNavigate, subSlot(slot, 'ponav'));
	const previousMountedRef = useRef(!!elements.floating, subSlot(slot, 'pmount'));
	const previousOpenRef = useRef(open, subSlot(slot, 'popen'));
	const forceSyncFocusRef = useRef(false, subSlot(slot, 'fsf'));
	const forceScrollIntoViewRef = useRef(false, subSlot(slot, 'fsiv'));
	const disabledIndicesRef = useLatestRef(disabledIndices, subSlot(slot, 'dir'));
	const latestOpenRef = useLatestRef(open, subSlot(slot, 'lor'));
	const scrollItemIntoViewRef = useLatestRef(scrollItemIntoView, subSlot(slot, 'siir'));
	const selectedIndexRef = useLatestRef(selectedIndex, subSlot(slot, 'sir'));
	const [activeId, setActiveId] = useState<string | undefined>(undefined, subSlot(slot, 'aid'));
	const [virtualId, setVirtualId] = useState<string | undefined>(undefined, subSlot(slot, 'vid'));

	const focusItem = useEffectEvent(
		() => {
			function runFocus(item: any) {
				if (virtual) {
					if (item.id?.endsWith('-fui-option')) {
						item.id = floatingId + '-' + Math.random().toString(16).slice(2, 10);
					}
					setActiveId(item.id);
					tree?.events.emit('virtualfocus', item);
					if (virtualItemRef) {
						virtualItemRef.current = item;
					}
				} else {
					enqueueFocus(item, { sync: forceSyncFocusRef.current, preventScroll: true });
				}
			}
			const initialItem = listRef.current[indexRef.current];
			const forceScrollIntoView = forceScrollIntoViewRef.current;
			if (initialItem) {
				runFocus(initialItem);
			}
			const scheduler = forceSyncFocusRef.current ? (v: any) => v() : requestAnimationFrame;
			scheduler(() => {
				const waitedItem = listRef.current[indexRef.current] || initialItem;
				if (!waitedItem) return;
				if (!initialItem) {
					runFocus(waitedItem);
				}
				const scrollIntoViewOptions = scrollItemIntoViewRef.current;
				const shouldScrollIntoView =
					scrollIntoViewOptions &&
					waitedItem &&
					(forceScrollIntoView || !isPointerModalityRef.current);
				if (shouldScrollIntoView) {
					waitedItem.scrollIntoView?.(
						typeof scrollIntoViewOptions === 'boolean'
							? { block: 'nearest', inline: 'nearest' }
							: scrollIntoViewOptions,
					);
				}
			});
		},
		subSlot(slot, 'focusitem'),
	);

	useModernLayoutEffect(
		() => {
			if (!enabled) return;
			if (open && elements.floating) {
				if (focusItemOnOpenRef.current && selectedIndex != null) {
					forceScrollIntoViewRef.current = true;
					indexRef.current = selectedIndex;
					onNavigate();
				}
			} else if (previousMountedRef.current) {
				indexRef.current = -1;
				previousOnNavigateRef.current();
			}
		},
		[enabled, open, elements.floating, selectedIndex, onNavigate],
		subSlot(slot, 'e:syncsel'),
	);

	useModernLayoutEffect(
		() => {
			if (!enabled) return;
			if (!open) return;
			if (!elements.floating) return;
			if (activeIndex == null) {
				forceSyncFocusRef.current = false;
				if (selectedIndexRef.current != null) {
					return;
				}
				if (previousMountedRef.current) {
					indexRef.current = -1;
					focusItem();
				}
				if (
					(!previousOpenRef.current || !previousMountedRef.current) &&
					focusItemOnOpenRef.current &&
					(keyRef.current != null ||
						(focusItemOnOpenRef.current === true && keyRef.current == null))
				) {
					let runs = 0;
					const waitForListPopulated = () => {
						if (listRef.current[0] == null) {
							if (runs < 2) {
								const scheduler = runs ? requestAnimationFrame : queueMicrotask;
								scheduler(waitForListPopulated);
							}
							runs++;
						} else {
							indexRef.current =
								keyRef.current == null ||
								isMainOrientationToEndKey(keyRef.current, orientation, rtl) ||
								nested
									? getMinListIndex(listRef, disabledIndicesRef.current)
									: getMaxListIndex(listRef, disabledIndicesRef.current);
							keyRef.current = null;
							onNavigate();
						}
					};
					waitForListPopulated();
				}
			} else if (!isIndexOutOfListBounds(listRef, activeIndex)) {
				indexRef.current = activeIndex;
				focusItem();
				forceScrollIntoViewRef.current = false;
			}
		},
		[
			enabled,
			open,
			elements.floating,
			activeIndex,
			selectedIndexRef,
			nested,
			listRef,
			orientation,
			rtl,
			onNavigate,
			focusItem,
			disabledIndicesRef,
		],
		subSlot(slot, 'e:syncactive'),
	);

	useModernLayoutEffect(
		() => {
			if (!enabled || elements.floating || !tree || virtual || !previousMountedRef.current) {
				return;
			}
			const nodes = tree.nodesRef.current;
			const parent = nodes.find((node: any) => node.id === parentId)?.context?.elements.floating;
			const activeEl = activeElement(getDocument(elements.floating));
			const treeContainsActiveEl = nodes.some(
				(node: any) => node.context && contains(node.context.elements.floating, activeEl as any),
			);
			if (parent && !treeContainsActiveEl && isPointerModalityRef.current) {
				parent.focus({ preventScroll: true });
			}
		},
		[enabled, elements.floating, tree, parentId, virtual],
		subSlot(slot, 'e:parentfocus'),
	);

	useModernLayoutEffect(
		() => {
			if (!enabled) return;
			if (!tree) return;
			if (!virtual) return;
			if (parentId) return;
			function handleVirtualFocus(item: any) {
				setVirtualId(item.id);
				if (virtualItemRef) {
					virtualItemRef.current = item;
				}
			}
			tree.events.on('virtualfocus', handleVirtualFocus);
			return () => {
				tree.events.off('virtualfocus', handleVirtualFocus);
			};
		},
		[enabled, tree, virtual, parentId, virtualItemRef],
		subSlot(slot, 'e:vfocus'),
	);

	useModernLayoutEffect(
		() => {
			previousOnNavigateRef.current = onNavigate;
			previousOpenRef.current = open;
			previousMountedRef.current = !!elements.floating;
		},
		undefined,
		subSlot(slot, 'e:prev'),
	);

	useModernLayoutEffect(
		() => {
			if (!open) {
				keyRef.current = null;
				focusItemOnOpenRef.current = focusItemOnOpen;
			}
		},
		[open, focusItemOnOpen],
		subSlot(slot, 'e:closekey'),
	);

	const hasActiveIndex = activeIndex != null;
	const item = useMemo(
		() => {
			function syncCurrentTarget(currentTarget: any) {
				if (!latestOpenRef.current) return;
				const index = listRef.current.indexOf(currentTarget);
				if (index !== -1 && indexRef.current !== index) {
					indexRef.current = index;
					onNavigate();
				}
			}
			return {
				onFocus(_ref: any) {
					const { currentTarget } = _ref;
					forceSyncFocusRef.current = true;
					syncCurrentTarget(currentTarget);
				},
				onClick: (_ref2: any) => _ref2.currentTarget.focus({ preventScroll: true }),
				onMouseMove(_ref3: any) {
					const { currentTarget } = _ref3;
					forceSyncFocusRef.current = true;
					forceScrollIntoViewRef.current = false;
					if (focusItemOnHover) {
						syncCurrentTarget(currentTarget);
					}
				},
				onPointerLeave(_ref4: any) {
					const { pointerType } = _ref4;
					if (!isPointerModalityRef.current || pointerType === 'touch') {
						return;
					}
					forceSyncFocusRef.current = true;
					if (!focusItemOnHover) {
						return;
					}
					indexRef.current = -1;
					onNavigate();
					if (!virtual) {
						floatingFocusElementRef.current?.focus({ preventScroll: true });
					}
				},
			};
		},
		[latestOpenRef, floatingFocusElementRef, focusItemOnHover, listRef, onNavigate, virtual],
		subSlot(slot, 'm:item'),
	);

	const getParentOrientation = useCallback(
		() =>
			parentOrientation != null
				? parentOrientation
				: tree?.nodesRef.current.find((node: any) => node.id === parentId)?.context?.dataRef
						?.current.orientation,
		[parentId, tree, parentOrientation],
		subSlot(slot, 'cb:porient'),
	);

	const commonOnKeyDown = useEffectEvent(
		(event: any) => {
			isPointerModalityRef.current = false;
			forceSyncFocusRef.current = true;

			if (event.which === 229) {
				return;
			}
			if (!latestOpenRef.current && event.currentTarget === floatingFocusElementRef.current) {
				return;
			}
			if (nested && isCrossOrientationCloseKey(event.key, orientation, rtl, cols)) {
				if (!isMainOrientationKey(event.key, getParentOrientation())) {
					stopEvent(event);
				}
				onOpenChange(false, event, 'list-navigation');
				if (isHTMLElement(elements.domReference)) {
					if (virtual) {
						tree?.events.emit('virtualfocus', elements.domReference);
					} else {
						elements.domReference.focus();
					}
				}
				return;
			}
			const currentIndex = indexRef.current;
			const minIndex = getMinListIndex(listRef, disabledIndices);
			const maxIndex = getMaxListIndex(listRef, disabledIndices);
			if (!typeableComboboxReference) {
				if (event.key === 'Home') {
					stopEvent(event);
					indexRef.current = minIndex;
					onNavigate();
				}
				if (event.key === 'End') {
					stopEvent(event);
					indexRef.current = maxIndex;
					onNavigate();
				}
			}

			if (cols > 1) {
				const sizes =
					itemSizes ||
					Array.from({ length: listRef.current.length }, () => ({ width: 1, height: 1 }));
				const cellMap = createGridCellMap(sizes, cols, dense);
				const minGridIndex = cellMap.findIndex(
					(index) => index != null && !isListIndexDisabled(listRef, index, disabledIndices),
				);
				const maxGridIndex = cellMap.reduce<number>(
					(foundIndex, index, cellIndex) =>
						index != null && !isListIndexDisabled(listRef, index, disabledIndices)
							? cellIndex
							: foundIndex,
					-1,
				);
				const index =
					cellMap[
						getGridNavigatedIndex(
							{
								current: cellMap.map((itemIndex) =>
									itemIndex != null ? listRef.current[itemIndex] : null,
								),
							},
							{
								event,
								orientation,
								loop,
								rtl,
								cols,
								disabledIndices: getGridCellIndices(
									[
										...((typeof disabledIndices !== 'function' ? disabledIndices : null) ||
											listRef.current.map((_: any, index: number) =>
												isListIndexDisabled(listRef, index, disabledIndices) ? index : undefined,
											)),
										undefined,
									],
									cellMap,
								),
								minIndex: minGridIndex,
								maxIndex: maxGridIndex,
								prevIndex: getGridCellIndexOfCorner(
									indexRef.current > maxIndex ? minIndex : indexRef.current,
									sizes,
									cellMap,
									cols,
									event.key === ARROW_DOWN
										? 'bl'
										: event.key === (rtl ? ARROW_LEFT : ARROW_RIGHT)
											? 'tr'
											: 'tl',
								),
								stopEvent: true,
							},
						)
					];
				if (index != null) {
					indexRef.current = index;
					onNavigate();
				}
				if (orientation === 'both') {
					return;
				}
			}
			if (isMainOrientationKey(event.key, orientation)) {
				stopEvent(event);
				if (
					open &&
					!virtual &&
					activeElement(event.currentTarget.ownerDocument) === event.currentTarget
				) {
					indexRef.current = isMainOrientationToEndKey(event.key, orientation, rtl)
						? minIndex
						: maxIndex;
					onNavigate();
					return;
				}
				if (isMainOrientationToEndKey(event.key, orientation, rtl)) {
					if (loop) {
						indexRef.current =
							currentIndex >= maxIndex
								? allowEscape && currentIndex !== listRef.current.length
									? -1
									: minIndex
								: findNonDisabledListIndex(listRef, {
										startingIndex: currentIndex,
										disabledIndices,
									});
					} else {
						indexRef.current = Math.min(
							maxIndex,
							findNonDisabledListIndex(listRef, { startingIndex: currentIndex, disabledIndices }),
						);
					}
				} else {
					if (loop) {
						indexRef.current =
							currentIndex <= minIndex
								? allowEscape && currentIndex !== -1
									? listRef.current.length
									: maxIndex
								: findNonDisabledListIndex(listRef, {
										startingIndex: currentIndex,
										decrement: true,
										disabledIndices,
									});
					} else {
						indexRef.current = Math.max(
							minIndex,
							findNonDisabledListIndex(listRef, {
								startingIndex: currentIndex,
								decrement: true,
								disabledIndices,
							}),
						);
					}
				}
				if (isIndexOutOfListBounds(listRef, indexRef.current)) {
					indexRef.current = -1;
				}
				onNavigate();
			}
		},
		subSlot(slot, 'common'),
	);

	const ariaActiveDescendantProp = useMemo(
		() => virtual && open && hasActiveIndex && { 'aria-activedescendant': virtualId || activeId },
		[virtual, open, hasActiveIndex, virtualId, activeId],
		subSlot(slot, 'm:aad'),
	);

	const floating = useMemo(
		() => ({
			'aria-orientation': orientation === 'both' ? undefined : orientation,
			...(!typeableComboboxReference ? ariaActiveDescendantProp : {}),
			onKeyDown: commonOnKeyDown,
			onPointerMove() {
				isPointerModalityRef.current = true;
			},
		}),
		[ariaActiveDescendantProp, commonOnKeyDown, orientation, typeableComboboxReference],
		subSlot(slot, 'm:flo'),
	);

	const reference = useMemo(
		() => {
			function checkVirtualMouse(event: any) {
				if (focusItemOnOpen === 'auto' && isVirtualClick(event)) {
					focusItemOnOpenRef.current = true;
				}
			}
			function checkVirtualPointer(event: any) {
				focusItemOnOpenRef.current = focusItemOnOpen;
				if (focusItemOnOpen === 'auto' && isVirtualPointerEvent(event)) {
					focusItemOnOpenRef.current = true;
				}
			}
			return {
				...ariaActiveDescendantProp,
				onKeyDown(event: any) {
					isPointerModalityRef.current = false;
					const isArrowKey = event.key.startsWith('Arrow');
					const isHomeOrEndKey = ['Home', 'End'].includes(event.key);
					const isMoveKey = isArrowKey || isHomeOrEndKey;
					const isCrossOpenKey = isCrossOrientationOpenKey(event.key, orientation, rtl);
					const isCrossCloseKey = isCrossOrientationCloseKey(event.key, orientation, rtl, cols);
					const isParentCrossOpenKey = isCrossOrientationOpenKey(
						event.key,
						getParentOrientation(),
						rtl,
					);
					const isMainKey = isMainOrientationKey(event.key, orientation);
					const isNavigationKey =
						(nested ? isParentCrossOpenKey : isMainKey) ||
						event.key === 'Enter' ||
						event.key.trim() === '';
					if (virtual && open) {
						const rootNode = tree?.nodesRef.current.find((node: any) => node.parentId == null);
						const deepestNode =
							tree && rootNode ? getDeepestNode(tree.nodesRef.current, rootNode.id) : null;
						if (isMoveKey && deepestNode && virtualItemRef) {
							const eventObject = new KeyboardEvent('keydown', {
								key: event.key,
								bubbles: true,
							});
							if (isCrossOpenKey || isCrossCloseKey) {
								const isCurrentTarget =
									deepestNode.context?.elements.domReference === event.currentTarget;
								const dispatchItem =
									isCrossCloseKey && !isCurrentTarget
										? deepestNode.context?.elements.domReference
										: isCrossOpenKey
											? listRef.current.find((item: any) => item?.id === activeId)
											: null;
								if (dispatchItem) {
									stopEvent(event);
									dispatchItem.dispatchEvent(eventObject);
									setVirtualId(undefined);
								}
							}
							if ((isMainKey || isHomeOrEndKey) && deepestNode.context) {
								if (
									deepestNode.context.open &&
									deepestNode.parentId &&
									event.currentTarget !== deepestNode.context.elements.domReference
								) {
									stopEvent(event);
									deepestNode.context.elements.domReference?.dispatchEvent(eventObject);
									return;
								}
							}
						}
						return commonOnKeyDown(event);
					}
					if (!open && !openOnArrowKeyDown && isArrowKey) {
						return;
					}
					if (isNavigationKey) {
						const isParentMainKey = isMainOrientationKey(event.key, getParentOrientation());
						keyRef.current = nested && isParentMainKey ? null : event.key;
					}
					if (nested) {
						if (isParentCrossOpenKey) {
							stopEvent(event);
							if (open) {
								indexRef.current = getMinListIndex(listRef, disabledIndicesRef.current);
								onNavigate();
							} else {
								onOpenChange(true, event, 'list-navigation');
							}
						}
						return;
					}
					if (isMainKey) {
						if (selectedIndex != null) {
							indexRef.current = selectedIndex;
						}
						stopEvent(event);
						if (!open && openOnArrowKeyDown) {
							onOpenChange(true, event, 'list-navigation');
						} else {
							commonOnKeyDown(event);
						}
						if (open) {
							onNavigate();
						}
					}
				},
				onFocus() {
					if (open && !virtual) {
						indexRef.current = -1;
						onNavigate();
					}
				},
				onPointerDown: checkVirtualPointer,
				onPointerEnter: checkVirtualPointer,
				onMouseDown: checkVirtualMouse,
				onClick: checkVirtualMouse,
			};
		},
		[
			activeId,
			ariaActiveDescendantProp,
			cols,
			commonOnKeyDown,
			disabledIndicesRef,
			focusItemOnOpen,
			listRef,
			nested,
			onNavigate,
			onOpenChange,
			open,
			openOnArrowKeyDown,
			orientation,
			getParentOrientation,
			rtl,
			selectedIndex,
			tree,
			virtual,
			virtualItemRef,
		],
		subSlot(slot, 'm:ref'),
	);

	return useMemo<ElementProps>(
		() => (enabled ? { reference, floating, item } : {}),
		[enabled, reference, floating, item],
		subSlot(slot, 'm:ret'),
	);
}
