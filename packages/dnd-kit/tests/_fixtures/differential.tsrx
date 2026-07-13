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

const sensors = [];
const plugins = [Feedback];

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

function Controls() @{
	const manager = useDragDropManager();
	<nav>
		<button
			id="pickup"
			onClick={() => manager.actions.start({ source: 'drag', coordinates: { x: 20, y: 20 } })}
		>
			pickup
		</button>
		<button id="move" onClick={() => manager.actions.move({ by: { x: 10, y: 10 } })}>
			move
		</button>
		<button id="drop-control" onClick={() => manager.actions.stop()}>drop</button>
	</nav>
}

export function KeyboardDragFixture() @{
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
			{(source) => <span id="overlay">
				{String(source.id) as string}
			</span>}
		</DragOverlay>
	</DragDropProvider>
}
