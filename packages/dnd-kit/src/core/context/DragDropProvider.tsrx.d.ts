import type { Data, DragDropEventHandlers } from '@dnd-kit/abstract';
import type { DragDropManager, DragDropManagerInput, Draggable, Droppable } from '@dnd-kit/dom';

export type Events<
	T extends Data = Data,
	U extends Draggable<T> = Draggable<T>,
	V extends Droppable<T> = Droppable<T>,
	W extends DragDropManager<T, U, V> = DragDropManager<T, U, V>,
> = DragDropEventHandlers<U, V, W>;

export interface DragDropProviderProps<
	T extends Data = Data,
	U extends Draggable<T> = Draggable<T>,
	V extends Droppable<T> = Droppable<T>,
	W extends DragDropManager<T, U, V> = DragDropManager<T, U, V>,
> extends DragDropManagerInput {
	children?: unknown;
	manager?: W;
	onBeforeDragStart?: Events<T, U, V, W>['beforedragstart'];
	onCollision?: Events<T, U, V, W>['collision'];
	onDragStart?: Events<T, U, V, W>['dragstart'];
	onDragMove?: Events<T, U, V, W>['dragmove'];
	onDragOver?: Events<T, U, V, W>['dragover'];
	onDragEnd?: Events<T, U, V, W>['dragend'];
}

export declare function DragDropProvider<
	T extends Data = Data,
	U extends Draggable<T> = Draggable<T>,
	V extends Droppable<T> = Droppable<T>,
	W extends DragDropManager<T, U, V> = DragDropManager<T, U, V>,
>(props: DragDropProviderProps<T, U, V, W>): unknown;
