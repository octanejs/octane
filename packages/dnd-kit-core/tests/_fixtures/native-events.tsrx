import { useState } from 'octane';
import type { OctaneNode } from 'octane';
import { DndContext, useDraggable, useSensor, useSensors } from '@octanejs/dnd-kit-core';
import type { DragStartEvent, SensorProps } from '@octanejs/dnd-kit-core';

/** What each activator call received: the event's type and whether it had `nativeEvent`. */
export const activations: string[] = [];

/** A custom sensor written against native events, as migrated app code is. */
class NativePointerSensor {
	static activators = [
		{
			eventName: 'onPointerDown' as const,
			handler: (event: PointerEvent) => {
				activations.push(`${event.constructor.name}:${'nativeEvent' in event}`);
				return event.isPrimary && event.button === 0;
			},
		},
	];
	autoScrollEnabled = false;

	constructor(props: SensorProps<object>) {
		props.onStart({ x: 0, y: 0 });
		const end = () => {
			document.removeEventListener('pointerup', end);
			props.onEnd();
		};
		document.addEventListener('pointerup', end);
	}
}

function Draggable(props: { id: string; children?: OctaneNode }) @{
	const draggable = useDraggable({ id: props.id });
	<div id={props.id} ref={draggable.setNodeRef} {...draggable.listeners}>
		{props.children}
	</div>
}

export function NestedDraggables() @{
	const [started, setStarted] = useState('none');
	const sensors = useSensors(useSensor(NativePointerSensor));
	<DndContext
		sensors={sensors}
		onDragStart={(event: DragStartEvent) => setStarted(String(event.active.id))}
	>
		<Draggable id="outer">
			<Draggable id="inner" />
		</Draggable>
		<output id="started">{started as string}</output>
	</DndContext>
}
