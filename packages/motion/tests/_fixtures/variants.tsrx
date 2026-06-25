import { motion } from '@octane-ts/motion';

const PV = { hidden: { opacity: 0 }, visible: { opacity: 1 } };
const CV = { hidden: { x: 0 }, visible: { x: 100 } };
export function VariantTree() @{
	<motion.div id="parent" variants={PV} initial="hidden" animate="visible">
		<motion.div id="child" variants={CV}>{'c'}</motion.div>
	</motion.div>
}
