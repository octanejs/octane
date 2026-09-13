import { RefCallback } from 'react';
interface FloatingWindowPositionConfig {
    top?: number;
    left?: number;
    right?: number;
    bottom?: number;
}
interface FloatingWindowPosition {
    /** Element offset from the left side of the viewport */
    x: number;
    /** Element offset from the top side of the viewport */
    y: number;
}
export interface UseFloatingWindowOptions {
    /** If `false`, the element can not be dragged. */
    enabled?: boolean;
    /** If `true`, the element can only move within the current viewport boundaries. */
    constrainToViewport?: boolean;
    /** The offset from the viewport edges when constraining the element. Requires `constrainToViewport: true`. */
    constrainOffset?: number;
    /** Selector of an element that should be used to drag floating window. If not specified, the entire root element is used as a drag target. */
    dragHandleSelector?: string;
    /** Selector of an element within `dragHandleSelector` that should be excluded from the drag event. */
    excludeDragHandleSelector?: string;
    /** If set, restricts movement to the specified axis */
    axis?: 'x' | 'y';
    /** Initial position. If not set, calculated from element styles. */
    initialPosition?: FloatingWindowPositionConfig;
    /** Called when the element position changes */
    onPositionChange?: (pos: FloatingWindowPosition) => void;
    /** Called when the drag starts */
    onDragStart?: () => void;
    /** Called when the drag stops */
    onDragEnd?: () => void;
}
export type SetFloatingWindowPosition = (position: FloatingWindowPositionConfig) => void;
export interface UseFloatingWindowReturnValue<T extends HTMLElement> {
    /** Ref to the element that should be draggable */
    ref: RefCallback<T | null>;
    /** Function to set the position of the element */
    setPosition: SetFloatingWindowPosition;
    /** `true` if the element is currently being dragged */
    isDragging: boolean;
}
export declare function useFloatingWindow<T extends HTMLElement>(options?: UseFloatingWindowOptions): UseFloatingWindowReturnValue<T>;
export declare namespace useFloatingWindow {
    type Options = UseFloatingWindowOptions;
    type Position = FloatingWindowPosition;
    type SetPosition = SetFloatingWindowPosition;
    type ReturnValue<T extends HTMLElement> = UseFloatingWindowReturnValue<T>;
}
export {};
