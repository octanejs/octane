import { motion } from '@octanejs/motion';

export function InitialOnly() @{
	<motion.div id="box" initial={{ opacity: 0 }} />
}
