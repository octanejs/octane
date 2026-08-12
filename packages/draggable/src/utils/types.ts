import type { OctaneNode } from 'octane';

export type DraggableEventHandler = (
	e: MouseEvent | TouchEvent,
	data: DraggableData,
) => void | false;
export type DraggableData = {
	node: HTMLElement;
	x: number;
	y: number;
	deltaX: number;
	deltaY: number;
	lastX: number;
	lastY: number;
};
export type Bounds = { left?: number; top?: number; right?: number; bottom?: number };
export type ControlPosition = { x: number; y: number };
export type PositionOffsetControlPosition = { x: number | string; y: number | string };
export type EventHandler<T> = (e: T) => void | false;
export type MouseTouchEvent = MouseEvent & TouchEvent;
export type DraggableEvent = MouseEvent | TouchEvent;
export type CoreChild = OctaneNode;
