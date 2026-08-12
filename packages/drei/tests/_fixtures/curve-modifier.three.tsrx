import { CurveModifier } from '@octanejs/drei';

export function CurveModifierScene(props) @{
	<CurveModifier ref={props.ref} curve={props.curve}>
		<mesh name="source">
			<boxGeometry args={[2, 1, 1]} />
			<meshStandardMaterial color="#4080c0" />
		</mesh>
	</CurveModifier>
}
