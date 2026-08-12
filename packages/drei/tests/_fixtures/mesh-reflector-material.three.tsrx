import { MeshReflectorMaterial } from '@octanejs/drei';

export function MeshReflectorMaterialScene(props) @{
	<mesh ref={props.meshRef}>
		<planeGeometry args={[4, 4]} />
		<MeshReflectorMaterial
			ref={props.materialRef}
			resolution={props.resolution}
			blur={props.blur}
			mirror={props.mirror}
			mixBlur={props.mixBlur}
			mixStrength={props.mixStrength}
			depthScale={props.depthScale}
			distortionMap={props.distortionMap}
			mixContrast={props.mixContrast}
		/>
	</mesh>
}
