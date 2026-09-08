/** @jsxImportSource octane */
import { Activity, useRef } from 'octane';

import { useDrag, useDrop } from '../../src/components';

export function NativeDraggable(props: { onDragStart: () => void; onDragEnd?: () => void }) {
	const { dragProps, isDragging } = useDrag({
		getItems: () => [{ 'text/plain': 'item' }],
		onDragStart: props.onDragStart,
		onDragEnd: props.onDragEnd,
	});

	return (
		<button {...dragProps} data-dragging={String(isDragging)}>
			drag me
		</button>
	);
}

export function ActivityDraggable(props: {
	mode: 'visible' | 'hidden';
	onDragStart: () => void;
	onDragEnd: () => void;
}) {
	return (
		<Activity mode={props.mode}>
			<NativeDraggable onDragStart={props.onDragStart} onDragEnd={props.onDragEnd} />
		</Activity>
	);
}

export function ActivatingDropTarget(props: { onDropActivate: () => void }) {
	const ref = useRef<HTMLDivElement | null>(null);
	const { dropProps, isDropTarget } = useDrop({ ref, onDropActivate: props.onDropActivate });

	return (
		<div ref={ref} {...dropProps} data-drop-target={String(isDropTarget)}>
			drop here
		</div>
	);
}
