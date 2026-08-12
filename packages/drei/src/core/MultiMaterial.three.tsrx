/** @jsxImportSource @octanejs/three/intrinsics */
import { type ThreeElements, useInstanceHandle } from '@octanejs/three';
import { useLayoutEffect, useRef } from '@octanejs/three/renderer';
import * as THREE from 'three';

export type MultiMaterialProps = Omit<ThreeElements['group'], 'ref'>;

export function MultiMaterial(props: MultiMaterialProps) @{
	const group = useRef<THREE.Group | null>(null);
	const instance = useInstanceHandle(group);
	useLayoutEffect(() => {
		const parent = group.current?.parent as THREE.Mesh<
			THREE.BufferGeometry,
			THREE.Material[]
		> | undefined;
		const geometry = parent?.geometry;
		if (!parent || !geometry || !instance.current) return;
		const oldMaterial = parent.material;
		parent.material = instance.current.children.map((child) => child.object as THREE.Material);
		const oldGroups = [...geometry.groups];
		geometry.clearGroups();
		parent.material.forEach((material, index) => {
			if (index < parent.material.length - 1) material.depthWrite = false;
			geometry.addGroup(0, Infinity, index);
		});
		return () => {
			parent.material = oldMaterial;
			geometry.groups = oldGroups;
		};
	});
	<group ref={group} {...props} />
}
