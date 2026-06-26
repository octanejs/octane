import { useMotionValue, useMotionValueEvent } from '@octanejs/motion';

export function MVEBox(props) @{
	const x = useMotionValue(0);
	useMotionValueEvent(x, 'change', (v) => props.onEvent(v));
	props.onReady(x);
	<div id="box">{'b'}</div>
}
