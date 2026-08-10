import { GradientTexture, MatcapTexture, NormalTexture } from '@octanejs/drei';

export function MatcapBoundary(props) @{
	@try {
		<MatcapTexture
			id={props.id}
			format={props.format}
			onLoad={props.onLoad}
			children={props.children}
		/>
	} @pending {
		<group name="loading" />
	}
}

export function NormalBoundary(props) @{
	@try {
		<NormalTexture
			id={props.id}
			repeat={props.repeat}
			offset={props.offset}
			anisotropy={props.anisotropy}
			onLoad={props.onLoad}
			children={props.children}
		/>
	} @pending {
		<group name="loading" />
	}
}

export function GradientScene(props) @{
	<mesh>
		<GradientTexture
			ref={props.textureRef}
			stops={props.stops}
			colors={props.colors}
			size={props.size}
			width={props.width}
			type={props.type}
			innerCircleRadius={props.innerCircleRadius}
			outerCircleRadius={props.outerCircleRadius}
		/>
	</mesh>
}
