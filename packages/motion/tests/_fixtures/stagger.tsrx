import { motion } from '@octanejs/motion';

const item = { hidden: { opacity: 0 }, visible: { opacity: 1 } };
export function StaggerList(props) @{
	const container = {
		hidden: { opacity: 0 },
		visible: {
			opacity: 1,
			transition: props.delayFn
				? { delayChildren: props.delayFn }
				: { staggerChildren: 0.5, delayChildren: 1, staggerDirection: props.direction ?? 1 },
		},
	};
	<motion.div id="container" variants={container} initial="hidden" animate="visible">
		@for (const n of props.items; key n) {
			<motion.div id={'i' + n as string} variants={item}>{n as string}</motion.div>
		}
	</motion.div>
}
