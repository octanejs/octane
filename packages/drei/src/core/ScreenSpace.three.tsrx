/** @jsxImportSource @octanejs/three/intrinsics */
import { type ThreeElements, type ThreeRef, useFrame } from '@octanejs/three';
import { useRef } from '@octanejs/three/renderer';
import type { Group } from 'three';

export type ScreenSpaceProps = Omit<ThreeElements['group'], 'ref'> & { depth?: number };

export function ScreenSpace({ children, depth = -1, ref, ...rest }: ScreenSpaceProps & {
	ref?: ThreeRef<Group>;
}) @{
	const localRef = useRef<Group | null>(null);
	useFrame(({ camera }) => {
		if (localRef.current) {
			localRef.current.quaternion.copy(camera.quaternion);
			localRef.current.position.copy(camera.position);
		}
	});
	<group ref={[localRef, ref ?? null]} {...rest}>
		<group position={[0, 0, -depth]}>{children}</group>
	</group>
}
