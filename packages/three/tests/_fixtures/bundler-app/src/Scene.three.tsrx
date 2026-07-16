import { useFrame, useThree } from '@octanejs/three';
import type { RootState } from '@octanejs/three';
import type { Mesh } from 'three';

type ThreeBrowserProof = typeof globalThis & {
		__octaneThreeFrameCount?: number;
		__octaneThreeSceneReady?: boolean;
		__octaneThreeState?: RootState;
	};

export function Scene() @{
	const proof = globalThis as ThreeBrowserProof;
	const state = useThree((value) => value);
	let cube: Mesh | null = null;

	proof.__octaneThreeState = state;
	proof.__octaneThreeSceneReady = true;
	useFrame((_frameState, delta) => {
		if (cube !== null) cube.rotation.y += delta;
		proof.__octaneThreeFrameCount = (proof.__octaneThreeFrameCount ?? 0) + 1;
	});

	<mesh name="bundler-proof-cube" ref={(value: Mesh | null) => (cube = value)}>
		<boxGeometry args={[2, 2, 2]} />
		<meshBasicMaterial color={16711680} toneMapped={false} />
	</mesh>
}
