import type { Data } from '@dnd-kit/abstract';
import type { Draggable, Droppable, DragDropManager } from '@dnd-kit/dom';
import { subSlot } from '../../internal';
import { useComputed } from '../../hooks/useComputed';
import { useDragDropManager } from './useDragDropManager';

export function useDragOperation<
	T extends Data = Data,
	U extends Draggable<T> = Draggable<T>,
	V extends Droppable<T> = Droppable<T>,
	W extends DragDropManager<T, U, V> = DragDropManager<T, U, V>,
>(slot?: symbol): { readonly source: U | null | undefined; readonly target: V | null | undefined } {
	const manager = useDragDropManager<T, U, V, W>();
	const source = useComputed(
		() => manager?.dragOperation.source,
		[manager],
		false,
		subSlot(slot, 'source'),
	);
	const target = useComputed(
		() => manager?.dragOperation.target,
		[manager],
		false,
		subSlot(slot, 'target'),
	);
	return {
		get source() {
			return source.value as U | null | undefined;
		},
		get target() {
			return target.value as V | null | undefined;
		},
	};
}
