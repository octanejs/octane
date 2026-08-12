/** @jsxImportSource @octanejs/three/intrinsics */
import {
	applyProps,
	type Euler as EulerProp,
	type RefObject,
	type ThreeElements,
	type ThreeRef,
	type Vector3 as Vector3Prop,
} from '@octanejs/three';
import { useImperativeHandle, useLayoutEffect, useMemo, useRef } from '@octanejs/three/renderer';
import * as THREE from 'three';
import { DecalGeometry } from 'three-stdlib';

export type DecalProps =
	Omit<ThreeElements['mesh'], 'ref' | 'children'> & {
		debug?: boolean;
		mesh?: RefObject<THREE.Mesh>;
		position?: Vector3Prop;
		rotation?: EulerProp | number;
		scale?: Vector3Prop;
		map?: THREE.Texture;
		children?: ThreeElements['mesh']['children'];
		polygonOffsetFactor?: number;
		depthTest?: boolean;
	};

function assignRef<T>(ref: ThreeRef<T> | undefined, value: T | null): void {
	if (Array.isArray(ref)) for (const item of ref) assignRef(item, value);
	else if (typeof ref === 'function') ref(value);
	else if (ref && 'current' in ref) ref.current = value;
}

function vecToArray(vector: number[] | Vector3Prop | EulerProp | number = [0, 0, 0]): number[] {
	if (Array.isArray(vector)) return [Number(vector[0]), Number(vector[1]), Number(vector[2])];
	if (vector instanceof THREE.Vector3 || vector instanceof THREE.Euler) return [
		vector.x,
		vector.y,
		vector.z,
	];
	const scalar = vector as number;
	return [scalar, scalar, scalar];
}

export function Decal({
	debug,
	depthTest = false,
	polygonOffsetFactor = -10,
	map,
	mesh,
	children,
	position,
	rotation,
	scale,
	ref,
	...props
}: DecalProps & { ref?: ThreeRef<THREE.Mesh> }) @{
	const localRef = useRef<THREE.Mesh | null>(null);
	const imperativeRef = useMemo(
		() => (value: THREE.Mesh | null | undefined) => assignRef(ref, value ?? null),
		[ref],
	);
	useImperativeHandle(imperativeRef, () => localRef.current!, []);
	const helper = useRef<THREE.Mesh | null>(null);
	const state = useRef({
		position: new THREE.Vector3(),
		rotation: new THREE.Euler(),
		scale: new THREE.Vector3(1, 1, 1),
	});
	useLayoutEffect(() => {
		if (!localRef.current) return;
		const parent = mesh?.current || localRef.current.parent;
		const target = localRef.current;
		if (
			!(parent instanceof THREE.Mesh)
		) throw new Error('Decal must have a Mesh as parent or specify its "mesh" prop');
		applyProps(state.current, { position, scale });
		const matrixWorld = parent.matrixWorld.clone();
		parent.matrixWorld.identity();
		if (!rotation || typeof rotation === 'number') {
			const object = new THREE.Object3D();
			object.position.copy(state.current.position);
			const vertices = parent.geometry.attributes.position.array;
			if (parent.geometry.attributes.normal === undefined) parent.geometry.computeVertexNormals();
			const normal = parent.geometry.attributes.normal.array;
			let distance = Infinity;
			const closestNormal = new THREE.Vector3();
			let chosenIndex = -1;
			for (let index = 0; index < vertices.length; index += 3) {
				const xDiff = vertices[index] - object.position.x;
				const yDiff = vertices[index + 1] - object.position.y;
				const zDiff = vertices[index + 2] - object.position.z;
				const squared = xDiff * xDiff + yDiff * yDiff + zDiff * zDiff;
				if (squared < distance) {
					distance = squared;
					chosenIndex = index;
				}
			}
			closestNormal.fromArray(normal, chosenIndex);
			object.lookAt(object.position.clone().add(closestNormal));
			object.rotateZ(Math.PI);
			object.rotateY(Math.PI);
			if (typeof rotation === 'number') object.rotateZ(rotation);
			applyProps(state.current, { rotation: object.rotation });
		} else applyProps(state.current, { rotation });
		if (helper.current) applyProps(helper.current, state.current);
		const Geometry = DecalGeometry as unknown as new (mesh: THREE.Mesh, position: THREE.Vector3, rotation: THREE.Euler, scale: THREE.Vector3) => THREE.BufferGeometry;
		target.geometry =
			new Geometry(parent, state.current.position, state.current.rotation, state.current.scale);
		parent.matrixWorld = matrixWorld;
		return () => target.geometry.dispose();
	}, [mesh, ...vecToArray(position), ...vecToArray(scale), ...vecToArray(rotation)]);
	useLayoutEffect(() => {
		if (helper.current) helper.current.traverse((child) => (child.raycast = () => null));
	}, [debug]);
	<mesh
		ref={localRef}
		material-transparent
		material-polygonOffset
		material-polygonOffsetFactor={polygonOffsetFactor}
		material-depthTest={depthTest}
		material-map={map}
		{...props}
	>
		{children}
		{debug &&
			<mesh ref={helper}>
				<boxGeometry />
				<meshNormalMaterial wireframe />
				<axesHelper />
			</mesh>}
	</mesh>
}
