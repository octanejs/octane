import { motion, MotionConfig } from '@octanejs/motion';

export function ConfigTree() @{
	<MotionConfig transition={{ duration: 0.5 }}>
		<motion.div id="box" animate={{ opacity: 1 }}>{'b'}</motion.div>
	</MotionConfig>
}
