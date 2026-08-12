import { Stars } from '@octanejs/drei';

export function StarsScene(props) @{
	<Stars
		ref={props.ref}
		radius={props.radius}
		depth={props.depth}
		count={props.count}
		factor={props.factor}
		saturation={props.saturation}
		fade={props.fade}
		speed={props.speed}
	/>
}
