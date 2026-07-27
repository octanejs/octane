// Vendored list-navigation helpers — Base UI itself vendors these from `floating-ui-react`
// (`.base-ui/packages/react/src/floating-ui-react/utils/composite.ts`, re-exported through
// `internals/composite/composite.ts`); octane's `@octanejs/floating-ui` implements the identical
// functions but does not export them publicly, so we keep a small self-contained copy here.
//
// Signatures follow Base UI 1.6.0 exactly: the index helpers take the item ARRAY, while
// `getMinListIndex`/`getMaxListIndex` take the REF (they need `listRef.current.length` at call
// time). `isListIndexDisabled` is likewise the 1.6.0 body: an explicit `disabledIndices` hit wins,
// an invisible element is always disabled, and the `disabled`/`aria-disabled` attribute fallback
// applies only when the consumer passed no `disabledIndices` at all. `useListNavigation` depends on
// that last clause — it deliberately omits `disabledIndices` when picking the item to focus on open
// so attribute-disabled items are still skipped for consumers passing an empty array.
import { isElementVisible } from '../floating/composite';

export type DisabledIndices = ReadonlyArray<number> | ((index: number) => boolean);

export function getTarget(event: any): EventTarget | null {
	if ('composedPath' in event) {
		return event.composedPath()[0];
	}
	return event.target;
}

export function stopEvent(event: any): void {
	event.preventDefault();
	event.stopPropagation();
}

export function isDifferentGridRow(index: number, cols: number, prevRow: number): boolean {
	return Math.floor(index / cols) !== prevRow;
}

export function isIndexOutOfListBounds(
	list: ReadonlyArray<HTMLElement | null>,
	index: number,
): boolean {
	return index < 0 || index >= list.length;
}

export function isListIndexDisabled(
	list: ReadonlyArray<HTMLElement | null>,
	index: number,
	disabledIndices?: DisabledIndices | undefined,
): boolean {
	const isExplicitlyDisabled =
		typeof disabledIndices === 'function'
			? disabledIndices(index)
			: (disabledIndices?.includes(index) ?? false);

	if (isExplicitlyDisabled) {
		return true;
	}

	const element = list[index];
	if (!element) {
		return false;
	}

	if (!isElementVisible(element)) {
		return true;
	}

	return (
		!disabledIndices &&
		(element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true')
	);
}

export function findNonDisabledListIndex(
	list: ReadonlyArray<HTMLElement | null>,
	options: {
		startingIndex?: number | undefined;
		decrement?: boolean | undefined;
		disabledIndices?: DisabledIndices | undefined;
		amount?: number | undefined;
	} = {},
): number {
	const { startingIndex = -1, decrement = false, disabledIndices, amount = 1 } = options;
	let index = startingIndex;
	do {
		index += decrement ? -amount : amount;
	} while (
		index >= 0 &&
		index <= list.length - 1 &&
		isListIndexDisabled(list, index, disabledIndices)
	);
	return index;
}

export function getMinListIndex(
	listRef: { current: ReadonlyArray<HTMLElement | null> },
	disabledIndices?: DisabledIndices | undefined,
): number {
	return findNonDisabledListIndex(listRef.current, { disabledIndices });
}

export function getMaxListIndex(
	listRef: { current: ReadonlyArray<HTMLElement | null> },
	disabledIndices?: DisabledIndices | undefined,
): number {
	return findNonDisabledListIndex(listRef.current, {
		decrement: true,
		startingIndex: listRef.current.length,
		disabledIndices,
	});
}
