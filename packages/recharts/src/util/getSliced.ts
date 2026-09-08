// Adapted from recharts@3.9.2, commit b3451050c027a23957ffa50a2665c9119df21e47.
export function getSliced<T>(
	arr: ReadonlyArray<T>,
	startIndex: number,
	endIndex: number,
): ReadonlyArray<T> {
	if (!Array.isArray(arr)) {
		return arr;
	}
	if (arr && startIndex + endIndex !== 0) {
		return arr.slice(startIndex, endIndex + 1);
	}
	return arr;
}
