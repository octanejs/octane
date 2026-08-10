import { Fisheye } from '@octanejs/drei';

export function FisheyeScene(props) @{
	<Fisheye
		ref={props.meshRef}
		zoom={props.zoom}
		segments={props.segments}
		resolution={props.resolution}
		renderPriority={props.renderPriority}
		name="fisheye"
	>
		<group ref={props.childRef} name="fisheye-child" />
	</Fisheye>
}
