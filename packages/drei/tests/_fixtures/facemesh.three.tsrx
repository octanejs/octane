/** @jsxImportSource @octanejs/three/intrinsics */
import type { ThreeRef } from '@octanejs/three';
import type { FacemeshApi, FacemeshProps } from '../../src/web/Facemesh.three.tsrx';
import { Facemesh } from '../../src/web/Facemesh.three.tsrx';

export function FacemeshScene({ meshRef, ...props }: FacemeshProps & {
	meshRef?: ThreeRef<FacemeshApi>;
}) @{
	<Facemesh {...props} ref={meshRef}>
		<meshBasicMaterial />
	</Facemesh>
}
