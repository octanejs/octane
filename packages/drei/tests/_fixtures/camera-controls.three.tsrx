import { CameraControls } from '@octanejs/drei';

export function CameraControlsScene(props) @{
	<CameraControls
		ref={props.ref}
		makeDefault={props.makeDefault}
		regress={props.regress}
		minDistance={props.minDistance}
		maxDistance={props.maxDistance}
		smoothTime={props.smoothTime}
		onControlStart={props.onControlStart}
		onControl={props.onControl}
		onControlEnd={props.onControlEnd}
		onTransitionStart={props.onTransitionStart}
		onUpdate={props.onUpdate}
		onWake={props.onWake}
		onRest={props.onRest}
		onSleep={props.onSleep}
		onStart={props.onStart}
		onEnd={props.onEnd}
		onChange={props.onChange}
	/>
}
