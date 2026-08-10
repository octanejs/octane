/** @jsxImportSource @octanejs/three/intrinsics */
import type { ThreeElements, ThreeRef } from '@octanejs/three';
import { useLayoutEffect, useMemo, useRef } from '@octanejs/three/renderer';
import { type ExtrudeGeometry, type Mesh, Shape } from 'three';
import { toCreasedNormals } from 'three-stdlib';

const eps = 0.00001;

function createShape(width: number, height: number, radius0: number): Shape {
	const shape = new Shape();
	const radius = radius0 - eps;
	shape.absarc(eps, eps, eps, -Math.PI / 2, -Math.PI, true);
	shape.absarc(eps, height - radius * 2, eps, Math.PI, Math.PI / 2, true);
	shape.absarc(width - radius * 2, height - radius * 2, eps, Math.PI / 2, 0, true);
	shape.absarc(width - radius * 2, eps, eps, 0, -Math.PI / 2, true);
	return shape;
}

export type RoundedBoxProps =
	{
		args?: [width?: number, height?: number, depth?: number];
		radius?: number;
		smoothness?: number;
		bevelSegments?: number;
		steps?: number;
		creaseAngle?: number;
	} & Omit<ThreeElements['mesh'], 'ref' | 'args'>;

export type RoundedBoxGeometryProps =
	Omit<RoundedBoxProps, 'children'> & Omit<ThreeElements['extrudeGeometry'], 'args' | 'ref'>;

export function RoundedBox({
	args: [width = 1, height = 1, depth = 1] = [],
	radius = 0.05,
	steps = 1,
	smoothness = 4,
	bevelSegments = 4,
	creaseAngle = 0.4,
	children,
	ref,
	...rest
}: RoundedBoxProps & { ref?: ThreeRef<Mesh> }) @{
	const meshRef = useMemo(() => (value: Mesh | null) => assignThreeRef(ref, value), [ref]);

	<mesh ref={meshRef} {...rest}>
		<RoundedBoxGeometry
			args={[width, height, depth]}
			radius={radius}
			steps={steps}
			smoothness={smoothness}
			bevelSegments={bevelSegments}
			creaseAngle={creaseAngle}
		/>
		{children}
	</mesh>
}

function assignThreeRef<T>(ref: ThreeRef<T> | undefined, value: T | null): void {
	if (Array.isArray(ref)) {
		for (const item of ref) assignThreeRef(item, value);
	} else if (typeof ref === 'function') {
		ref(value);
	} else if (ref !== undefined && 'current' in ref) {
		ref.current = value;
	}
}

export function RoundedBoxGeometry({
	args: [width = 1, height = 1, depth = 1] = [],
	radius = 0.05,
	steps = 1,
	smoothness = 4,
	bevelSegments = 4,
	creaseAngle = 0.4,
	ref,
	...rest
}: RoundedBoxGeometryProps & { ref?: ThreeRef<ExtrudeGeometry> }) @{
	const shape = useMemo(() => createShape(width, height, radius), [width, height, radius]);
	const params = useMemo(
		() => ({
			depth: depth - radius * 2,
			bevelEnabled: true,
			bevelSegments: bevelSegments * 2,
			steps,
			bevelSize: radius - eps,
			bevelThickness: radius,
			curveSegments: smoothness,
		}),
		[depth, radius, smoothness, bevelSegments, steps],
	);
	const geometryRef = useRef<ExtrudeGeometry | null>(null);

	useLayoutEffect(() => {
		if (geometryRef.current !== null) {
			geometryRef.current.center();
			// three-mesh-bvh augments the workspace BufferGeometry type from its
			// peer instance; both libraries operate on the same Three.js object.
			toCreasedNormals(
				geometryRef.current as unknown as Parameters<typeof toCreasedNormals>[0],
				creaseAngle,
			);
		}
	}, [shape, params, creaseAngle]);

	<extrudeGeometry ref={[geometryRef, ref ?? null]} args={[shape, params]} {...rest} />
}
