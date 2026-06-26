import { motion, useSpring } from '@octanejs/motion';

export function SpringBox(props) @{
	const x = useSpring(props.source ?? 0, { stiffness: 300 });
	props.onReady(x);
	<motion.div id="box" style={{ x }}>{'b'}</motion.div>
}
