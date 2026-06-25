import { motion, useMotionValue } from '@octane-ts/motion';

export function MVBox(props) @{
	const x = useMotionValue(0);
	props.onReady(x);
	<motion.div id="box" style={{ x }}>{'b'}</motion.div>
}
