import { Helper, useHelper } from '@octanejs/drei';
import { useRef } from '@octanejs/three/renderer';

export function UseHelperScene(props) @{
	const target = useRef(null);
	const helper = useHelper(target, props.type, ...props.args);
	props.onHelper(helper);
	<mesh ref={target} name="target">
		<boxGeometry />
		<meshBasicMaterial />
	</mesh>
}

export function HelperScene(props) @{
	<mesh name="target">
		<boxGeometry />
		<meshBasicMaterial />
		<Helper type={props.type} args={props.args} />
	</mesh>
}
