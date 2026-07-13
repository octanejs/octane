import { useContext } from 'octane';
import type { Data } from '@dnd-kit/abstract';
import type { Draggable, Droppable, DragDropManager } from '@dnd-kit/dom';
import { DragDropContext } from '../context/context';

export function useDragDropManager<
	T extends Data = Data,
	U extends Draggable<T> = Draggable<T>,
	V extends Droppable<T> = Droppable<T>,
	W extends DragDropManager<T, U, V> = DragDropManager<T, U, V>,
>(_slot?: symbol): W | null {
	return useContext(DragDropContext) as W | null;
}
