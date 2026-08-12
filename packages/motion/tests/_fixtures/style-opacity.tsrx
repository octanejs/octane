import { motion } from '@octanejs/motion';

/** Host that can switch a style key between MotionValue and plain static. */
export function StyleOpacity(props) @{
	<motion.div id="box" style={props.style} />
}
