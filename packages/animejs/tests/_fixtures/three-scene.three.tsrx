import type * as THREE from 'three';

export function AnimeThreeScene(props: { capture(mesh: THREE.Mesh | null): void }) @{
	<mesh ref={props.capture} name="anime-target">
		<boxGeometry />
		<meshBasicMaterial color="#ff4d8d" transparent />
	</mesh>
}
