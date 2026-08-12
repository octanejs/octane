import { ContactShadows } from '@octanejs/drei';

export function ContactShadowsScene(props) @{
	<ContactShadows
		ref={props.groupRef}
		scale={props.scale}
		width={props.width}
		height={props.height}
		frames={props.frames}
		opacity={props.opacity}
		blur={props.blur}
		near={props.near}
		far={props.far}
		resolution={props.resolution}
		smooth={props.smooth}
		color={props.color}
		depthWrite={props.depthWrite}
		renderOrder={props.renderOrder}
		name="contact-shadows"
	/>
}
