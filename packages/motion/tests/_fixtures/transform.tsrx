import { motion, useMotionValue, useTransform } from '@octanejs/motion';

export function TransformBox(props) @{
	const x = useMotionValue(50);
	const a = useMotionValue(2);
	const b = useMotionValue(3);
	const mapped = useTransform(x, [0, 100], [0, 1]); // form 2: range map
	const doubled = useTransform(() => x.get() * 2); // form 1: transformer fn
	const summed = useTransform([a, b], ([av, bv]) => av + bv); // form 3: combiner
	const plusOne = useTransform(x, (l) => l + 1); // form 4: single input + transformer
	props.onReady({ x, a, b, mapped, doubled, summed, plusOne });
	<motion.div id="box" style={{ opacity: doubled }}>{'b'}</motion.div>
}
