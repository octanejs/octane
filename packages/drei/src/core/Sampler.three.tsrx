/** @jsxImportSource @octanejs/three/intrinsics */
import { type ThreeElements } from '@octanejs/three';
import { useLayoutEffect, useRef, useState, type RefObject } from '@octanejs/three/renderer';
import type { OctaneNode } from 'octane';
import {
	Color,
	Group,
	InstancedBufferAttribute,
	InstancedMesh,
	Mesh,
	Object3D,
	Vector3,
} from 'three';
import { MeshSurfaceSampler } from 'three-stdlib';
import { slotDefault } from './compiler-slot.js';

type SamplePayload = {
	position: Vector3;
	normal: Vector3;
	color: Color;
};

type TransformPayload = SamplePayload & {
	dummy: Object3D;
	sampledMesh: Mesh;
};

export type TransformFn = (payload: TransformPayload, index: number) => void;

export type SamplerProps = Omit<ThreeElements['group'], 'ref'> & {
	mesh?: RefObject<Mesh>;
	instances?: RefObject<InstancedMesh>;
	weight?: string;
	transform?: TransformFn;
	count?: number;
	children?: OctaneNode;
};

export interface useSurfaceSamplerProps {
	transform?: TransformFn;
	weight?: string;
	count?: number;
}

export function useSurfaceSampler(
	mesh: RefObject<Mesh>,
	count = 16,
	transform?: TransformFn,
	weight?: string,
	instanceMesh?: RefObject<InstancedMesh> | null,
): InstancedBufferAttribute {
	count = slotDefault(count, 16);
	transform = slotDefault(transform, undefined);
	weight = slotDefault(weight, undefined);
	instanceMesh = slotDefault(instanceMesh, undefined);
	const [buffer, setBuffer] = useState(() => {
		const values = Array.from(
			{ length: count },
			() => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
		).flat();
		return new InstancedBufferAttribute(Float32Array.from(values), 16);
	});

	useLayoutEffect(() => {
		if (!mesh.current) return;
		// three-stdlib currently resolves a newer @types/three copy; runtime instances are compatible.
		const sampler = new MeshSurfaceSampler(mesh.current as any);
		if (weight) sampler.setWeightAttribute(weight);
		sampler.build();
		const position = new Vector3();
		const normal = new Vector3();
		const color = new Color();
		const dummy = new Object3D();
		mesh.current.updateMatrixWorld(true);
		for (let index = 0; index < count; index++) {
			sampler.sample(position as any, normal as any, color as any);
			if (transform) {
				transform({ dummy, sampledMesh: mesh.current, position, normal, color }, index);
			} else {
				dummy.position.copy(position);
			}
			dummy.updateMatrix();
			instanceMesh?.current?.setMatrixAt(index, dummy.matrix);
			dummy.matrix.toArray(buffer.array, index * 16);
		}
		if (instanceMesh?.current) instanceMesh.current.instanceMatrix.needsUpdate = true;
		buffer.needsUpdate = true;
		setBuffer(new InstancedBufferAttribute(buffer.array as Float32Array, buffer.itemSize).copy(buffer));
	}, [mesh, instanceMesh, weight, count, transform]);

	return buffer;
}

export function Sampler({
	children,
	weight,
	transform,
	instances,
	mesh,
	count = 16,
	...props
}: SamplerProps) @{
	const group = useRef<Group | null>(null);
	const instancedRef = useRef<InstancedMesh | null>(null);
	const meshToSampleRef = useRef<Mesh | null>(null);
	useLayoutEffect(() => {
		instancedRef.current = instances?.current ?? group.current?.children.find(
			(child) => Object.hasOwn(child, 'instanceMatrix'),
		) as InstancedMesh | null;
		meshToSampleRef.current = mesh?.current ?? group.current?.children.find(
			(child) => child.type === 'Mesh',
		) as Mesh | null;
	}, [children, mesh?.current, instances?.current]);
	useSurfaceSampler(meshToSampleRef, count, transform, weight, instancedRef);
	<group ref={group} {...props}>{children}</group>
}
