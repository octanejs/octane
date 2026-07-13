import {
	DragDropProvider,
	DragOverlay,
	useDragDropManager,
	useDraggable,
	useDroppable,
} from '@octanejs/dnd-kit';
import { useSortable } from '@octanejs/dnd-kit/sortable';

export let latestManager = null;

function ServerEntities() @{
	latestManager = useDragDropManager();
	const draggable = useDraggable({ id: 'server-drag', data: { label: 'server card' } });
	const droppable = useDroppable({ id: 'server-drop' });
	const sortable = useSortable({ id: 'server-sort', index: 0, plugins: [] });
	<main id="server-dnd">
		<button id="server-drag" ref={draggable.ref}>server card</button>
		<div id="server-drop" ref={droppable.ref}>server target</div>
		<div id="server-sort" ref={sortable.ref}>server sortable</div>
	</main>
}

export function ServerFixture(props) @{
	<DragDropProvider sensors={props.sensors ?? []} plugins={props.plugins ?? []} modifiers={[]}>
		<ServerEntities />
		<DragOverlay dropAnimation={null}>
			<span id="server-overlay">not active</span>
		</DragOverlay>
	</DragDropProvider>
}
