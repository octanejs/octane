import { useState, useCallback } from 'octane';

// TypeScript the FULL compiler's printer (esrap) cannot emit — an index signature
// and a generic type alias. The surgical `.ts` hook pass must leave ALL of this
// byte-for-byte while still slotting the base hook calls below.
export interface Bag {
	[key: string]: number;
}
export type Pair<A, B> = { a: A; b: B };
export const widen = <T>(x: T): T => x;

// A custom hook living in a plain `.ts` module. Its base hooks get per-call-site
// slot symbols from the surgical pass; the `.tsrx`/`.tsx` CALLER wraps the call in
// `withSlot`, so the two compose across the module boundary.
export function useExternalCounter(start: number) {
	const [n, setN] = useState<number>(start);
	const [touched, setTouched] = useState<boolean>(false);
	return {
		n,
		touched,
		inc: () => {
			setN(n + 1);
			setTouched(true);
		},
	};
}

// A `.ts` custom hook composing ANOTHER `.ts` custom hook (single nested call).
export function useLabelled(start: number, label: string) {
	const c = useExternalCounter(start);
	return { text: label + ':' + c.n, inc: c.inc };
}

// Exercises useCallback inside a `.ts` custom hook (withSlot path context): an
// omitted list is compiler-inferred as `[label]`, while the explicit form is
// preserved. The trailing-slot ABI must not leak the slot Symbol into useMemo's deps.
export function useLabelCallbacks(label: string) {
	const noDeps = useCallback(() => 'nd:' + label);
	const withDeps = useCallback(() => 'wd:' + label, [label]);
	return { noDeps, withDeps };
}
