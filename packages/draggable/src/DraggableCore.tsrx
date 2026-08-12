// Hook-backed Octane port of react-draggable@4.7.1 lib/DraggableCore.tsx.
import {
	descriptorChildren,
	type ElementDescriptor,
	type OctaneNode,
	useLayoutEffect,
	useRef,
} from 'octane';
import {
	addEvent,
	addUserSelectStyles,
	getTouchIdentifier,
	matchesSelectorAndParentsTo,
	removeEvent,
	scheduleRemoveUserSelectStyles,
} from './utils/domFns.ts';
import {
	createCoreData,
	getControlPosition,
	snapToGrid,
	type CoreModel,
} from './utils/positionFns.ts';
import { cloneCoreChild } from './internal.ts';
import type { DraggableEventHandler, MouseTouchEvent } from './utils/types.ts';

export type { ControlPosition, DraggableData, DraggableEvent, DraggableEventHandler, PositionOffsetControlPosition } from './utils/types.ts';
export type DraggableCoreProps = {
	allowAnyClick?: boolean;
	allowMobileScroll?: boolean;
	disabled?: boolean;
	enableUserSelectHack?: boolean;
	onStart?: DraggableEventHandler;
	onDrag?: DraggableEventHandler;
	onStop?: DraggableEventHandler;
	onMouseDown?: (e: MouseEvent) => void;
	scale?: number;
	cancel?: string;
	children?: OctaneNode;
	offsetParent?: HTMLElement;
	grid?: readonly [number, number];
	handle?: string;
	nodeRef?: { current: HTMLElement | null } | null;
	nonce?: string;
};
type ResolvedProps =
	DraggableCoreProps & Required<
		Pick<
			DraggableCoreProps,
			| 'allowAnyClick'
			| 'allowMobileScroll'
			| 'disabled'
			| 'enableUserSelectHack'
			| 'onStart'
			| 'onDrag'
			| 'onStop'
			| 'onMouseDown'
			| 'scale'
		>
	>;
const noop = () => {};
const defaults = {
	allowAnyClick: false,
	allowMobileScroll: false,
	disabled: false,
	enableUserSelectHack: true,
	onStart: noop,
	onDrag: noop,
	onStop: noop,
	onMouseDown: noop,
	scale: 1,
} as const;
const eventsFor = {
	touch: { start: 'touchstart', move: 'touchmove', stop: 'touchend' },
	mouse: { start: 'mousedown', move: 'mousemove', stop: 'mouseup' },
} as const;
let dragEventFor: { start: string; move: string; stop: string } = eventsFor.mouse;

interface CoreState extends CoreModel {
	props: ResolvedProps;
	dragging: boolean;
	touchIdentifier: number | null | undefined;
	mounted: boolean;
	handleDrag(e: MouseTouchEvent): void;
	handleDragStop(e: MouseTouchEvent): void;
}

function DraggableCoreImpl(inputProps: Partial<DraggableCoreProps>): ElementDescriptor {
	const props = { ...defaults, ...inputProps } as ResolvedProps;
	const propsRef = useRef(props);
	propsRef.current = props;
	const stateRef = useRef<CoreState | null>(null);
	if (!stateRef.current) {
		const state = {
			get props() {
				return propsRef.current;
			},
			dragging: false,
			lastX: NaN,
			lastY: NaN,
			touchIdentifier: null,
			mounted: false,
			findDOMNode: () => propsRef.current.nodeRef?.current ?? null,
			handleDrag: (_e: MouseTouchEvent) => {},
			handleDragStop: (_e: MouseTouchEvent) => {},
		} as CoreState;
		state.handleDrag = (e) => {
			const position = getControlPosition(e, state.touchIdentifier, state);
			if (position == null) return;
			let { x, y } = position;
			if (Array.isArray(state.props.grid)) {
				let dx = x - state.lastX, dy = y - state.lastY;
				[dx, dy] = snapToGrid(state.props.grid, dx, dy);
				if (!dx && !dy) return;
				x = state.lastX + dx;
				y = state.lastY + dy;
			}
			const data = createCoreData(state, x, y);
			if (state.props.onDrag(e, data) === false || !state.mounted) {
				try {
					state.handleDragStop(new MouseEvent('mouseup') as MouseTouchEvent);
				} catch {
					const forced = document.createEvent('MouseEvents') as unknown as MouseTouchEvent;
					forced.initMouseEvent(
						'mouseup',
						true,
						true,
						window,
						0,
						0,
						0,
						0,
						0,
						false,
						false,
						false,
						false,
						0,
						null,
					);
					state.handleDragStop(forced);
				}
				return;
			}
			state.lastX = x;
			state.lastY = y;
		};
		state.handleDragStop = (e) => {
			if (!state.dragging) return;
			const position = getControlPosition(e, state.touchIdentifier, state);
			if (position == null) return;
			let { x, y } = position;
			if (Array.isArray(state.props.grid)) {
				let dx = x - state.lastX || 0, dy = y - state.lastY || 0;
				[dx, dy] = snapToGrid(state.props.grid, dx, dy);
				x = state.lastX + dx;
				y = state.lastY + dy;
			}
			if (state.props.onStop(e, createCoreData(state, x, y)) === false || !state.mounted) return;
			const node = state.findDOMNode();
			if (node && state.props.enableUserSelectHack) scheduleRemoveUserSelectStyles(
				node.ownerDocument,
			);
			state.dragging = false;
			state.lastX = NaN;
			state.lastY = NaN;
			if (node) {
				removeEvent(node.ownerDocument, dragEventFor.move, state.handleDrag);
				removeEvent(node.ownerDocument, dragEventFor.stop, state.handleDragStop);
			}
		};
		stateRef.current = state;
	}
	const state = stateRef.current;
	const handleDragStart = (e: MouseTouchEvent) => {
		state.props.onMouseDown(e);
		if (
			!state.props.allowAnyClick && (typeof e.button === 'number' && e.button !== 0 || e.ctrlKey)
		) return false;
		const node = state.findDOMNode();
		if (!node?.ownerDocument?.body) throw new Error('<DraggableCore> not mounted on DragStart!');
		const ownerDocument = node.ownerDocument;
		if (
			state.props.disabled || !(e.target instanceof ownerDocument.defaultView!.Node) ||
				state.props.handle && !matchesSelectorAndParentsTo(e.target, state.props.handle, node) ||
				state.props.cancel && matchesSelectorAndParentsTo(e.target, state.props.cancel, node)
		) return;
		if (e.type === 'touchstart' && !state.props.allowMobileScroll) e.preventDefault();
		state.touchIdentifier = getTouchIdentifier(e);
		const position = getControlPosition(e, state.touchIdentifier, state);
		if (!position) return;
		const { x, y } = position;
		if (state.props.onStart(e, createCoreData(state, x, y)) === false || !state.mounted) return;
		if (state.props.enableUserSelectHack) addUserSelectStyles(ownerDocument, state.props.nonce);
		state.dragging = true;
		state.lastX = x;
		state.lastY = y;
		addEvent(ownerDocument, dragEventFor.move, state.handleDrag);
		addEvent(ownerDocument, dragEventFor.stop, state.handleDragStop);
	};
	const onMouseDown = (e: MouseEvent) => {
		dragEventFor = eventsFor.mouse;
		return handleDragStart(e as MouseTouchEvent);
	};
	const onMouseUp = (e: MouseEvent) => {
		dragEventFor = eventsFor.mouse;
		return state.handleDragStop(e as MouseTouchEvent);
	};
	const onTouchStart = (e: Event) => {
		dragEventFor = eventsFor.touch;
		return handleDragStart(e as MouseTouchEvent);
	};
	const onTouchEnd = (e: TouchEvent) => {
		dragEventFor = eventsFor.touch;
		return state.handleDragStop(e as MouseTouchEvent);
	};
	useLayoutEffect(() => {
		state.mounted = true;
		const node = state.findDOMNode();
		if (node) addEvent(node, eventsFor.touch.start, onTouchStart, { passive: false });
		return () => {
			state.mounted = false;
			const current = state.findDOMNode();
			if (!current) return;
			const doc = current.ownerDocument;
			removeEvent(doc, eventsFor.mouse.move, state.handleDrag);
			removeEvent(doc, eventsFor.touch.move, state.handleDrag);
			removeEvent(doc, eventsFor.mouse.stop, state.handleDragStop);
			removeEvent(doc, eventsFor.touch.stop, state.handleDragStop);
			removeEvent(current, eventsFor.touch.start, onTouchStart, { passive: false });
			if (state.props.enableUserSelectHack) scheduleRemoveUserSelectStyles(doc);
		};
	}, []);
	return cloneCoreChild(props.children, {
		onMouseDown,
		onMouseUp,
		onTouchEnd,
	});
}

const DraggableCore = DraggableCoreImpl as
	typeof DraggableCoreImpl & {
		displayName?: string;
		defaultProps?: DraggableCoreProps;
	};
DraggableCore.displayName = 'DraggableCore';
DraggableCore.defaultProps = defaults;

export { DraggableCore };
export default descriptorChildren(DraggableCore);
