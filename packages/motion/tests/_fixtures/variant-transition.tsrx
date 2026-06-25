import { motion } from '@octane-ts/motion';

export function HoverWithTransition() @{
	<motion.div id="box" whileHover={{ scale: 1.2, transition: { duration: 0.8 } }}>{'b'}</motion.div>
}
