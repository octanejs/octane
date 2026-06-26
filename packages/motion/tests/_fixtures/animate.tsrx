import { useAnimate } from '@octanejs/motion';

export function AnimateBox(props) @{
	const [scope, animate] = useAnimate();
	props.onReady(scope, animate);
	<div ref={scope} id="box">{'box'}</div>
}
