/** @jsxImportSource @octanejs/three/intrinsics */
import { useThree, type ThreeRef } from '@octanejs/three';
import { PivotControls, type PivotControlsProps } from '@octanejs/drei';
import * as THREE from 'three';

export function PivotControlsScene({ controlRef, controls, ...props }: Omit<PivotControlsProps, 'children'> & {
	controlRef?: ThreeRef<THREE.Group>;
	controls?: { enabled: boolean };
}) @{
	const state = useThree();
	if (controls) state.controls = controls;
	<PivotControls {...props} ref={controlRef}>
		<mesh name="pivot-child" position={[1, 0, 0]}>
			<boxGeometry args={[2, 2, 2]} />
			<meshBasicMaterial />
		</mesh>
	</PivotControls>
}
