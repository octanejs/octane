import { Sparkles } from '@octanejs/drei';

export function SparklesScene(props) @{
	<Sparkles
		ref={props.ref}
		count={props.count}
		speed={props.speed}
		opacity={props.opacity}
		color={props.color}
		size={props.size}
		scale={props.scale}
		noise={props.noise}
	/>
}
