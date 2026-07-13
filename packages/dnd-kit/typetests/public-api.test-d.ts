import type { Draggable, Droppable, DragDropManager } from '@dnd-kit/dom';
import {
	DragDropProvider,
	DragOverlay,
	KeyboardSensor,
	PointerSensor,
	useDragDropManager,
	useDragDropMonitor,
	useDragOperation,
	useDraggable,
	useDroppable,
} from '@octanejs/dnd-kit';
import { useComputed, useConstant, useDeepSignal, useLatest } from '@octanejs/dnd-kit/hooks';
import { useSortable } from '@octanejs/dnd-kit/sortable';
import { currentValue, type RefOrValue } from '@octanejs/dnd-kit/utilities';
import { signal } from '@dnd-kit/state';

declare function expectType<T>(value: T): void;

type CardData = { label: string; position: number };

const draggable = useDraggable<CardData>({
	id: 'card',
	data: { label: 'Card', position: 0 },
	element: { current: document.body },
});
expectType<Draggable<CardData>>(draggable.draggable);
expectType<boolean>(draggable.isDragging);
expectType<(element: Element | null) => void>(draggable.ref);

const droppable = useDroppable<CardData>({
	id: 'column',
	data: { label: 'Column', position: 0 },
});
expectType<Droppable<CardData>>(droppable.droppable);
expectType<boolean>(droppable.isDropTarget);

const sortable = useSortable<CardData>({
	id: 'sortable',
	index: 0,
	data: { label: 'Sortable', position: 0 },
});
expectType<boolean>(sortable.isDragSource);
expectType<boolean>(sortable.isDropTarget);

const manager = useDragDropManager<CardData>();
expectType<DragDropManager<CardData> | null>(manager);
const operation = useDragOperation<CardData>();
expectType<Draggable<CardData> | null | undefined>(operation.source);
expectType<Droppable<CardData> | null | undefined>(operation.target);

useDragDropMonitor<CardData>({
	onDragStart(event) {
		expectType<Draggable<CardData> | null>(event.operation.source);
	},
	onDragEnd(event) {
		expectType<boolean>(event.canceled);
	},
});

DragDropProvider<CardData>({
	sensors: [KeyboardSensor, PointerSensor],
	onDragEnd(event) {
		expectType<boolean>(event.canceled);
	},
});

DragOverlay<CardData, Draggable<CardData>>({
	children(source) {
		expectType<CardData>(source.data);
		return source.id;
	},
	dropAnimation: null,
});

const state = signal(1);
expectType<number>(useComputed(() => state.value).value);
expectType<number>(useDeepSignal(state).value);
expectType<string>(useConstant(() => 'constant'));
expectType<string | undefined>(useLatest('latest').current);

const element = document.createElement('div');
const refOrValue: RefOrValue<Element> = { current: element };
expectType<Element | undefined>(currentValue(refOrValue));
