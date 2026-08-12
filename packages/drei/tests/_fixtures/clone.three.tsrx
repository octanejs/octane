/** @jsxImportSource @octanejs/three/intrinsics */
import { Clone } from '@octanejs/drei';

export function CloneScene(props) @{
	<Clone
		object={props.object}
		deep={props.deep}
		castShadow={props.castShadow}
		receiveShadow={props.receiveShadow}
		inject={props.inject}
		name={props.name}
		position={props.position}
		ref={props.cloneRef}
	>
		<group name="consumer-child" />
	</Clone>
}
