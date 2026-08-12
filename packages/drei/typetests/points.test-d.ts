import type { PointsBuffersProps, PointsInstancesProps, PositionPoint } from '@octanejs/drei';
import type { ThreeElement, ThreeRef } from '@octanejs/three';

const pointRef: ThreeRef<PositionPoint> = { current: null };
const point: ThreeElement<typeof PositionPoint> = {
	ref: pointRef,
	position: [1, 2, 3],
	size: 2,
	color: 'red',
};
const instances: PointsInstancesProps = { limit: 100, range: 20, position: [0, 1, 0] };
const buffers: PointsBuffersProps = {
	positions: new Float32Array(6),
	colors: new Float32Array(6),
	sizes: new Float32Array(2),
	stride: 3,
};
void point;
void instances;
void buffers;

// @ts-expect-error positions must be a Float32Array, which also selects buffer mode at runtime.
const wrongPositions: PointsBuffersProps = { positions: [0, 1, 2] };
// @ts-expect-error only the upstream-supported point strides are accepted.
const wrongStride: PointsBuffersProps = { positions: new Float32Array(3), stride: 4 };
void wrongPositions;
void wrongStride;
