import { MeshRefractionMaterial } from '@octanejs/drei';

export function MeshRefractionMaterialScene(props) @{
	<mesh ref={props.meshRef}>
		<icosahedronGeometry args={[1, 1]} />
		<MeshRefractionMaterial
			envMap={props.envMap}
			aberrationStrength={props.aberrationStrength}
			fastChroma={props.fastChroma}
			ior={props.ior}
			bounces={props.bounces}
			color={props.color}
		/>
	</mesh>
}
