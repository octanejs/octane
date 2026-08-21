// Ported verbatim from @xstate/react@6.1.0 src/shallowEqual.ts
// (statelyai/xstate @ d4f8c5b709291d44f70139a7f9ff333abd7c615c). Pure
// comparator with no React surface, so the upstream implementation is the port.
//
// From https://github.com/reduxjs/react-redux/blob/720f0ba79236cdc3e1115f4ef9a7760a21784b48/src/utils/shallowEqual.ts
function is(x: unknown, y: unknown) {
	if (x === y) {
		return x !== 0 || y !== 0 || 1 / (x as number) === 1 / (y as number);
	} else {
		return x !== x && y !== y;
	}
}

export function shallowEqual(objA: any, objB: any) {
	if (is(objA, objB)) return true;

	if (typeof objA !== 'object' || objA === null || typeof objB !== 'object' || objB === null) {
		return false;
	}

	const keysA = Object.keys(objA);
	const keysB = Object.keys(objB);

	if (keysA.length !== keysB.length) return false;

	for (let i = 0; i < keysA.length; i++) {
		if (
			!Object.prototype.hasOwnProperty.call(objB, keysA[i]) ||
			!is(objA[keysA[i]], objB[keysA[i]])
		) {
			return false;
		}
	}

	return true;
}
