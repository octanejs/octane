import { useMemo, useRef } from 'octane';
import { computed, type Signal } from '@dnd-kit/state';
import { subSlot } from '../internal';
import { useSignal } from './useSignal';

export function useComputed<T = any>(
	compute: () => T,
	dependenciesOrSlot: any[] | symbol = [],
	synchronousOrSlot: boolean | symbol = false,
	maybeSlot?: symbol,
): { readonly value: T } {
	const slot =
		typeof dependenciesOrSlot === 'symbol'
			? dependenciesOrSlot
			: typeof synchronousOrSlot === 'symbol'
				? synchronousOrSlot
				: maybeSlot;
	const dependencies = Array.isArray(dependenciesOrSlot) ? dependenciesOrSlot : [];
	const synchronous = typeof synchronousOrSlot === 'boolean' ? synchronousOrSlot : false;
	const computeRef = useRef(compute, subSlot(slot, 'compute'));
	computeRef.current = compute;
	const value = useMemo(
		() => computed(() => computeRef.current()),
		dependencies,
		subSlot(slot, 'memo'),
	);
	return useSignal(value as Signal<T>, synchronous, subSlot(slot, 'signal'));
}
