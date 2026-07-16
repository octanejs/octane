import { useFrame } from '@octanejs/three';
import { useRef } from '@octanejs/three/renderer';

export function TestingScene(props) @{
	const group = useRef(null);

	useFrame((_state, delta) => {
		group.current.rotation.x += delta;
		props.onFrame(delta);
	});

	<group ref={group} name={props.name} position={props.position}>
		<mesh name="fixture-mesh" />
	</group>
}
