import { descriptorChildren } from 'octane';
import Draggable from './Draggable.tsrx';
import DraggableCoreImpl from './DraggableCore.tsrx';

// Keep the public package root self-describing to every compiler host. The
// marker is identity-preserving, so these are the exact component objects (and
// statics) exported by their implementation modules without relying on a
// build-tool-specific re-export metadata walk.
const DraggableCore = descriptorChildren(DraggableCoreImpl);

export { DraggableCore };
export default descriptorChildren(Draggable);
export type { DraggableProps, DraggableCoreProps, DraggableData, DraggableEventHandler, ControlPosition, PositionOffsetControlPosition, DraggableBounds, DraggableEvent } from './types.ts';
