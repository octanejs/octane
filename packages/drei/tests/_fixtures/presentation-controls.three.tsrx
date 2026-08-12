import { PresentationControls } from '@octanejs/drei';

export function PresentationControlsScene(props) @{
	<PresentationControls
		global
		domElement={props.domElement}
		rotation={props.rotation}
		polar={props.polar}
		azimuth={props.azimuth}
		speed={props.speed}
		zoom={props.zoom}
		damping={props.damping}
	>
		<group ref={props.childRef} name="controlled-child" />
	</PresentationControls>
}
