// Ported from @floating-ui/react/utils. The DOM/grid/tabbable helpers are
// framework-agnostic and copied ~verbatim (signatures mirror upstream's
// `@floating-ui/react/utils` typings, with React event/ref types replaced by the
// native-DOM/octane analogs); the three React hooks (useLatestRef, useEffectEvent,
// useModernLayoutEffect) become octane hooks that take an explicit slot (forwarded
// by their callers via subSlot — see ../internal).
import { isShadowRoot, isHTMLElement } from '@floating-ui/utils/dom';
import { floor } from '@floating-ui/utils';
import { tabbable, type FocusableElement } from 'tabbable';
import { useCallback, useLayoutEffect, useRef } from 'octane';
import type { Octane } from 'octane/jsx-runtime';
import type { Dimensions } from '@floating-ui/dom';

import { subSlot } from '../internal';
import type { Delay, FloatingNodeType, MutableRefObject, ReferenceType } from '../types';

/**
 * The OBJECT form of octane's `style` prop — the port's analog of
 * `React.CSSProperties` (octane's `style` additionally accepts a plain string;
 * helpers that merge/inspect style objects require this form).
 */
export type CSSProperties = Exclude<
	Octane.HTMLAttributes<HTMLElement>['style'],
	string | undefined
>;

/** Which list items are disabled (mirrors upstream's unexported `DisabledIndices`). */
export type DisabledIndices = Array<number> | ((index: number) => boolean);

export function getPlatform(): string {
	const uaData = (navigator as any).userAgentData;
	if (uaData != null && uaData.platform) {
		return uaData.platform;
	}
	return navigator.platform;
}
export function getUserAgent(): string {
	const uaData = (navigator as any).userAgentData;
	if (uaData && Array.isArray(uaData.brands)) {
		return uaData.brands.map((b: any) => b.brand + '/' + b.version).join(' ');
	}
	return navigator.userAgent;
}
export function isSafari(): boolean {
	return /apple/i.test(navigator.vendor);
}
export function isAndroid(): boolean {
	const re = /android/i;
	return re.test(getPlatform()) || re.test(getUserAgent());
}
export function isMac(): boolean {
	return getPlatform().toLowerCase().startsWith('mac') && !navigator.maxTouchPoints;
}
export function isJSDOM(): boolean {
	return getUserAgent().includes('jsdom/');
}
export function isMacSafari(): boolean {
	return isMac() && isSafari();
}

export function createAttribute(name: string): string {
	return 'data-floating-ui-' + name;
}
export function clearTimeoutIfSet(timeoutRef: MutableRefObject<number>): void {
	if (timeoutRef.current !== -1) {
		clearTimeout(timeoutRef.current);
		timeoutRef.current = -1;
	}
}

export const FOCUSABLE_ATTRIBUTE = 'data-floating-ui-focusable';
const TYPEABLE_SELECTOR =
	"input:not([type='hidden']):not([disabled])," +
	"[contenteditable]:not([contenteditable='false']),textarea:not([disabled])";
const ARROW_LEFT = 'ArrowLeft';
const ARROW_RIGHT = 'ArrowRight';
const ARROW_UP = 'ArrowUp';
const ARROW_DOWN = 'ArrowDown';

export function activeElement(doc: Document): Element | null {
	let active = doc.activeElement;
	while (active?.shadowRoot?.activeElement != null) {
		active = active.shadowRoot.activeElement;
	}
	return active;
}
export function contains(parent?: Element | null, child?: Element | null): boolean {
	if (!parent || !child) {
		return false;
	}
	const rootNode = child.getRootNode?.();
	if (parent.contains(child)) {
		return true;
	}
	if (rootNode && isShadowRoot(rootNode)) {
		let next: any = child;
		while (next) {
			if (parent === next) {
				return true;
			}
			next = next.parentNode || next.host;
		}
	}
	return false;
}
export function getTarget(event: Event): EventTarget | null {
	if ('composedPath' in event) {
		return event.composedPath()[0];
	}
	// Old-browser fallback: `lib.dom` types every Event with `composedPath`, so
	// the false branch narrows `event` to `never` — widen for the legacy read.
	return (event as Event).target;
}
export function isEventTargetWithin(event: Event, node: Node | null | undefined): boolean {
	if (node == null) {
		return false;
	}
	if ('composedPath' in event) {
		return event.composedPath().includes(node);
	}
	// Old-browser fallback (see getTarget).
	const e = event as Event;
	return e.target != null && node.contains(e.target as Node);
}
export function isRootElement(element: Element): boolean {
	return element.matches('html,body');
}
export function getDocument(node?: Element | null): Document {
	return node?.ownerDocument || document;
}
export function isTypeableElement(element: unknown): boolean {
	return isHTMLElement(element) && element.matches(TYPEABLE_SELECTOR);
}
export function isTypeableCombobox(element: Element | null): boolean {
	if (!element) return false;
	return element.getAttribute('role') === 'combobox' && isTypeableElement(element);
}
export function matchesFocusVisible(element: Element | null): boolean {
	if (!element || isJSDOM()) return true;
	try {
		return element.matches(':focus-visible');
	} catch (_e) {
		return true;
	}
}
export function getFloatingFocusElement(
	floatingElement: HTMLElement | null | undefined,
): HTMLElement | null {
	if (!floatingElement) {
		return null;
	}
	return floatingElement.hasAttribute(FOCUSABLE_ATTRIBUTE)
		? floatingElement
		: floatingElement.querySelector<HTMLElement>('[' + FOCUSABLE_ATTRIBUTE + ']') ||
				floatingElement;
}

export function getNodeChildren<RT extends ReferenceType = ReferenceType>(
	nodes: Array<FloatingNodeType<RT>>,
	id: string | undefined,
	onlyOpenChildren = true,
): Array<FloatingNodeType<RT>> {
	const directChildren = nodes.filter(
		(node) => node.parentId === id && (!onlyOpenChildren || node.context?.open),
	);
	return directChildren.flatMap((child) => [
		child,
		...getNodeChildren(nodes, child.id, onlyOpenChildren),
	]);
}
export function getDeepestNode<RT extends ReferenceType = ReferenceType>(
	nodes: Array<FloatingNodeType<RT>>,
	id: string | undefined,
): FloatingNodeType<RT> | undefined {
	let deepestNodeId: string | undefined;
	let maxDepth = -1;
	function findDeepest(nodeId: string | undefined, depth: number) {
		if (depth > maxDepth) {
			deepestNodeId = nodeId;
			maxDepth = depth;
		}
		const children = getNodeChildren(nodes, nodeId);
		children.forEach((child) => {
			findDeepest(child.id, depth + 1);
		});
	}
	findDeepest(id, 0);
	return nodes.find((node) => node.id === deepestNodeId);
}
export function getNodeAncestors<RT extends ReferenceType = ReferenceType>(
	nodes: Array<FloatingNodeType<RT>>,
	id: string | undefined,
): Array<FloatingNodeType<RT>> {
	let allAncestors: Array<FloatingNodeType<RT>> = [];
	let currentParentId = nodes.find((node) => node.id === id)?.parentId;
	while (currentParentId) {
		const currentNode = nodes.find((node) => node.id === currentParentId);
		currentParentId = currentNode?.parentId;
		if (currentNode) {
			allAncestors = allAncestors.concat(currentNode);
		}
	}
	return allAncestors;
}

export function stopEvent(event: Event): void {
	event.preventDefault();
	event.stopPropagation();
}
export function isReactEvent(event: any): boolean {
	return 'nativeEvent' in event;
}

export function isVirtualClick(event: MouseEvent | PointerEvent): boolean {
	if ((event as any).mozInputSource === 0 && event.isTrusted) {
		return true;
	}
	if (isAndroid() && (event as PointerEvent).pointerType) {
		return event.type === 'click' && event.buttons === 1;
	}
	return event.detail === 0 && !(event as PointerEvent).pointerType;
}
export function isVirtualPointerEvent(event: PointerEvent): boolean {
	if (isJSDOM()) return false;
	return (
		(!isAndroid() && event.width === 0 && event.height === 0) ||
		(isAndroid() &&
			event.width === 1 &&
			event.height === 1 &&
			event.pressure === 0 &&
			event.detail === 0 &&
			event.pointerType === 'mouse') ||
		(event.width < 1 &&
			event.height < 1 &&
			event.pressure === 0 &&
			event.detail === 0 &&
			event.pointerType === 'touch')
	);
}
export function isMouseLikePointerType(pointerType: string | undefined, strict?: boolean): boolean {
	const values: Array<string | undefined> = ['mouse', 'pen'];
	if (!strict) {
		values.push('', undefined);
	}
	return values.includes(pointerType);
}

export function getDelay(
	value: Delay | ((...args: any[]) => Delay) | undefined,
	prop: 'open' | 'close',
	pointerType?: string,
): number | undefined {
	if (pointerType && !isMouseLikePointerType(pointerType)) {
		return 0;
	}
	if (typeof value === 'number') {
		return value;
	}
	if (typeof value === 'function') {
		const result = value();
		if (typeof result === 'number') {
			return result;
		}
		return result?.[prop];
	}
	return value?.[prop];
}

// JS style key (`backgroundColor`) → CSS property (`background-color`).
export function camelCaseToKebabCase(str: string): string {
	return str.replace(/[A-Z]+(?![a-z])|[A-Z]/g, ($, ofs) => (ofs ? '-' : '') + $.toLowerCase());
}
export function execWithArgsOrReturn<Value, SidePlacement>(
	valueOrFn: Value | ((args: SidePlacement) => Value),
	args: SidePlacement,
): Value {
	return typeof valueOrFn === 'function'
		? (valueOrFn as (args: SidePlacement) => Value)(args)
		: valueOrFn;
}

// Fork of `fast-deep-equal` (from @floating-ui/react-dom) — compares functions by
// source. Used by the positioning core.
export function deepEqual(a: any, b: any): boolean {
	if (a === b) {
		return true;
	}
	if (typeof a !== typeof b) {
		return false;
	}
	if (typeof a === 'function' && a.toString() === b.toString()) {
		return true;
	}
	let length: number;
	let i: number;
	let keys: string[];
	if (a && b && typeof a === 'object') {
		if (Array.isArray(a)) {
			length = a.length;
			if (length !== b.length) return false;
			for (i = length; i-- !== 0;) {
				if (!deepEqual(a[i], b[i])) {
					return false;
				}
			}
			return true;
		}
		keys = Object.keys(a);
		length = keys.length;
		if (length !== Object.keys(b).length) {
			return false;
		}
		for (i = length; i-- !== 0;) {
			if (!{}.hasOwnProperty.call(b, keys[i])) {
				return false;
			}
		}
		for (i = length; i-- !== 0;) {
			const key = keys[i];
			if (key === '_owner' && a.$$typeof) {
				continue;
			}
			if (!deepEqual(a[key], b[key])) {
				return false;
			}
		}
		return true;
	}
	return a !== a && b !== b;
}

export function getDPR(element: Element): number {
	if (typeof window === 'undefined') {
		return 1;
	}
	const win = element.ownerDocument.defaultView || window;
	return win.devicePixelRatio || 1;
}

export function roundByDPR(element: Element, value: number): number {
	const dpr = getDPR(element);
	return Math.round(value * dpr) / dpr;
}

export const isClient = typeof document !== 'undefined';

// useLayoutEffect on the client; a no-op on the server (positioning/interactions
// are client-only). Conditional hook calls are legal in octane (slot-keyed).
export function useModernLayoutEffect(
	fn: () => void | (() => void),
	deps: any[] | undefined,
	slot: symbol | undefined,
): void {
	if (isClient) {
		useLayoutEffect(fn, deps, slot);
	}
}

export function useLatestRef<T>(value: T, slot: symbol | undefined): MutableRefObject<T> {
	const ref = useRef(value, subSlot(slot, 'lr:ref'));
	useModernLayoutEffect(
		() => {
			ref.current = value;
		},
		undefined,
		subSlot(slot, 'lr:eff'),
	);
	return ref;
}

// octane has no useInsertionEffect; the safe fallback runs synchronously, keeping
// the event ref current each render (matches @floating-ui/react's fallback path).
const useSafeInsertionEffect = (fn: () => void) => fn();

export function useEffectEvent<T extends (...args: any[]) => any>(
	callback: T | undefined,
	slot: symbol | undefined,
): T {
	const ref = useRef<any>(
		() => {
			throw new Error('Cannot call an event handler while rendering.');
		},
		subSlot(slot, 'ee:ref'),
	);
	useSafeInsertionEffect(() => {
		ref.current = callback;
	});
	return useCallback(
		(...args: any[]) => (ref.current == null ? undefined : ref.current(...args)),
		[],
		subSlot(slot, 'ee:cb'),
	) as T;
}

export function isDifferentGridRow(index: number, cols: number, prevRow: number): boolean {
	return Math.floor(index / cols) !== prevRow;
}
export function isIndexOutOfListBounds(
	listRef: MutableRefObject<Array<HTMLElement | null>>,
	index: number,
): boolean {
	return index < 0 || index >= listRef.current.length;
}
export function getMinListIndex(
	listRef: MutableRefObject<Array<HTMLElement | null>>,
	disabledIndices: DisabledIndices | undefined,
): number {
	return findNonDisabledListIndex(listRef, { disabledIndices });
}
export function getMaxListIndex(
	listRef: MutableRefObject<Array<HTMLElement | null>>,
	disabledIndices: DisabledIndices | undefined,
): number {
	return findNonDisabledListIndex(listRef, {
		decrement: true,
		startingIndex: listRef.current.length,
		disabledIndices,
	});
}
export function findNonDisabledListIndex(
	listRef: MutableRefObject<Array<HTMLElement | null>>,
	_temp?: {
		startingIndex?: number;
		decrement?: boolean;
		disabledIndices?: DisabledIndices;
		amount?: number;
	},
): number {
	const {
		startingIndex = -1,
		decrement = false,
		disabledIndices,
		amount = 1,
	} = _temp === void 0 ? {} : _temp;
	let index = startingIndex;
	do {
		index += decrement ? -amount : amount;
	} while (
		index >= 0 &&
		index <= listRef.current.length - 1 &&
		isListIndexDisabled(listRef, index, disabledIndices)
	);
	return index;
}
export function getGridNavigatedIndex(
	listRef: MutableRefObject<Array<HTMLElement | null>>,
	_ref: {
		event: KeyboardEvent;
		orientation: 'horizontal' | 'vertical' | 'both';
		loop: boolean;
		rtl: boolean;
		cols: number;
		disabledIndices: DisabledIndices | undefined;
		minIndex: number;
		maxIndex: number;
		prevIndex: number;
		stopEvent?: boolean;
	},
): number {
	const {
		event,
		orientation,
		loop,
		rtl,
		cols,
		disabledIndices,
		minIndex,
		maxIndex,
		prevIndex,
		stopEvent: stop = false,
	} = _ref;
	let nextIndex = prevIndex;
	if (event.key === ARROW_UP) {
		stop && stopEvent(event);
		if (prevIndex === -1) {
			nextIndex = maxIndex;
		} else {
			nextIndex = findNonDisabledListIndex(listRef, {
				startingIndex: nextIndex,
				amount: cols,
				decrement: true,
				disabledIndices,
			});
			if (loop && (prevIndex - cols < minIndex || nextIndex < 0)) {
				const col = prevIndex % cols;
				const maxCol = maxIndex % cols;
				const offset = maxIndex - (maxCol - col);
				if (maxCol === col) {
					nextIndex = maxIndex;
				} else {
					nextIndex = maxCol > col ? offset : offset - cols;
				}
			}
		}
		if (isIndexOutOfListBounds(listRef, nextIndex)) {
			nextIndex = prevIndex;
		}
	}
	if (event.key === ARROW_DOWN) {
		stop && stopEvent(event);
		if (prevIndex === -1) {
			nextIndex = minIndex;
		} else {
			nextIndex = findNonDisabledListIndex(listRef, {
				startingIndex: prevIndex,
				amount: cols,
				disabledIndices,
			});
			if (loop && prevIndex + cols > maxIndex) {
				nextIndex = findNonDisabledListIndex(listRef, {
					startingIndex: (prevIndex % cols) - cols,
					amount: cols,
					disabledIndices,
				});
			}
		}
		if (isIndexOutOfListBounds(listRef, nextIndex)) {
			nextIndex = prevIndex;
		}
	}
	if (orientation === 'both') {
		const prevRow = floor(prevIndex / cols);
		if (event.key === (rtl ? ARROW_LEFT : ARROW_RIGHT)) {
			stop && stopEvent(event);
			if (prevIndex % cols !== cols - 1) {
				nextIndex = findNonDisabledListIndex(listRef, {
					startingIndex: prevIndex,
					disabledIndices,
				});
				if (loop && isDifferentGridRow(nextIndex, cols, prevRow)) {
					nextIndex = findNonDisabledListIndex(listRef, {
						startingIndex: prevIndex - (prevIndex % cols) - 1,
						disabledIndices,
					});
				}
			} else if (loop) {
				nextIndex = findNonDisabledListIndex(listRef, {
					startingIndex: prevIndex - (prevIndex % cols) - 1,
					disabledIndices,
				});
			}
			if (isDifferentGridRow(nextIndex, cols, prevRow)) {
				nextIndex = prevIndex;
			}
		}
		if (event.key === (rtl ? ARROW_RIGHT : ARROW_LEFT)) {
			stop && stopEvent(event);
			if (prevIndex % cols !== 0) {
				nextIndex = findNonDisabledListIndex(listRef, {
					startingIndex: prevIndex,
					decrement: true,
					disabledIndices,
				});
				if (loop && isDifferentGridRow(nextIndex, cols, prevRow)) {
					nextIndex = findNonDisabledListIndex(listRef, {
						startingIndex: prevIndex + (cols - (prevIndex % cols)),
						decrement: true,
						disabledIndices,
					});
				}
			} else if (loop) {
				nextIndex = findNonDisabledListIndex(listRef, {
					startingIndex: prevIndex + (cols - (prevIndex % cols)),
					decrement: true,
					disabledIndices,
				});
			}
			if (isDifferentGridRow(nextIndex, cols, prevRow)) {
				nextIndex = prevIndex;
			}
		}
		const lastRow = floor(maxIndex / cols) === prevRow;
		if (isIndexOutOfListBounds(listRef, nextIndex)) {
			if (loop && lastRow) {
				nextIndex =
					event.key === (rtl ? ARROW_RIGHT : ARROW_LEFT)
						? maxIndex
						: findNonDisabledListIndex(listRef, {
								startingIndex: prevIndex - (prevIndex % cols) - 1,
								disabledIndices,
							});
			} else {
				nextIndex = prevIndex;
			}
		}
	}
	return nextIndex;
}

/** For each cell index, gets the item index that occupies that cell. */
export function createGridCellMap(
	sizes: Dimensions[],
	cols: number,
	dense: boolean,
): Array<number | undefined> {
	const cellMap: Array<number | undefined> = [];
	let startIndex = 0;
	sizes.forEach((_ref2, index) => {
		const { width, height } = _ref2;
		if (width > cols) {
			throw new Error(
				'[Floating UI]: Invalid grid - item width at index ' +
					index +
					' is greater than grid columns',
			);
		}
		let itemPlaced = false;
		if (dense) {
			startIndex = 0;
		}
		while (!itemPlaced) {
			const targetCells: number[] = [];
			for (let i = 0; i < width; i++) {
				for (let j = 0; j < height; j++) {
					targetCells.push(startIndex + i + j * cols);
				}
			}
			if (
				(startIndex % cols) + width <= cols &&
				targetCells.every((cell) => cellMap[cell] == null)
			) {
				targetCells.forEach((cell) => {
					cellMap[cell] = index;
				});
				itemPlaced = true;
			} else {
				startIndex++;
			}
		}
	});
	return [...cellMap];
}
/** Gets cell index of an item's corner or -1 when index is -1. */
export function getGridCellIndexOfCorner(
	index: number,
	sizes: Dimensions[],
	cellMap: Array<number | undefined>,
	cols: number,
	corner: 'tl' | 'tr' | 'bl' | 'br',
): number {
	if (index === -1) return -1;
	const firstCellIndex = cellMap.indexOf(index);
	const sizeItem = sizes[index];
	switch (corner) {
		case 'tl':
			return firstCellIndex;
		case 'tr':
			if (!sizeItem) {
				return firstCellIndex;
			}
			return firstCellIndex + sizeItem.width - 1;
		case 'bl':
			if (!sizeItem) {
				return firstCellIndex;
			}
			return firstCellIndex + (sizeItem.height - 1) * cols;
		case 'br':
			return cellMap.lastIndexOf(index);
	}
	return -1;
}
/** Gets all cell indices that correspond to the specified indices. */
export function getGridCellIndices(
	indices: Array<number | undefined>,
	cellMap: Array<number | undefined>,
): number[] {
	return cellMap.flatMap((index, cellIndex) => (indices.includes(index) ? [cellIndex] : []));
}
export function isListIndexDisabled(
	listRef: MutableRefObject<Array<HTMLElement | null>>,
	index: number,
	disabledIndices?: DisabledIndices,
): boolean {
	if (typeof disabledIndices === 'function') {
		return disabledIndices(index);
	} else if (disabledIndices) {
		return disabledIndices.includes(index);
	}
	const element = listRef.current[index];
	return (
		element == null ||
		element.hasAttribute('disabled') ||
		element.getAttribute('aria-disabled') === 'true'
	);
}

export const getTabbableOptions = (): { getShadowRoot: true; displayCheck: 'full' | 'none' } => ({
	getShadowRoot: true,
	displayCheck:
		typeof ResizeObserver === 'function' && ResizeObserver.toString().includes('[native code]')
			? 'full'
			: 'none',
});
function getTabbableIn(container: HTMLElement, dir: 1 | -1): FocusableElement | undefined {
	const list = tabbable(container, getTabbableOptions());
	const len = list.length;
	if (len === 0) return;
	const active = activeElement(getDocument(container));
	const index = list.indexOf(active as any);
	const nextIndex = index === -1 ? (dir === 1 ? 0 : len - 1) : index + dir;
	return list[nextIndex];
}
export function getNextTabbable(referenceElement: Element | null): FocusableElement | null {
	return (
		getTabbableIn(getDocument(referenceElement).body, 1) ||
		(referenceElement as FocusableElement | null)
	);
}
export function getPreviousTabbable(referenceElement: Element | null): FocusableElement | null {
	return (
		getTabbableIn(getDocument(referenceElement).body, -1) ||
		(referenceElement as FocusableElement | null)
	);
}
let rafId = 0;
export function enqueueFocus(
	el: Element | FocusableElement | null | undefined,
	options: { preventScroll?: boolean; cancelPrevious?: boolean; sync?: boolean } = {},
): void {
	const { preventScroll = false, cancelPrevious = true, sync = false } = options;
	cancelPrevious && cancelAnimationFrame(rafId);
	const exec = () => (el as FocusableElement | null | undefined)?.focus({ preventScroll });
	if (sync) {
		exec();
	} else {
		rafId = requestAnimationFrame(exec);
	}
}

export function isOutsideEvent(event: FocusEvent, container?: Element | null): boolean {
	const containerElement = container || (event.currentTarget as Element | null);
	const relatedTarget = event.relatedTarget as Element | null;
	return !relatedTarget || !contains(containerElement, relatedTarget);
}
export function disableFocusInside(container: HTMLElement): void {
	const tabbableElements = tabbable(container, getTabbableOptions());
	tabbableElements.forEach((element) => {
		element.dataset.tabindex = element.getAttribute('tabindex') || '';
		element.setAttribute('tabindex', '-1');
	});
}
export function enableFocusInside(container: HTMLElement): void {
	const elements = container.querySelectorAll<HTMLElement>('[data-tabindex]');
	elements.forEach((element) => {
		const tabindex = element.dataset.tabindex;
		delete element.dataset.tabindex;
		if (tabindex) {
			element.setAttribute('tabindex', tabindex);
		} else {
			element.removeAttribute('tabindex');
		}
	});
}
