import { Caustics } from '@octanejs/drei';

export function CausticsScene(props) @{
	<Caustics
		ref={props.ref}
		frames={props.frames}
		debug={props.debug}
		causticsOnly={props.causticsOnly}
		backside={props.backside}
		ior={props.ior}
		backsideIOR={props.backsideIOR}
		worldRadius={props.worldRadius}
		intensity={props.intensity}
		color={props.color}
		resolution={props.resolution}
		lightSource={props.lightSource}
	>
		<mesh name="caustic-subject">
			<boxGeometry />
			<meshBasicMaterial />
		</mesh>
	</Caustics>
}
