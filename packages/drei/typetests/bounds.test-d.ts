import {
	Bounds,
	useBounds,
	type BoundsApi,
	type BoundsProps,
	type SizeProps,
} from '../src/index.js';
import { Box3, Vector3 } from 'three';

const props: BoundsProps = {
	margin: 1.5,
	maxDuration: 0.5,
	observe: true,
	fit: true,
	clip: true,
	interpolateFunc: (time) => time,
	onFit: (size: SizeProps) => size.distance,
};
const api: BoundsApi = useBounds();
api
	.refresh(new Box3())
	.moveTo(new Vector3())
	.lookAt({ target: [0, 0, 0] })
	.fit()
	.clip();
api.to({ position: [1, 2, 3], target: [0, 0, 0] }).reset();
Bounds;
props;

// @ts-expect-error margin is numeric
const invalid: BoundsProps = { margin: 'wide' };
// @ts-expect-error positions require three axes
api.moveTo([1, 2]);
