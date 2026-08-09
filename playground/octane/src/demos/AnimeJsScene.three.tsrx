/** @jsxImportSource @octanejs/three/intrinsics */
import type * as THREE from 'three';
import { animate, createScope } from '@octanejs/animejs';
import '@octanejs/animejs/adapters/three';
import { useThree } from '@octanejs/three';
import { useEffect, useRef } from '@octanejs/three/renderer';

export function AnimeJsScene({ reducedMotion }: { reducedMotion: boolean | undefined }) @{
	const mesh = useRef<THREE.Mesh | null>(null);
	const invalidate = useThree((state) => state.invalidate);

	useEffect(() => {
		if (!mesh.current || reducedMotion === undefined) return;
		const scope = createScope();
		scope.add(() => {
			animate(mesh.current!, {
				rotateX: 360,
				rotateY: 360,
				scale: [0.8, 1.1],
				duration: 2_400,
				ease: 'inOut(3)',
				alternate: true,
				loop: true,
				autoplay: !reducedMotion,
				onRender: () => invalidate(),
			});
		});
		return () => {
			scope.revert();
			invalidate();
		};
	}, [invalidate, reducedMotion]);

	<mesh ref={mesh}>
		<icosahedronGeometry args={[1.15, 1]} />
		<meshStandardMaterial color="#ff4d8d" roughness={0.25} metalness={0.25} />
	</mesh>
}
