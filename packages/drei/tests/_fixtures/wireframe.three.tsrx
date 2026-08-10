import { Wireframe } from '@octanejs/drei';

export function CustomWireframeScene(props) @{
	<Wireframe geometry={props.geometry} simplify={props.simplify} stroke={props.stroke} fill={props.fill} thickness={props.thickness} />
}

export function OverrideWireframeScene(props) @{
	<mesh ref={props.meshRef} geometry={props.geometry} material={props.material}>
		<Wireframe simplify={props.simplify} stroke={props.stroke} fillMix={props.fillMix} />
	</mesh>
}
