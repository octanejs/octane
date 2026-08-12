/** @jsxImportSource @octanejs/three/intrinsics */
import { RoundedBoxGeometry } from '@octanejs/drei';

export function RoundedBoxGeometryScene(props) @{
	<mesh name="rounded-box-geometry-host">
		<RoundedBoxGeometry
			ref={props.geometryRef}
			args={props.args}
			radius={props.radius}
			smoothness={props.smoothness}
			bevelSegments={props.bevelSegments}
			steps={props.steps}
			creaseAngle={props.creaseAngle}
		/>
	</mesh>
}
