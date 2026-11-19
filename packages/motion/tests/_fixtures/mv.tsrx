import { motion, MotionConfig, useMotionValue, useTransform } from '@octanejs/motion';
import { useLayoutEffect } from 'octane';
import type { MotionValue } from 'motion-dom';

export function MVBox(props) @{
	const x = useMotionValue(0);
	props.onReady(x);
	<motion.div id="box" style={{ x }}>
		{'b'}
	</motion.div>
}

interface AuthoredValueProps {
	x: MotionValue<number>;
	cx: MotionValue<number>;
	run: boolean;
	focus?: boolean;
	onReady: (derived: MotionValue<number>) => void;
}

export function AuthoredValueAnimation({ x, cx, run, focus, onReady }: AuthoredValueProps) @{
	const doubled = useTransform(x, (value: number) => value * 2);
	useLayoutEffect(() => onReady(doubled), [onReady, doubled]);
	<div>
		<motion.div
			id="animated-x"
			initial={false}
			style={{ x }}
			animate={run ? { x: 36, transitionEnd: { x: 42 } } : { x: 3 }}
			transition={{ duration: 0.15, ease: 'linear' }}
			whileFocus={focus ? { x: 60 } : undefined}
			tabIndex={focus ? 0 : undefined}
		/>
		<svg>
			<motion.circle
				id="animated-cx"
				initial={false}
				cx={cx}
				animate={run ? { opacity: 0.7, transitionEnd: { cx: 18 } } : { opacity: 1 }}
				transition={{ duration: 0.15, ease: 'linear' }}
			/>
		</svg>
	</div>
}

export function ReducedAuthoredValueAnimation(props: AuthoredValueProps) @{
	<MotionConfig reducedMotion="always">
		<AuthoredValueAnimation {...props} />
	</MotionConfig>
}

export function ReboundValueAnimation({ x, run }: { x?: MotionValue<number>; run: boolean }) @{
	<motion.div
		id="rebound-x"
		initial={false}
		style={x ? { x } : undefined}
		animate={run ? { x: 100, transitionEnd: { x: 120 } } : { x: 0 }}
		transition={{ duration: 0.16, ease: 'linear' }}
	/>
}

export function ReboundRootAnimation({
	viewBox,
	x,
	run,
}: {
	viewBox?: MotionValue<string> | string;
	x?: MotionValue<number>;
	run: boolean;
}) @{
	<motion.svg
		id="rebound-root"
		initial={false}
		style={{ '--target': '100px', ...(x ? { x } : {}) }}
		viewBox={viewBox}
		animate={run ? { opacity: 0.5, transitionEnd: { viewBox: '0 0 20 20' } } : { opacity: 1 }}
		transition={{ duration: 0.1 }}
	/>
}
