// Vendored list-navigation helpers — Base UI itself vendors these from `floating-ui-react`
// (`.base-ui/packages/react/src/floating-ui-react/utils.ts`); octane's `@octanejs/floating-ui`
// implements the identical functions but does not export them publicly, so we keep a small
// self-contained copy here (matching the octane port's implementations verbatim).

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

export function isIndexOutOfListBounds(listRef: { current: any[] }, index: number): boolean {
	return index < 0 || index >= listRef.current.length;
}

export function isListIndexDisabled(
	listRef: { current: any[] },
	index: number,
	disabledIndices?: number[] | ((index: number) => boolean),
): boolean {
	if (typeof disabledIndices === 'function') {
		return disabledIndices(index);
	}
	if (disabledIndices) {
		return disabledIndices.includes(index);
	}
	const element = listRef.current[index];
	return (
		element == null ||
		element.hasAttribute('disabled') ||
		element.getAttribute('aria-disabled') === 'true'
	);
}

export function findNonDisabledListIndex(
	listRef: { current: any[] },
	options: {
		startingIndex?: number;
		decrement?: boolean;
		disabledIndices?: number[] | ((index: number) => boolean);
		amount?: number;
	} = {},
): number {
	const { startingIndex = -1, decrement = false, disabledIndices, amount = 1 } = options;
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

export function getMinListIndex(
	listRef: { current: any[] },
	disabledIndices: number[] | ((index: number) => boolean) | undefined,
): number {
	return findNonDisabledListIndex(listRef, { disabledIndices });
}

export function getMaxListIndex(
	listRef: { current: any[] },
	disabledIndices: number[] | ((index: number) => boolean) | undefined,
): number {
	return findNonDisabledListIndex(listRef, {
		decrement: true,
		startingIndex: listRef.current.length,
		disabledIndices,
	});
}
