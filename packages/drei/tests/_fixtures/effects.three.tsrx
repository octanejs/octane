import { Effects } from '@octanejs/drei';

export function EffectsScene(props) @{
	<Effects
		ref={props.ref}
		multisamping={props.multisamping}
		colorSpace={props.colorSpace}
		type={props.type}
		renderIndex={props.renderIndex}
		disableGamma={props.disableGamma}
		disableRenderPass={props.disableRenderPass}
		disableRender={props.disableRender}
		depthBuffer={props.depthBuffer}
		stencilBuffer={props.stencilBuffer}
		anisotropy={props.anisotropy}
	>
		{props.pass && <primitive object={props.pass} />}
	</Effects>
}
