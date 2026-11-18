import { motion, useAnimationControls } from '@octanejs/motion';
import { useLayoutEffect } from 'octane';
import type { LegacyAnimationControls, MotionValue } from 'motion-dom';

export function ControllerGroup({
	rows,
	second = false,
	disabled = false,
	circle,
	onReady,
}: {
	rows: Array<{ id: string; target: number; value?: MotionValue<number> }>;
	second?: boolean;
	disabled?: boolean;
	circle?: MotionValue<number>;
	onReady: (first: LegacyAnimationControls, second: LegacyAnimationControls) => void;
}) @{
	const first = useAnimationControls();
	const other = useAnimationControls();
	useLayoutEffect(() => onReady(first, other), [first, other, onReady]);
	<div>
		@for (const row of rows; key row.id) {
			<motion.div
				id={row.id}
				animate={disabled ? undefined : second ? other : first}
				variants={{ layout: { marginTop: row.target } }}
				style={{ x: row.value }}
			/>
		}
		@if (circle) {
			<svg>
				<motion.circle id="circle" animate={first} cx={circle} variants={{ layout: { cx: 18 } }} />
			</svg>
		}
	</div>
}
