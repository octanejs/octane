import { Lightformer } from '@octanejs/drei';

export function LightformerScene(props) @{
	<Lightformer
		ref={props.ref}
		form={props.form}
		args={props.args}
		color={props.color}
		intensity={props.intensity}
		scale={props.scale}
		target={props.target}
		rotation={props.rotation}
		light={props.light}
	/>
}
