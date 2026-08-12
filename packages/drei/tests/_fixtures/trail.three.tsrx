import { Trail, useTrail } from '@octanejs/drei';
import { useLayoutEffect } from '@octanejs/three/renderer';

export function TrailExternalScene(props) @{
	<Trail
		ref={props.ref}
		target={props.targetRef}
		width={props.width}
		length={props.length}
		decay={props.decay}
		local={props.local}
		stride={props.stride}
		interval={props.interval}
		color={props.color}
		attenuation={props.attenuation}
	/>
}

export function TrailDiscoveredScene(props) @{
	<Trail ref={props.ref} width={props.width} color={props.color}>
		<group ref={props.targetRef} position={props.position} />
		<meshLineMaterial color={props.overrideColor} lineWidth={props.overrideWidth} />
	</Trail>
}

export function TrailHookScene(props) @{
	const points = useTrail(props.target, props.settings);
	useLayoutEffect(() => props.onPoints(points), [points, props.onPoints]);
	null
}
