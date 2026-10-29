import type { OctaneNode } from 'octane';
import {
	DndContext,
	DragOverlay,
	KeyboardSensor,
	PointerSensor,
	closestCenter,
	useDndContext,
	useDndMonitor,
	useDraggable,
	useDroppable,
	useSensor,
	useSensors,
	type Activator,
	type CollisionDetection,
	type DndContextProps,
	type DraggableAttributes,
	type DraggableSyntheticListeners,
	type DragEndEvent,
	type Modifier,
	type SensorDescriptor,
	type SensorOptions,
	type UniqueIdentifier,
} from '@octanejs/dnd-kit-core';
import type { Transform } from '@octanejs/dnd-kit-utilities';
import type { Assert, Equal } from '../../../scripts/react-port/type-assertions';

const sensors = useSensors(
	useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
	useSensor(KeyboardSensor),
);
type _sensors = Assert<Equal<typeof sensors, SensorDescriptor<SensorOptions>[]>>;
type _collision = Assert<Equal<typeof closestCenter, CollisionDetection>>;
type _children = Assert<Equal<DndContextProps['children'], OctaneNode>>;
type _onDragEnd = Assert<
	Equal<DndContextProps['onDragEnd'], ((event: DragEndEvent) => void) | undefined>
>;
type _modifiers = Assert<Equal<DndContextProps['modifiers'], Modifier[] | undefined>>;

const draggable = useDraggable({ id: 'card' });
type _attributes = Assert<Equal<typeof draggable.attributes, DraggableAttributes>>;
type _listeners = Assert<Equal<typeof draggable.listeners, DraggableSyntheticListeners>>;
type _transform = Assert<Equal<typeof draggable.transform, Transform | null>>;
type _setNodeRef = Assert<
	Equal<typeof draggable.setNodeRef, (element: HTMLElement | null) => void>
>;
const droppable = useDroppable({ id: 'zone' });
type _isOver = Assert<Equal<typeof droppable.isOver, boolean>>;
const context = useDndContext();
type _activeId = Assert<Equal<NonNullable<typeof context.active>['id'], UniqueIdentifier>>;
useDndMonitor({
	onDragEnd(event) {
		type _event = Assert<Equal<typeof event, DragEndEvent>>;
	},
});

// Activator handlers receive the native event.
const activator: Activator<object> = {
	eventName: 'onPointerDown',
	handler: (event: PointerEvent) => event.isPrimary,
};
type _activatorName = Assert<
	Equal<(typeof activator)['eventName'], Activator<object>['eventName']>
>;
type _overlay = Assert<Equal<Parameters<typeof DragOverlay>[0]['zIndex'], number | undefined>>;
type _context = Assert<Equal<Parameters<typeof DndContext>[0], DndContextProps>>;

// @ts-expect-error activation distances are numbers
useSensor(PointerSensor, { activationConstraint: { distance: '6' } });
// @ts-expect-error activators name a JSX event listener prop
const invalid: Activator<object> = { eventName: 'pointerdown', handler: () => true };
