/**
 * One-for-one Octane adaptation of upstream tag/test/typeCompat/fixture.tsx.
 *
 * Allowed transforms (recorded in audit/upstream-inventory.json allowedTransforms):
 * - import root: react-draggable -> @octanejs/draggable
 * - React.MouseEvent/TouchEvent unions -> native MouseEvent/TouchEvent (Octane events)
 * - React.Component class assignability -> function-component component types
 * - children: React.ReactNode -> OctaneNode / omit class-only children probes that are
 *   React-declaration regressions for the published React package
 * - JSX consumer usage of the fixture lives in typings.consumer.tsrx
 */

import Draggable, {
	DraggableCore,
	type ControlPosition,
	type DraggableBounds,
	type DraggableCoreProps,
	type DraggableData,
	type DraggableEvent,
	type DraggableEventHandler,
	type DraggableProps,
	type PositionOffsetControlPosition,
} from '@octanejs/draggable';

// One-for-one Octane type-seam adaptation of the pinned tag's typings/test.tsx
// and test/typeCompat/fixture.tsx public root imports and accept/reject shapes.

const position: ControlPosition = { x: 1, y: 2 };
const offset: PositionOffsetControlPosition = { x: '10%', y: 3 };
const bounds: DraggableBounds = { left: 0, right: 10 };
const coreProps: DraggableCoreProps = { nodeRef: { current: null } };
const props: DraggableProps = { position, positionOffset: offset, bounds };
const handler: DraggableEventHandler = (event: DraggableEvent, data: DraggableData) => {
	void event;
	void data;
};

function expectType<T>(_value: T): void {}

expectType<number>(position.x);
expectType<number>(position.y);
expectType<number | string>(offset.x);
expectType<number | string>(offset.y);
expectType<number | undefined>(bounds.left);
expectType<number | undefined>(bounds.right);
expectType<number | undefined>(bounds.top);
expectType<number | undefined>(bounds.bottom);

const data: DraggableData = {
	node: document.createElement('div'),
	x: 0,
	y: 0,
	deltaX: 0,
	deltaY: 0,
	lastX: 0,
	lastY: 0,
};
expectType<HTMLElement>(data.node);
expectType<number>(data.x);
expectType<number>(data.y);
expectType<number>(data.deltaX);
expectType<number>(data.deltaY);
expectType<number>(data.lastX);
expectType<number>(data.lastY);

const mouseEvent: DraggableEvent = new MouseEvent('mousedown');
const touchEvent: DraggableEvent = {} as TouchEvent;
const handlerFalse: DraggableEventHandler = () => false;
const allCoreProps: DraggableCoreProps = {
	allowAnyClick: true,
	allowMobileScroll: false,
	cancel: '.cancel',
	disabled: false,
	enableUserSelectHack: true,
	offsetParent: document.body,
	grid: [10, 10],
	handle: '.handle',
	nodeRef: { current: document.body },
	onStart: handler,
	onDrag: handlerFalse,
	onStop: handler,
	onMouseDown: () => {},
	scale: 1,
	nonce: 'nonce',
};
expectType<boolean | undefined>(allCoreProps.allowAnyClick);
expectType<boolean | undefined>(allCoreProps.allowMobileScroll);
expectType<string | undefined>(allCoreProps.cancel);
expectType<boolean | undefined>(allCoreProps.disabled);
expectType<boolean | undefined>(allCoreProps.enableUserSelectHack);
expectType<HTMLElement | undefined>(allCoreProps.offsetParent);
expectType<readonly [number, number] | undefined>(allCoreProps.grid);
expectType<string | undefined>(allCoreProps.handle);
expectType<DraggableEventHandler | undefined>(allCoreProps.onStart);
expectType<DraggableEventHandler | undefined>(allCoreProps.onDrag);
expectType<DraggableEventHandler | undefined>(allCoreProps.onStop);
expectType<((event: MouseEvent) => void) | undefined>(allCoreProps.onMouseDown);
expectType<number | undefined>(allCoreProps.scale);

const allProps: DraggableProps = {
	...allCoreProps,
	axis: 'both',
	bounds: 'parent',
	defaultClassName: 'draggable',
	defaultClassNameDragging: 'dragging',
	defaultClassNameDragged: 'dragged',
	defaultPosition: { x: 0, y: 0 },
	positionOffset: { x: '10%', y: 0 },
	position: { x: 50, y: 50 },
};
expectType<'both' | 'x' | 'y' | 'none' | undefined>(allProps.axis);
expectType<DraggableBounds | string | false | undefined>(allProps.bounds);
expectType<string | undefined>(allProps.defaultClassName);
expectType<string | undefined>(allProps.defaultClassNameDragging);
expectType<string | undefined>(allProps.defaultClassNameDragged);
expectType<ControlPosition | undefined>(allProps.defaultPosition);
expectType<PositionOffsetControlPosition | undefined>(allProps.positionOffset);
expectType<ControlPosition | undefined>(allProps.position);
const asCore: DraggableCoreProps = allProps;

const axisX: DraggableProps['axis'] = 'x';
const axisY: DraggableProps['axis'] = 'y';
const axisNone: DraggableProps['axis'] = 'none';
const objectBounds: DraggableProps['bounds'] = { left: 0, top: 0 };
const falseBounds: DraggableProps['bounds'] = false;
const bareCoreProps: DraggableCoreProps = {};
const bareProps: DraggableProps = {};

void [
	Draggable,
	DraggableCore,
	coreProps,
	props,
	handler,
	data,
	mouseEvent,
	touchEvent,
	handlerFalse,
	allCoreProps,
	allProps,
	asCore,
	axisX,
	axisY,
	axisNone,
	objectBounds,
	falseBounds,
	bareCoreProps,
	bareProps,
];
Draggable.displayName;
Draggable.defaultProps;
DraggableCore.displayName;
DraggableCore.defaultProps;

// @ts-expect-error positions require both coordinates
const badPosition: ControlPosition = { x: 1 };
// @ts-expect-error callback data coordinates are numeric
const badData: DraggableData = { node: document.body, x: '1' };
void [badPosition, badData];
