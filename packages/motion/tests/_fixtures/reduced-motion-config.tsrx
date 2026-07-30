import { MotionConfig, motion } from '@octanejs/motion';

export function ReducedMotionTarget() @{
	<MotionConfig reducedMotion="always">
		<motion.div
			id="reduced-target"
			animate={{ opacity: 0.5, x: 100 }}
			transition={{ duration: 0.5 }}
		>{'target'}</motion.div>
	</MotionConfig>
}

export function ReducedMotionLayout(props) @{
	<MotionConfig reducedMotion="always">
		<motion.div
			id="reduced-layout"
			layout
			transition={{ duration: 0.5 }}
		>{props.label as string}</motion.div>
	</MotionConfig>
}
