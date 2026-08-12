import { RenderCubeTexture, RenderTexture } from '@octanejs/drei';

export function RenderTextureScene(props) @{
	<RenderTexture
		ref={props.textureRef}
		width={props.width}
		height={props.height}
		samples={props.samples}
		frames={props.frames}
		stencilBuffer={props.stencilBuffer}
		depthBuffer={props.depthBuffer}
		generateMipmaps={props.generateMipmaps}
		name="render-texture"
	>
		<group ref={props.childRef} name="portal-child" />
	</RenderTexture>
}

export function RenderCubeTextureScene(props) @{
	<RenderCubeTexture
		ref={props.apiRef}
		resolution={props.resolution}
		frames={props.frames}
		near={props.near}
		far={props.far}
		flip={props.flip}
		position={[1, 2, 3]}
		name="cube-texture"
	>
		<group ref={props.childRef} name="cube-portal-child" />
	</RenderCubeTexture>
}
