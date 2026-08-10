/**
 * One-for-one Octane adaptation of upstream tag/typings/test.tsx.
 *
 * Allowed transforms:
 * - import root: react-draggable -> @octanejs/react-draggable
 * - React.createRoot / React.createRef runtime mount -> type-only prop object probes
 * - class-component ref props -> Octane function-component + nodeRef prop surface
 * - JSX children remain single-element probes matching the published consumer contract
 */

import Draggable, {
	DraggableCore,
	type DraggableCoreProps,
	type DraggableProps,
} from '@octanejs/react-draggable';

function handleStart() {}
function handleDrag() {}
function handleStop() {}
function handleMouseDown() {}

const nodeRef = { current: null as HTMLDivElement | null };

const draggableProps: DraggableProps = {
	axis: 'y',
	handle: '.handle',
	cancel: '.cancel',
	grid: [10, 10],
	onStart: handleStart,
	onDrag: handleDrag,
	onStop: handleStop,
	offsetParent: document.body,
	onMouseDown: handleMouseDown,
	allowAnyClick: true,
	allowMobileScroll: false,
	disabled: true,
	enableUserSelectHack: false,
	bounds: false,
	defaultClassName: 'draggable',
	defaultClassNameDragging: 'dragging',
	defaultClassNameDragged: 'dragged',
	defaultPosition: { x: 0, y: 0 },
	nodeRef,
	positionOffset: { x: 0, y: 0 },
	position: { x: 50, y: 50 },
};

const coreProps: DraggableCoreProps = {
	handle: '.handle',
	cancel: '.cancel',
	allowAnyClick: true,
	disabled: true,
	onMouseDown: handleMouseDown,
	grid: [10, 10],
	nodeRef,
	onStart: handleStart,
	onDrag: handleDrag,
	onStop: handleStop,
	offsetParent: document.body,
	enableUserSelectHack: false,
	allowMobileScroll: false,
};

const bareDraggableProps: DraggableProps = {};
const bareCoreProps: DraggableCoreProps = {};

void [Draggable, DraggableCore, draggableProps, coreProps, bareDraggableProps, bareCoreProps];
