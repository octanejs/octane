import { useState } from 'octane';
import { Feedback } from '@dnd-kit/dom';
import {
	DragDropProvider,
	DragOverlay,
	useDragDropManager,
	useDragOperation,
	useDraggable,
	useDroppable,
} from '@octanejs/dnd-kit';
import { useSortable } from '@octanejs/dnd-kit/sortable';

const sensors = [];
const plugins = [Feedback];

function pluginNames(pluginsValue: unknown): string {
	return ((Array.isArray(pluginsValue) ? pluginsValue : [])).map(function (plugin: unknown) {
		if (typeof plugin === 'function') {
			return (plugin as { name?: string }).name ?? 'anonymous';
		}
		if (plugin && typeof plugin === 'object') {
			return (plugin as { constructor?: { name?: string } }).constructor?.name ?? 'unknown';
		}
		return String(plugin);
	}).sort().join('|');
}

function DraggableCard() @{
	const draggable = useDraggable({ id: 'drag', data: { label: 'Card' } });
	<button id="drag" ref={draggable.ref} data-source={draggable.isDragSource as string}>
		drag
	</button>
}

function DropTarget() @{
	const droppable = useDroppable({ id: 'drop' });
	<div id="drop" ref={droppable.ref} data-target={droppable.isDropTarget as string}>drop</div>
}

function OperationStatus() @{
	const operation = useDragOperation();
	<output id="status">{`${String(operation.source?.id ?? 'none')}:${String(
		operation.target?.id ?? 'none',
	)}`}</output>
}

function Controls(props: { sourceId?: string }) @{
	const manager = useDragDropManager();
	const sourceId = props.sourceId ?? 'drag';
	<nav>
		<button
			id="pickup"
			onClick={() => manager.actions.start({ source: sourceId, coordinates: { x: 20, y: 20 } })}
		>
			pickup
		</button>
		<button id="move" onClick={() => manager.actions.move({ by: { x: 10, y: 10 } })}>
			move
		</button>
		<button id="drop-control" onClick={() => manager.actions.stop()}>drop</button>
	</nav>
}

/** Programmatic manager.actions lifecycle — sensors=[]; no keyboard path. */
export function ProgrammaticManagerDragFixture() @{
	const [events, setEvents] = useState('idle');
	<DragDropProvider
		sensors={sensors}
		plugins={plugins}
		modifiers={[]}
		onDragStart={() => setEvents('started')}
		onDragEnd={(event) => setEvents(event.canceled ? 'canceled' : 'ended')}
	>
		<DraggableCard />
		<DropTarget />
		<OperationStatus />
		<Controls />
		<output id="events">{events}</output>
		<DragOverlay dropAnimation={null}>
			{(source) => <span id="overlay">{String(source.id) as string}</span>}
		</DragOverlay>
	</DragDropProvider>
}

/**
 * Static overlay children exercise Octane's compiled-children guard: the
 * children block is a function, but must render as content rather than be
 * invoked as a render prop with the active source.
 */
export function StaticOverlayDragFixture() @{
	<DragDropProvider sensors={sensors} plugins={plugins} modifiers={[]}>
		<DraggableCard />
		<DropTarget />
		<Controls />
		<DragOverlay dropAnimation={null}>
			<span id="static-overlay">static overlay</span>
		</DragOverlay>
	</DragDropProvider>
}

function DefaultSortableItem(props: { id: string; index: number }) @{
	const sortable = useSortable({ id: props.id, index: props.index });
	<li
		id={props.id}
		ref={sortable.ref}
		data-plugins={pluginNames(sortable.sortable.draggable.plugins) as string}
	>
		<button
			id={`${props.id}-handle` as string}
			ref={sortable.handleRef}
		>{props.id as string}</button>
	</li>
}

/** Omits plugins so each adapter applies its useSortable defaults. */
export function DefaultSortablePluginsFixture() @{
	<DragDropProvider sensors={sensors} plugins={[]} modifiers={[]}>
		<ol>
			<DefaultSortableItem id="sort-a" index={0} />
			<DefaultSortableItem id="sort-b" index={1} />
		</ol>
		<Controls sourceId="sort-a" />
	</DragDropProvider>
}
