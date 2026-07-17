import { useEffect, useLayoutEffect, useState } from '@octanejs/three/renderer';

export function SchedulingScene(props) @{
	const [name, setName] = useState(props.name);
	useLayoutEffect(() => props.onReady(setName), [props.onReady, setName]);
	useEffect(() => props.onEffect(name), [props.onEffect, name]);

	<group name={name} ref={props.groupRef} />
}
