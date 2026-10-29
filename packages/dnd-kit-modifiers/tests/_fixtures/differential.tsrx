import {
	DndContext,
	DragOverlay,
	PointerSensor,
	useDraggable,
	useSensor,
	useSensors,
} from '@octanejs/dnd-kit-core';
import type { Modifiers } from '@octanejs/dnd-kit-core';
import {
	createSnapModifier,
	restrictToFirstScrollableAncestor,
	restrictToHorizontalAxis,
	restrictToParentElement,
	restrictToVerticalAxis,
	restrictToWindowEdges,
	snapCenterToCursor,
} from '@octanejs/dnd-kit-modifiers';
import { CSS } from '@octanejs/dnd-kit-utilities';

export type Preset = 'horizontal' | 'vertical' | 'window' | 'snap';

const PRESETS: Record<Preset, Modifiers> = {
	horizontal: [restrictToHorizontalAxis, restrictToFirstScrollableAncestor],
	vertical: [restrictToVerticalAxis, restrictToParentElement],
	window: [restrictToWindowEdges],
	snap: [createSnapModifier(25)],
};

function Handle(props: { id: string }) @{
	const draggable = useDraggable({ id: props.id });
	<button
		type="button"
		id={props.id}
		data-rect="20,20,40,40"
		ref={draggable.setNodeRef}
		style={{ transform: CSS.Translate.toString(draggable.transform) }}
		{...draggable.listeners}
	>
		{props.id as string}
	</button>
}

/** One draggable inside a scrollable track, constrained by a modifier preset. */
export function ModifierBoard(props: { preset: Preset }) @{
	const sensors = useSensors(useSensor(PointerSensor));
	<DndContext sensors={sensors} modifiers={PRESETS[props.preset]}>
		<div id="scroller" data-rect="0,0,400,100" style={{ overflow: 'auto' }}>
			<div id="track" data-rect="0,0,300,80">
				<Handle id="handle" />
			</div>
		</div>
	</DndContext>
}

/** DragOverlay modifiers: snap the overlay to the cursor inside the window. */
export function OverlayModifierBoard() @{
	const sensors = useSensors(useSensor(PointerSensor));
	<DndContext sensors={sensors}>
		<div id="track" data-rect="0,0,300,80">
			<Handle id="handle" />
		</div>
		<DragOverlay modifiers={[snapCenterToCursor, restrictToWindowEdges]} dropAnimation={null}>
			<span id="overlay">overlay</span>
		</DragOverlay>
	</DndContext>
}
