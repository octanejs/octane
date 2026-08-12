import type { ThreeRef } from '@octanejs/three';
import type { Mesh } from 'three';
import {
	type Args,
	Box,
	RoundedBox,
	RoundedBoxGeometry,
	type RoundedBoxGeometryProps,
	type RoundedBoxProps,
	type ShapeProps,
	Sphere,
} from '../src/index.js';

type Equal<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

type BoxArgs = Args<typeof import('three').BoxGeometry>;
type _boxArgs = Expect<Equal<BoxArgs, ConstructorParameters<typeof import('three').BoxGeometry>>>;

const boxProps: Parameters<typeof Box>[0] = {
	args: [1, 2, 3],
	position: [1, 2, 3],
	ref: { current: null },
};
const sphereProps: Parameters<typeof Sphere>[0] = { args: [1, 16, 8], castShadow: true };
const genericShapeProps: ShapeProps<typeof import('three').BoxGeometry> = boxProps;

const meshRef: ThreeRef<Mesh> = { current: null };
const roundedBoxProps: RoundedBoxProps = { args: [1, 2, 3], radius: 0.1, name: 'box' };
const roundedGeometryProps: RoundedBoxGeometryProps = { args: [1, 2, 3], smoothness: 8 };
const roundedBoxCall: Parameters<typeof RoundedBox>[0] = { ...roundedBoxProps, ref: meshRef };
const roundedGeometryCall: Parameters<typeof RoundedBoxGeometry>[0] = roundedGeometryProps;

void [sphereProps, genericShapeProps, roundedBoxCall, roundedGeometryCall];

// @ts-expect-error Box width must be numeric.
const invalidBox: Parameters<typeof Box>[0] = { args: ['wide'] };
void invalidBox;
