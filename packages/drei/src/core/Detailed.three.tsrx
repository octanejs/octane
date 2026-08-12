/** @jsxImportSource @octanejs/three/intrinsics */
import { type ThreeElements, type ThreeRef, useFrame } from '@octanejs/three';
import { useLayoutEffect, useRef } from '@octanejs/three/renderer';
import type { OctaneNode } from 'octane';
import type { LOD } from 'three';

export type DetailedProps =
	Omit<ThreeElements['lOD'], 'ref' | 'children'> & {
		children: OctaneNode;
		hysteresis?: number;
		distances: number[];
	};

export function Detailed({ children, hysteresis = 0, distances, ref, ...props }: DetailedProps & {
	ref?: ThreeRef<LOD>;
}) @{
	const lodRef = useRef<LOD | null>(null);
	useLayoutEffect(() => {
		const lod = lodRef.current;
		if (!lod) return;
		lod.levels.length = 0;
		lod.children.forEach((object, index) => {
			lod.levels.push({ object, hysteresis, distance: distances[index] });
		});
	});
	useFrame((state) => lodRef.current?.update(state.camera));
	<lOD ref={[lodRef, ref ?? null]} {...props}>{children}</lOD>
}
