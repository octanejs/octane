// `@octane-ts/zustand/shallow` — the zustand selector-equality helpers.
//
// `shallow` is a pure comparator (no hooks) and is re-exported verbatim from
// zustand. `useShallow` IS a hook (zustand builds it on React.useRef), so it gets
// an octane reimplementation: same memoize-the-selection-by-shallow-equality
// logic, but built on octane's `useRef` with the compiler-injected slot forwarded
// through (exactly like `useStore`). Use it to select an object/array slice
// without the unstable-selector re-render churn:
//
//   const { a, b } = useBearStore(useShallow((s) => ({ a: s.a, b: s.b })));
import { useRef } from 'octane';
import { shallow } from 'zustand/vanilla/shallow';

export { shallow } from 'zustand/vanilla/shallow';

export function useShallow<S, U>(selector: (state: S) => U): (state: S) => U;
export function useShallow<S, U>(
	selector: (state: S) => U,
	// Compiler-injected trailing slot (forwarded to the inner useRef).
	...rest: [slot?: symbol]
): (state: S) => U {
	const tail = rest[rest.length - 1];
	const slot = typeof tail === 'symbol' ? (tail as symbol) : undefined;
	const prev = useRef<U | undefined>(undefined, slot);
	return (state: S) => {
		const next = selector(state);
		return shallow(prev.current, next) ? (prev.current as U) : (prev.current = next);
	};
}
