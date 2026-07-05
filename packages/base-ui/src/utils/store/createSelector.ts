// Ported from .base-ui/packages/utils/src/store/createSelector.ts (v1.6.0). Combines up to six
// selector functions into one. Pure — the elaborate reselect-based generic types are simplified
// (the runtime is unchanged); the memoized variant (`createSelectorMemoized`, reselect-backed) is
// only ported if/when a component needs it.
export type CreateSelectorFunction = (...items: any[]) => (...args: any[]) => any;

/* eslint-disable id-denylist */
export const createSelector = ((
	a: Function,
	b?: Function,
	c?: Function,
	d?: Function,
	e?: Function,
	f?: Function,
	...other: any[]
) => {
	if (other.length > 0) {
		throw new Error('Unsupported number of selectors');
	}

	let selector: any;

	if (a && b && c && d && e && f) {
		selector = (state: any, a1: any, a2: any, a3: any) => {
			const va = a(state, a1, a2, a3);
			const vb = b(state, a1, a2, a3);
			const vc = c(state, a1, a2, a3);
			const vd = d(state, a1, a2, a3);
			const ve = e(state, a1, a2, a3);
			return f(va, vb, vc, vd, ve, a1, a2, a3);
		};
	} else if (a && b && c && d && e) {
		selector = (state: any, a1: any, a2: any, a3: any) => {
			const va = a(state, a1, a2, a3);
			const vb = b(state, a1, a2, a3);
			const vc = c(state, a1, a2, a3);
			const vd = d(state, a1, a2, a3);
			return e(va, vb, vc, vd, a1, a2, a3);
		};
	} else if (a && b && c && d) {
		selector = (state: any, a1: any, a2: any, a3: any) => {
			const va = a(state, a1, a2, a3);
			const vb = b(state, a1, a2, a3);
			const vc = c(state, a1, a2, a3);
			return d(va, vb, vc, a1, a2, a3);
		};
	} else if (a && b && c) {
		selector = (state: any, a1: any, a2: any, a3: any) => {
			const va = a(state, a1, a2, a3);
			const vb = b(state, a1, a2, a3);
			return c(va, vb, a1, a2, a3);
		};
	} else if (a && b) {
		selector = (state: any, a1: any, a2: any, a3: any) => {
			const va = a(state, a1, a2, a3);
			return b(va, a1, a2, a3);
		};
	} else if (a) {
		selector = a;
	} else {
		throw new Error('Missing arguments');
	}

	return selector;
}) as unknown as CreateSelectorFunction;
/* eslint-enable id-denylist */
