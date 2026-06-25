import { motion } from '@octane-ts/motion';

export function InViewBox() @{
	<motion.div
		id="box"
		whileInView={{ opacity: 1 }}
		transition={{ duration: 0.2 }}
	>{'b'}</motion.div>
}
