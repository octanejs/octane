import { SoftShadows } from '@octanejs/drei';

export function SoftShadowsScene(props) @{
	<>
		<mesh>
			<boxGeometry />
			<meshBasicMaterial ref={props.materialRef} />
		</mesh>
		<SoftShadows focus={props.focus} samples={props.samples} size={props.size} />
	</>
}
