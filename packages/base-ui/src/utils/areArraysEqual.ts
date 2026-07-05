// Ported verbatim from .base-ui/packages/react/src/internals/areArraysEqual.ts.
export function areArraysEqual<Item>(
	array1: ReadonlyArray<Item>,
	array2: ReadonlyArray<Item>,
	itemComparer: (a: Item, b: Item) => boolean = (a, b) => a === b,
): boolean {
	return (
		array1.length === array2.length &&
		array1.every((value, index) => itemComparer(value, array2[index]))
	);
}
