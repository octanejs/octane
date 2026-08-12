import { Image } from '@octanejs/drei';

export function ImageTextureScene(props) @{
	<Image
		ref={props.meshRef}
		texture={props.texture}
		segments={props.segments}
		scale={props.scale}
		color={props.color}
		zoom={props.zoom}
		radius={props.radius}
		grayscale={props.grayscale}
		opacity={props.opacity}
		transparent
		name="image"
	/>
}

export function ImageUrlScene(props) @{
	@try {
		<Image ref={props.meshRef} url={props.url} scale={[2, 1]} name="image-url" />
	} @pending {
		<group name="loading" />
	}
}

export function InvalidImageScene() @{
	<Image {...({} as any)} />
}
