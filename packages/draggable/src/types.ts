import type { OctaneNode } from 'octane';
import type { DraggableCoreProps } from './DraggableCore.tsrx';
import type {
	Bounds,
	ControlPosition,
	DraggableData,
	DraggableEvent,
	DraggableEventHandler,
	PositionOffsetControlPosition,
} from './utils/types.ts';

export type DraggableProps = DraggableCoreProps & {
	axis?: 'both' | 'x' | 'y' | 'none';
	bounds?: Bounds | string | false;
	defaultClassName?: string;
	defaultClassNameDragging?: string;
	defaultClassNameDragged?: string;
	defaultPosition?: ControlPosition;
	positionOffset?: PositionOffsetControlPosition;
	position?: ControlPosition;
	children?: OctaneNode;
};

export type {
	DraggableCoreProps,
	DraggableData,
	DraggableEventHandler,
	ControlPosition,
	PositionOffsetControlPosition,
	Bounds as DraggableBounds,
	DraggableEvent,
};
