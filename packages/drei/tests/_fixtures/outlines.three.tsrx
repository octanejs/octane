import { Outlines } from '@octanejs/drei';

export function OutlinesScene(props) @{
	<mesh ref={props.parentRef} name="parent">
		<boxGeometry args={[1, 2, 3]} />
		<meshBasicMaterial />
		<Outlines
			name="outlines"
			angle={props.angle}
			color={props.color}
			opacity={props.opacity}
			transparent={props.transparent}
			screenspace={props.screenspace}
			thickness={props.thickness}
			renderOrder={props.renderOrder}
			polygonOffset
			polygonOffsetFactor={-2}
		/>
	</mesh>
}
