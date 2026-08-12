import { motion } from '@octanejs/motion';

/** Host with both x and y style MotionValues for sibling-axis patch tests. */
export function StyleXY(props) @{
	<motion.div id="box" style={{ x: props.x, y: props.y }} />
}
