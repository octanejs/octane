import { useState } from 'octane';
import {
	DndContext,
	KeyboardSensor,
	PointerSensor,
	closestCenter,
	useSensor,
	useSensors,
} from '@octanejs/dnd-kit-core';
import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@octanejs/dnd-kit-core';
import {
	SortableContext,
	arrayMove,
	defaultAnimateLayoutChanges,
	horizontalListSortingStrategy,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from '@octanejs/dnd-kit-sortable';
import type { AnimateLayoutChanges } from '@octanejs/dnd-kit-sortable';
import { CSS } from '@octanejs/dnd-kit-utilities';

const animateWhileSorting: AnimateLayoutChanges = (args) =>
	args.isSorting ? defaultAnimateLayoutChanges(args) : false;

function SortableRow(props: { id: string }) @{
	const sortable = useSortable({ id: props.id, animateLayoutChanges: animateWhileSorting });
	<li
		ref={sortable.setNodeRef}
		id={`row-${props.id}` as string}
		data-dragging={String(sortable.isDragging)}
		data-sorting={String(sortable.isSorting)}
		data-index={`${sortable.index}->${sortable.newIndex}` as string}
		data-over={String(sortable.isOver)}
		style={{
			transform: CSS.Transform.toString(sortable.transform),
			transition: sortable.transition,
		}}
		{...sortable.attributes}
		{...sortable.listeners}
	>
		{props.id as string}
	</li>
}

function describeStart(event: DragStartEvent): string {
	return `start:${String(event.active.id)}`;
}

function describeOver(event: DragOverEvent): string {
	return `over:${String(event.active.id)}>${String(event.over?.id ?? 'none')}`;
}

function describeEnd(kind: string, event: DragEndEvent): string {
	return `${kind}:${String(event.active.id)}>${String(event.over?.id ?? 'none')}`;
}

/** A vertical list sorted with the keyboard, as in dnd kit's sortable presets. */
export function VerticalSortableList() @{
	const [items, setItems] = useState(['alpha', 'beta', 'gamma', 'delta']);
	const [log, setLog] = useState('idle');
	const sensors = useSensors(
		useSensor(PointerSensor),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
	);
	<DndContext
		sensors={sensors}
		collisionDetection={closestCenter}
		onDragStart={(event: DragStartEvent) =>
			setLog((previous) => `${previous}|${describeStart(event)}`)
		}
		onDragOver={(event: DragOverEvent) =>
			setLog((previous) => `${previous}|${describeOver(event)}`)
		}
		onDragEnd={(event: DragEndEvent) => {
			setLog((previous) => `${previous}|${describeEnd('end', event)}`);
			const over = event.over;
			if (over && event.active.id !== over.id) {
				setItems((previous) =>
					arrayMove(
						previous,
						previous.indexOf(String(event.active.id)),
						previous.indexOf(String(over.id)),
					),
				);
			}
		}}
		onDragCancel={(event: DragEndEvent) =>
			setLog((previous) => `${previous}|${describeEnd('cancel', event)}`)
		}
	>
		<SortableContext items={items} strategy={verticalListSortingStrategy}>
			<ul id="list">
				@for (const id of items; key id) {
					<SortableRow id={id} />
				}
			</ul>
		</SortableContext>
		<output id="log">{log as string}</output>
	</DndContext>
}

function SortableTab(props: { id: string }) @{
	const sortable = useSortable({ id: props.id });
	<button
		type="button"
		ref={sortable.setNodeRef}
		id={`tab-${props.id}` as string}
		data-dragging={String(sortable.isDragging)}
		style={{
			transform: CSS.Translate.toString(sortable.transform),
			transition: sortable.transition,
		}}
		{...sortable.listeners}
	>
		{props.id as string}
	</button>
}

/** Horizontal tabs dragged with a pointer past a distance constraint. */
export function HorizontalSortableTabs() @{
	const [tabs, setTabs] = useState(['files', 'diff', 'terminal']);
	const [log, setLog] = useState('idle');
	const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
	<DndContext
		sensors={sensors}
		collisionDetection={closestCenter}
		onDragStart={(event: DragStartEvent) =>
			setLog((previous) => `${previous}|${describeStart(event)}`)
		}
		onDragEnd={(event: DragEndEvent) => {
			setLog((previous) => `${previous}|${describeEnd('end', event)}`);
			const over = event.over;
			if (over && event.active.id !== over.id) {
				setTabs((previous) =>
					arrayMove(
						previous,
						previous.indexOf(String(event.active.id)),
						previous.indexOf(String(over.id)),
					),
				);
			}
		}}
	>
		<SortableContext items={tabs} strategy={horizontalListSortingStrategy}>
			<nav id="tabs">
				@for (const id of tabs; key id) {
					<SortableTab id={id} />
				}
			</nav>
		</SortableContext>
		<output id="log">{log as string}</output>
	</DndContext>
}
