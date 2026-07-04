// Ported from @base-ui/utils/mergeObjects
// (.base-ui/packages/utils/src/mergeObjects.ts). Shallow object merge that
// avoids allocating when only one side is present.
export function mergeObjects<A extends object | undefined, B extends object | undefined>(
	a: A,
	b: B,
): A | B | (A & B) | undefined {
	if (a && !b) {
		return a;
	}
	if (!a && b) {
		return b;
	}
	if (a || b) {
		return { ...a, ...b } as A & B;
	}
	return undefined;
}
