import { motion, useMotionValue } from '@octanejs/motion';
import { motionValue } from 'motion';

/** Adapted from upstream use-motion-value "sets initial value" / "is typed". */
export function InitialValue() @{
	const x = useMotionValue(100);
	<motion.div id="box" style={{ x }} />
}

/** Adapted from upstream use-motion-value "can be set manually". */
export function ManualSet() @{
	const x = useMotionValue(100);
	x.set(500);
	<motion.div id="box" style={{ x }} />
}

/** Adapted from upstream use-motion-value "accepts new motion values". */
export function AcceptsValue(props) @{
	<motion.div id="box" style={{ x: props.x }} />
}

/** Adapted from upstream use-motion-value "fires callbacks". */
export function FiresCallbacks(props) @{
	const x = useMotionValue(100);
	x.on('change', props.onChange);
	x.set(500);
	<motion.div id="box" style={{ x }} />
}

export { motionValue };
