import { motion } from '@octanejs/motion';

const PV = { hidden: { opacity: 0 }, visible: { opacity: 1 } };
const CV = { hidden: { x: 0 }, visible: { x: 100 } };
export function VariantTree() @{
	<motion.div id="parent" variants={PV} initial="hidden" animate="visible">
		<motion.div id="child" variants={CV}>
			{'c'}
		</motion.div>
	</motion.div>
}

export function VariantCompletion({
	target,
	onComplete,
}: {
	target: string | { opacity: number };
	onComplete: (definition: unknown) => void;
}) @{
	<motion.div variants={PV} initial={false} animate={target} onAnimationComplete={onComplete} />
}

export function InheritedVariantCompletion({
	label,
	onComplete,
}: {
	label: string;
	onComplete: (definition: unknown) => void;
}) @{
	<motion.div variants={PV} initial={false} animate={label}>
		<motion.div variants={CV} onAnimationComplete={onComplete} />
	</motion.div>
}
