import * as React from 'react';
import { ReactElement } from 'react';

type DraggableEventHandler = (e: MouseEvent, data: DraggableData) => void | false;
type DraggableData = {
    node: HTMLElement;
    x: number;
    y: number;
    deltaX: number;
    deltaY: number;
    lastX: number;
    lastY: number;
};
type Bounds = {
    left?: number;
    top?: number;
    right?: number;
    bottom?: number;
};
type ControlPosition = {
    x: number;
    y: number;
};
type PositionOffsetControlPosition = {
    x: number | string;
    y: number | string;
};
type EventHandler<T> = (e: T) => void | false;
type MouseTouchEvent = MouseEvent & TouchEvent;
type DraggableEvent = React.MouseEvent<HTMLElement | SVGElement> | React.TouchEvent<HTMLElement | SVGElement> | MouseEvent | TouchEvent;

type DraggableCoreDefaultProps = {
    allowAnyClick: boolean;
    allowMobileScroll: boolean;
    disabled: boolean;
    enableUserSelectHack: boolean;
    onStart: DraggableEventHandler;
    onDrag: DraggableEventHandler;
    onStop: DraggableEventHandler;
    onMouseDown: (e: MouseEvent) => void;
    scale: number;
};
type DraggableCoreProps = DraggableCoreDefaultProps & {
    cancel: string;
    children?: React.ReactNode;
    offsetParent: HTMLElement;
    grid: [number, number];
    handle: string;
    nodeRef?: React.RefObject<HTMLElement | null> | null;
    nonce?: string;
};
declare class DraggableCore extends React.Component<Partial<DraggableCoreProps>> {
    props: DraggableCoreProps;
    static displayName: string | undefined;
    static propTypes?: {
        [key: string]: unknown;
    };
    static defaultProps: DraggableCoreProps;
    dragging: boolean;
    lastX: number;
    lastY: number;
    touchIdentifier: number | null | undefined;
    mounted: boolean;
    componentDidMount(): void;
    componentWillUnmount(): void;
    findDOMNode(): HTMLElement | null;
    handleDragStart: EventHandler<MouseTouchEvent>;
    handleDrag: EventHandler<MouseTouchEvent>;
    handleDragStop: EventHandler<MouseTouchEvent>;
    onMouseDown: EventHandler<MouseTouchEvent>;
    onMouseUp: EventHandler<MouseTouchEvent>;
    onTouchStart: EventHandler<MouseTouchEvent>;
    onTouchEnd: EventHandler<MouseTouchEvent>;
    render(): React.ReactElement;
}

type DraggableState = {
    dragging: boolean;
    dragged: boolean;
    x: number;
    y: number;
    slackX: number;
    slackY: number;
    isElementSVG: boolean;
    prevPropsPosition: ControlPosition | null;
};
type DraggableDefaultProps = DraggableCoreDefaultProps & {
    axis: 'both' | 'x' | 'y' | 'none';
    bounds: Bounds | string | false;
    defaultClassName: string;
    defaultClassNameDragging: string;
    defaultClassNameDragged: string;
    defaultPosition: ControlPosition;
    scale: number;
};
type DraggableProps = DraggableCoreProps & DraggableDefaultProps & {
    positionOffset: PositionOffsetControlPosition;
    position: ControlPosition;
};
declare class Draggable extends React.Component<Partial<DraggableProps>, DraggableState> {
    props: DraggableProps;
    static displayName?: string;
    static propTypes?: {
        [key: string]: unknown;
    };
    static defaultProps: DraggableProps;
    static getDerivedStateFromProps({ position }: DraggableProps, { prevPropsPosition }: DraggableState): Partial<DraggableState> | null;
    constructor(props: DraggableProps);
    componentDidMount(): void;
    componentWillUnmount(): void;
    findDOMNode(): HTMLElement | null;
    onDragStart: DraggableEventHandler;
    onDrag: DraggableEventHandler;
    onDragStop: DraggableEventHandler;
    render(): ReactElement;
}

export { type Bounds as B, type ControlPosition as C, Draggable as D, type PositionOffsetControlPosition as P, DraggableCore as a, type DraggableCoreProps as b, type DraggableData as c, type DraggableEvent as d, type DraggableEventHandler as e, type DraggableProps as f, type DraggableDefaultProps as g };
