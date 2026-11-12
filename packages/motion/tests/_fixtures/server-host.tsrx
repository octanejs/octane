import { motion, MotionConfig, motionValue } from '@octanejs/motion';
import type { MotionValue } from 'motion';
import type { Ref } from 'octane';

export function ServerHost({
	hostRef,
	label,
	opacity = 1,
	duration = 0.6,
}: {
	hostRef?: Ref<HTMLDivElement>;
	label: string;
	opacity?: number;
	duration?: number;
}) {
	return (
		<MotionConfig reducedMotion="never">
			<motion.div
				ref={hostRef}
				initial={false}
				animate={{ opacity: [0.25, opacity], x: 12 }}
				transition={{ duration }}
				aria-label={label}
			>
				<svg viewBox="0 0 3 3">
					<path d="M0 0h1" />
				</svg>
			</motion.div>
		</MotionConfig>
	);
}

export function VisualStates() {
	return (
		<div>
			<motion.div id="template" transformTemplate={() => 'scale(2)'} />
			<motion.div
				id="variants"
				custom={8}
				initial={['start', 'offset']}
				animate={{ opacity: 1 }}
				variants={{
					start: { transitionEnd: { opacity: 0.25 } },
					offset: (x: number) => ({ x, opacity: 0.5 }),
				}}
			/>
			<motion.div initial={false} animate="shown">
				<motion.span id="inherited-end" variants={{ shown: { opacity: [0.1, 0.9] } }} />
			</motion.div>
			<motion.div initial={['start', 'offset']} animate="shown">
				<motion.span
					id="inherited-list"
					variants={{ start: { opacity: 0.25 }, offset: { x: 3 }, shown: { opacity: 1 } }}
				/>
			</motion.div>
			<svg>
				<motion.circle cx={motionValue(12)} r={4} />
			</svg>
		</div>
	);
}

export function AuthoredFrame({
	opacity,
	cx,
	animate,
}: {
	opacity?: number | MotionValue<number>;
	cx?: number | MotionValue<number>;
	animate: boolean;
}) {
	return (
		<motion.div
			initial={false}
			style={{ opacity }}
			animate={animate ? { opacity: 0.6 } : undefined}
			transition={{ duration: 0 }}
		>
			<svg>
				<motion.circle
					initial={false}
					cx={cx}
					animate={animate ? { cx: 6 } : undefined}
					transition={{ duration: 0 }}
				/>
			</svg>
		</motion.div>
	);
}
