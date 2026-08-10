/** @jsxImportSource @octanejs/three/intrinsics */
import { ComputedAttribute, Detailed, MultiMaterial, ScreenSpace } from '@octanejs/drei';

export function ScreenSpaceScene(props) @{
	<ScreenSpace depth={props.depth} ref={props.groupRef} name="screen-space">
		<group name="screen-content" />
	</ScreenSpace>
}

export function DetailedScene(props) @{
	<Detailed distances={props.distances} hysteresis={props.hysteresis} ref={props.lodRef}>
		<group name="near" />
		<group name="far" />
	</Detailed>
}

export function ComputedAttributeScene(props) @{
	<bufferGeometry ref={props.geometryRef}>
		<bufferAttribute
			attach="attributes-position"
			args={[new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3]}
		/>
		<ComputedAttribute name="custom" compute={props.compute} />
	</bufferGeometry>
}

export function MultiMaterialScene(props) @{
	<mesh ref={props.meshRef}>
		<boxGeometry />
		<MultiMaterial>
			<meshBasicMaterial name="first" color="red" />
			<meshBasicMaterial name="second" color="blue" />
		</MultiMaterial>
	</mesh>
}
