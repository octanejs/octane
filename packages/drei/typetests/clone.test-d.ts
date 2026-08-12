import { Group, Mesh, type Object3D } from 'three';
import { Clone, type CloneProps } from '../src/index.js';

const group = new Group();
const mesh = new Mesh();
const props: CloneProps = {
	object: group,
	deep: 'materialsOnly',
	castShadow: true,
	receiveShadow: true,
	inject: { visible: false },
	position: [1, 2, 3],
};
const arrayProps: CloneProps = { object: [group, mesh], deep: true };
const functionInject: CloneProps = {
	object: mesh,
	inject: (object: Object3D) => (object.visible ? null : null),
};
const callProps: Parameters<typeof Clone>[0] = { ...props, ref: { current: null } };
void [arrayProps, functionInject, callProps];

// @ts-expect-error Clone requires an Object3D or Object3D array.
const invalid: CloneProps = { object: {} };
void invalid;
