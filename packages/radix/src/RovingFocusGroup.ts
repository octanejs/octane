// Ported from @radix-ui/react-roving-focus. A single-tab-stop group: one item holds
// `tabIndex=0` (the roving stop) and arrow keys move focus between items per
// orientation/direction, with optional looping; tabbing into the group enters at the
// active/current item (the `rovingFocusGroup.onEntryFocus` custom event, preventable).
// Built on the Collection primitive; used by ToggleGroup / Tabs / Toolbar / RadioGroup.
import { createElement, useCallback, useEffect, useEffectEvent, useRef, useState } from 'octane';

import { createCollection } from './collection';
import { composeEventHandlers } from './compose-event-handlers';
import { useComposedRefs } from './compose-refs';
import { createContextScope } from './context';
import { S, subSlot } from './internal';
import { Primitive } from './Primitive';
import { useControllableState } from './useControllableState';
import { useId } from './useId';

const ENTRY_FOCUS = 'rovingFocusGroup.onEntryFocus';
const EVENT_OPTIONS = { bubbles: false, cancelable: true };

const [Collection, useCollection, createCollectionScope] = createCollection('RovingFocusGroup');
export const [createRovingFocusGroupContext, createRovingFocusGroupScope] = createContextScope(
	'RovingFocusGroup',
	[createCollectionScope],
);
interface RovingContextValue {
	orientation?: 'horizontal' | 'vertical';
	dir: 'ltr' | 'rtl';
	loop: boolean;
	currentTabStopId: string | null;
	onItemFocus: (tabStopId: string) => void;
	onItemShiftTab: () => void;
	onFocusableItemAdd: () => void;
	onFocusableItemRemove: () => void;
}
const [RovingFocusProvider, useRovingFocusContext] =
	createRovingFocusGroupContext<RovingContextValue>('RovingFocusGroup');

export function Root(props: any): any {
	return createElement(Collection.Provider, {
		scope: props?.__scopeRovingFocusGroup,
		children: createElement(Collection.Slot, {
			scope: props?.__scopeRovingFocusGroup,
			children: createElement(RovingFocusGroupImpl, props),
		}),
	});
}

function RovingFocusGroupImpl(props: any): any {
	const slot = S('RovingFocusGroupImpl');
	const {
		__scopeRovingFocusGroup,
		orientation,
		loop = false,
		dir,
		currentTabStopId: currentTabStopIdProp,
		defaultCurrentTabStopId,
		onCurrentTabStopIdChange,
		onEntryFocus,
		preventScrollOnEntryFocus = false,
		ref: forwardedRef,
		...groupProps
	} = props ?? {};
	const ref = useRef<HTMLElement | null>(null, subSlot(slot, 'ref'));
	const composedRefs = useComposedRefs(forwardedRef, ref, subSlot(slot, 'refs'));
	const direction: 'ltr' | 'rtl' = dir === 'rtl' ? 'rtl' : 'ltr';
	const [currentTabStopId, setCurrentTabStopId] = useControllableState<string | null>(
		{
			prop: currentTabStopIdProp,
			defaultProp: defaultCurrentTabStopId ?? null,
			onChange: onCurrentTabStopIdChange,
		},
		subSlot(slot, 'stop'),
	);
	const [isTabbingBackOut, setIsTabbingBackOut] = useState(false, subSlot(slot, 'backout'));
	const handleEntryFocus = useEffectEvent(onEntryFocus ?? (() => {}), subSlot(slot, 'entry'));
	const getItems = useCollection(__scopeRovingFocusGroup, subSlot(slot, 'items'));
	const isClickFocusRef = useRef(false, subSlot(slot, 'clickFocus'));
	const [focusableItemsCount, setFocusableItemsCount] = useState(0, subSlot(slot, 'count'));

	useEffect(
		() => {
			const node = ref.current;
			if (node) {
				node.addEventListener(ENTRY_FOCUS, handleEntryFocus);
				return () => node.removeEventListener(ENTRY_FOCUS, handleEntryFocus);
			}
		},
		[],
		subSlot(slot, 'e:entry'),
	);

	return createElement(RovingFocusProvider, {
		scope: __scopeRovingFocusGroup,
		orientation,
		dir: direction,
		loop,
		currentTabStopId,
		onItemFocus: useCallback(
			(tabStopId: string) => setCurrentTabStopId(tabStopId),
			[setCurrentTabStopId],
			subSlot(slot, 'onFocus'),
		),
		onItemShiftTab: useCallback(() => setIsTabbingBackOut(true), [], subSlot(slot, 'shiftTab')),
		onFocusableItemAdd: useCallback(
			() => setFocusableItemsCount((prev: number) => prev + 1),
			[],
			subSlot(slot, 'add'),
		),
		onFocusableItemRemove: useCallback(
			() => setFocusableItemsCount((prev: number) => prev - 1),
			[],
			subSlot(slot, 'remove'),
		),
		children: createElement(Primitive.div, {
			tabIndex: isTabbingBackOut || focusableItemsCount === 0 ? -1 : 0,
			'data-orientation': orientation,
			...groupProps,
			ref: composedRefs,
			style: { outline: 'none', ...props.style },
			onMouseDown: composeEventHandlers(props.onMouseDown, () => {
				isClickFocusRef.current = true;
			}),
			onFocus: composeEventHandlers(props.onFocus, (event: FocusEvent) => {
				// Tabbing INTO the group (not clicking) enters at the best candidate item.
				const isKeyboardFocus = !isClickFocusRef.current;
				if (event.target === event.currentTarget && isKeyboardFocus && !isTabbingBackOut) {
					const entryFocusEvent = new CustomEvent(ENTRY_FOCUS, EVENT_OPTIONS);
					(event.currentTarget as HTMLElement).dispatchEvent(entryFocusEvent);
					if (!entryFocusEvent.defaultPrevented) {
						const items = getItems().filter((item: any) => item.focusable);
						const activeItem = items.find((item: any) => item.active);
						const currentItem = items.find((item: any) => item.id === currentTabStopId);
						const candidateItems = [activeItem, currentItem, ...items].filter(Boolean);
						const candidateNodes = candidateItems.map((item: any) => item.ref.current);
						focusFirst(candidateNodes, preventScrollOnEntryFocus);
					}
				}
				isClickFocusRef.current = false;
			}),
			onBlur: composeEventHandlers(props.onBlur, () => setIsTabbingBackOut(false)),
		}),
	});
}

export function Item(props: any): any {
	const slot = S('RovingFocusGroupItem');
	const {
		__scopeRovingFocusGroup,
		focusable = true,
		active = false,
		tabStopId,
		children,
		...itemProps
	} = props ?? {};
	const autoId = useId(subSlot(slot, 'id'));
	const id = tabStopId || autoId;
	const context = useRovingFocusContext('RovingFocusGroupItem', __scopeRovingFocusGroup);
	const isCurrentTabStop = context.currentTabStopId === id;
	const getItems = useCollection(__scopeRovingFocusGroup, subSlot(slot, 'items'));
	const { onFocusableItemAdd, onFocusableItemRemove, currentTabStopId } = context;

	useEffect(
		() => {
			if (focusable) {
				onFocusableItemAdd();
				return () => onFocusableItemRemove();
			}
		},
		[focusable, onFocusableItemAdd, onFocusableItemRemove],
		subSlot(slot, 'e:count'),
	);

	return createElement(Collection.ItemSlot, {
		scope: __scopeRovingFocusGroup,
		id,
		focusable,
		active,
		children: createElement(Primitive.span, {
			tabIndex: isCurrentTabStop ? 0 : -1,
			'data-orientation': context.orientation,
			...itemProps,
			onMouseDown: composeEventHandlers(props.onMouseDown, (event: MouseEvent) => {
				// Prevent focusing non-focusable items on pointer down.
				if (!focusable) event.preventDefault();
				else context.onItemFocus(id);
			}),
			onFocus: composeEventHandlers(props.onFocus, () => context.onItemFocus(id)),
			onKeyDown: composeEventHandlers(props.onKeyDown, (event: KeyboardEvent) => {
				if (event.key === 'Tab' && event.shiftKey) {
					context.onItemShiftTab();
					return;
				}
				if (event.target !== event.currentTarget) return;
				const focusIntent = getFocusIntent(event, context.orientation, context.dir);
				if (focusIntent !== undefined) {
					if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
					event.preventDefault();
					const items = getItems().filter((item: any) => item.focusable);
					let candidateNodes = items.map((item: any) => item.ref.current) as HTMLElement[];
					if (focusIntent === 'last') candidateNodes.reverse();
					else if (focusIntent === 'prev' || focusIntent === 'next') {
						if (focusIntent === 'prev') candidateNodes.reverse();
						const currentIndex = candidateNodes.indexOf(event.currentTarget as HTMLElement);
						candidateNodes = context.loop
							? wrapArray(candidateNodes, currentIndex + 1)
							: candidateNodes.slice(currentIndex + 1);
					}
					setTimeout(() => focusFirst(candidateNodes));
				}
			}),
			children:
				typeof children === 'function'
					? children({ isCurrentTabStop, hasTabStop: currentTabStopId != null })
					: children,
		}),
	});
}

const MAP_KEY_TO_FOCUS_INTENT: Record<string, 'first' | 'last' | 'prev' | 'next'> = {
	ArrowLeft: 'prev',
	ArrowUp: 'prev',
	ArrowRight: 'next',
	ArrowDown: 'next',
	PageUp: 'first',
	Home: 'first',
	PageDown: 'last',
	End: 'last',
};

function getDirectionAwareKey(key: string, dir?: string): string {
	if (dir !== 'rtl') return key;
	return key === 'ArrowLeft' ? 'ArrowRight' : key === 'ArrowRight' ? 'ArrowLeft' : key;
}

function getFocusIntent(
	event: KeyboardEvent,
	orientation?: string,
	dir?: string,
): 'first' | 'last' | 'prev' | 'next' | undefined {
	const key = getDirectionAwareKey(event.key, dir);
	if (orientation === 'vertical' && ['ArrowLeft', 'ArrowRight'].includes(key)) return undefined;
	if (orientation === 'horizontal' && ['ArrowUp', 'ArrowDown'].includes(key)) return undefined;
	return MAP_KEY_TO_FOCUS_INTENT[key];
}

function focusFirst(candidates: HTMLElement[], preventScroll = false): void {
	const PREVIOUSLY_FOCUSED_ELEMENT = document.activeElement;
	for (const candidate of candidates) {
		if (candidate === PREVIOUSLY_FOCUSED_ELEMENT) return;
		candidate.focus({ preventScroll });
		if (document.activeElement !== PREVIOUSLY_FOCUSED_ELEMENT) return;
	}
}

function wrapArray<T>(array: T[], startIndex: number): T[] {
	return array.map((_, index) => array[(startIndex + index) % array.length]);
}

export { Root as RovingFocusGroup, Item as RovingFocusGroupItem };
