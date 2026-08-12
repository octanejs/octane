import { Decal, type DecalProps } from '../src/index.js';
import { Mesh, Texture } from 'three';

const props: DecalProps = {
	position: [1, 2, 3],
	rotation: 0.5,
	scale: 2,
	map: new Texture(),
	mesh: { current: new Mesh() },
	debug: true,
};
Decal;
props;

// @ts-expect-error rotation must be an Euler representation or scalar
const invalidRotation: DecalProps = { rotation: 'front' };
// @ts-expect-error mesh must be a compatible mesh ref
const invalidMesh: DecalProps = { mesh: { current: {} } };
