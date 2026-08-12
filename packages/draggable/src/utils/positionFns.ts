// Ported in source order from react-draggable@4.7.1 lib/utils/positionFns.ts.
import {
	innerHeight,
	innerWidth,
	offsetXYFromParent,
	outerHeight,
	outerWidth,
	getTouch,
} from './domFns.ts';
import { int, isNum } from './shims.ts';
import type { Bounds, ControlPosition, DraggableData, MouseTouchEvent } from './types.ts';

export interface CoreModel {
	props: { offsetParent?: HTMLElement; scale: number };
	lastX: number;
	lastY: number;
	findDOMNode(): HTMLElement | null;
}
export interface DraggableModel extends CoreModel {
	props: CoreModel['props'] & { bounds?: Bounds | string; axis?: string };
	state: { x: number; y: number };
}
export function getBoundPosition(
	draggable: DraggableModel,
	x: number,
	y: number,
): [number, number] {
	if (!draggable.props.bounds) return [x, y];
	let bounds: Bounds | string =
		typeof draggable.props.bounds === 'string'
			? draggable.props.bounds
			: { ...draggable.props.bounds };
	const node = findDOMNode(draggable);
	if (typeof bounds === 'string') {
		const ownerWindow = node.ownerDocument.defaultView;
		if (!ownerWindow) throw new Error('Cannot resolve the owner window of the draggable node.');
		const boundNode =
			bounds === 'parent'
				? node.parentNode
				: (node.getRootNode() as Document | ShadowRoot).querySelector(bounds);
		if (!(boundNode instanceof ownerWindow.HTMLElement))
			throw new Error('Bounds selector "' + bounds + '" could not find an element.');
		const nodeStyle = ownerWindow.getComputedStyle(node),
			boundStyle = ownerWindow.getComputedStyle(boundNode);
		bounds = {
			left: -node.offsetLeft + int(boundStyle.paddingLeft) + int(nodeStyle.marginLeft),
			top: -node.offsetTop + int(boundStyle.paddingTop) + int(nodeStyle.marginTop),
			right:
				innerWidth(boundNode) -
				outerWidth(node) -
				node.offsetLeft +
				int(boundStyle.paddingRight) -
				int(nodeStyle.marginRight),
			bottom:
				innerHeight(boundNode) -
				outerHeight(node) -
				node.offsetTop +
				int(boundStyle.paddingBottom) -
				int(nodeStyle.marginBottom),
		};
	}
	if (isNum(bounds.right)) x = Math.min(x, bounds.right);
	if (isNum(bounds.bottom)) y = Math.min(y, bounds.bottom);
	if (isNum(bounds.left)) x = Math.max(x, bounds.left);
	if (isNum(bounds.top)) y = Math.max(y, bounds.top);
	return [x, y];
}
export function snapToGrid(
	grid: readonly [number, number],
	pendingX: number,
	pendingY: number,
): [number, number] {
	return [Math.round(pendingX / grid[0]) * grid[0], Math.round(pendingY / grid[1]) * grid[1]];
}
export function canDragX(draggable: DraggableModel): boolean {
	return draggable.props.axis === 'both' || draggable.props.axis === 'x';
}
export function canDragY(draggable: DraggableModel): boolean {
	return draggable.props.axis === 'both' || draggable.props.axis === 'y';
}
export function getControlPosition(
	e: MouseTouchEvent,
	touchIdentifier: number | null | undefined,
	core: CoreModel,
): ControlPosition | null {
	const touchObj = typeof touchIdentifier === 'number' ? getTouch(e, touchIdentifier) : null;
	if (typeof touchIdentifier === 'number' && !touchObj) return null;
	const node = findDOMNode(core),
		offsetParent = core.props.offsetParent || node.offsetParent || node.ownerDocument.body;
	return offsetXYFromParent(touchObj || e, offsetParent as HTMLElement, core.props.scale);
}
export function createCoreData(core: CoreModel, x: number, y: number): DraggableData {
	const node = findDOMNode(core);
	return !isNum(core.lastX)
		? { node, deltaX: 0, deltaY: 0, lastX: x, lastY: y, x, y }
		: {
				node,
				deltaX: x - core.lastX,
				deltaY: y - core.lastY,
				lastX: core.lastX,
				lastY: core.lastY,
				x,
				y,
			};
}
export function createDraggableData(
	draggable: DraggableModel,
	coreData: DraggableData,
): DraggableData {
	const scale = draggable.props.scale;
	return {
		node: coreData.node,
		x: draggable.state.x + coreData.deltaX / scale,
		y: draggable.state.y + coreData.deltaY / scale,
		deltaX: coreData.deltaX / scale,
		deltaY: coreData.deltaY / scale,
		lastX: draggable.state.x,
		lastY: draggable.state.y,
	};
}
function findDOMNode(draggable: CoreModel): HTMLElement {
	const node = draggable.findDOMNode();
	if (!node) throw new Error('<DraggableCore>: Unmounted during event!');
	return node;
}
