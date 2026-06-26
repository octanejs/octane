import { useMotionValue, useMotionValueEvent } from '@octanejs/motion';
import { useEffect } from 'octane';

function Setter(props) @{
	useEffect(() => {
		props.mv.set(123);
	}, []);
	<span>{'s'}</span>
}

export function CrossTree(props) @{
	const mv = useMotionValue(0);
	useMotionValueEvent(mv, 'change', (v) => props.onEvent(v));
	<div>
		<Setter mv={mv} />
	</div>
}
