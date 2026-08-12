import { Sky } from '@octanejs/drei';

export function SkyScene(props) @{
	<Sky
		ref={props.ref}
		distance={props.distance}
		inclination={props.inclination}
		azimuth={props.azimuth}
		sunPosition={props.sunPosition}
		mieCoefficient={props.mieCoefficient}
		mieDirectionalG={props.mieDirectionalG}
		rayleigh={props.rayleigh}
		turbidity={props.turbidity}
	/>
}
