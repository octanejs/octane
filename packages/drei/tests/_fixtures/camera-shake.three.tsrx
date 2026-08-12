import { CameraShake } from '@octanejs/drei';

export function CameraShakeScene(props) @{
	<CameraShake
		ref={props.shakeRef}
		intensity={props.intensity}
		decay={props.decay}
		decayRate={props.decayRate}
		maxYaw={props.maxYaw}
		maxPitch={props.maxPitch}
		maxRoll={props.maxRoll}
		yawFrequency={props.yawFrequency}
		pitchFrequency={props.pitchFrequency}
		rollFrequency={props.rollFrequency}
	/>
}
