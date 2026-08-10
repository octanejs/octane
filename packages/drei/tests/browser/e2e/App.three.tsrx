/** @jsxImportSource @octanejs/three/intrinsics */
import { useEffect } from '@octanejs/three/renderer';
import { CameraControls, Environment, Sphere } from '@octanejs/drei';

function LoadedScene() @{
	<>
		<Sphere>
			<meshStandardMaterial roughness={0} metalness={1} />
		</Sphere>
		<Environment preset="city" />
		<CameraControls />
	</>
}

export function Scene() @{
	useEffect(function dispatchReady() {
		document.dispatchEvent(new Event('playright:r3f'));
	}, []);

	@try {
		<LoadedScene />
	} @pending {
		<group />
	}
}
