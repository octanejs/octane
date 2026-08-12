import { TrailTexture } from '@octanejs/drei';

export function TrailTextureScene(props) @{
	<TrailTexture
		size={props.size}
		maxAge={props.maxAge}
		radius={props.radius}
		intensity={props.intensity}
		interpolate={props.interpolate}
		smoothing={props.smoothing}
		minForce={props.minForce}
		blend={props.blend}
		children={props.children}
	/>
}
