import { motion, useScroll } from '@octane-ts/motion';

export function ScrollBox(props) @{
	const { scrollYProgress } = useScroll();
	props.onReady(scrollYProgress);
	<motion.div id="box">{'b'}</motion.div>
}
