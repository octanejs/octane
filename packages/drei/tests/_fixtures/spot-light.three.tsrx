import { SpotLight, SpotLightShadow } from '@octanejs/drei';

export function SpotLightScene(props) @{
	<SpotLight
		ref={props.lightRef}
		position={props.position}
		target={props.target}
		angle={props.angle}
		distance={props.distance}
		color={props.color}
		intensity={props.intensity}
		opacity={props.opacity}
		radiusTop={props.radiusTop}
		radiusBottom={props.radiusBottom}
		depthBuffer={props.depthBuffer}
		attenuation={props.attenuation}
		anglePower={props.anglePower}
		volumetric={props.volumetric}
		debug={props.debug}
		name={props.name}
	>
		@if (props.shadow) {
			<SpotLightShadow
				distance={props.shadow.distance}
				alphaTest={props.shadow.alphaTest}
				scale={props.shadow.scale}
				map={props.shadow.map}
				shader={props.shadow.shader}
				width={props.shadow.width}
				height={props.shadow.height}
			/>
		}
	</SpotLight>
}

export function InvalidSpotLightShadowScene(props) @{
	<SpotLightShadow {...props} />
}
