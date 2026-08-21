import type { Octane } from 'octane/jsx-runtime';
import { useStableCallback } from './useStableCallback';

type PossibleRef<Type> = Octane.Ref<Type> | undefined;

export function useMergedRefs<Type>(...args: Array<PossibleRef<Type> | symbol>) {
	const maybeSlot = args.at(-1);
	const slot = typeof maybeSlot === 'symbol' ? maybeSlot : undefined;
	const refs = (slot === undefined ? args : args.slice(0, -1)) as PossibleRef<Type>[];
	return useStableCallback((value: Type | null) => {
		const assign = (ref: PossibleRef<Type>) => {
			if (Array.isArray(ref)) for (const child of ref) assign(child);
			else if (typeof ref === 'function') ref(value);
			else if (ref) (ref as { current: Type | null }).current = value;
		};
		for (const ref of refs) assign(ref);
	}, slot);
}
