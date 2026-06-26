import { motion } from '@octanejs/motion';

export function Hero() @{
	<motion.div id="hero" layoutId="hero" transition={{ duration: 0.4 }}>{'h'}</motion.div>
}
