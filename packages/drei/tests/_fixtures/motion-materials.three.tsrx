import { MeshDistortMaterial, MeshWobbleMaterial } from '@octanejs/drei';

export function DistortMaterialScene(props) @{
	<mesh>
		<MeshDistortMaterial
			ref={props.ref}
			speed={props.speed}
			distort={props.distort}
			radius={props.radius}
			color={props.color}
			roughness={props.roughness}
		/>
	</mesh>
}

export function WobbleMaterialScene(props) @{
	<mesh>
		<MeshWobbleMaterial
			ref={props.ref}
			speed={props.speed}
			factor={props.factor}
			color={props.color}
			roughness={props.roughness}
		/>
	</mesh>
}
