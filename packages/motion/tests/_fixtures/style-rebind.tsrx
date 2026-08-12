import { motion } from '@octanejs/motion';

/** Host that can gain a style MotionValue after mount (rebind path). */
export function StyleXLater(props) @{
	<motion.div id="box" style={props.x ? { x: props.x } : undefined} />
}
