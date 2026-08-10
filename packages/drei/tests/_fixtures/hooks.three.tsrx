import { useCamera, useIntersect } from '@octanejs/drei';

export function CameraHookScene(props) @{
	const raycast = useCamera(props.camera, props.raycasterProps);
	props.onValue(raycast);
	null;
}

export function IntersectHookScene(props) @{
	const ref = useIntersect(props.onChange);
	<mesh ref={ref} />
}
