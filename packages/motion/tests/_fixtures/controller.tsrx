import { motion, useAnimationControls } from '@octanejs/motion';
import { useLayoutEffect } from 'octane';
import type { LegacyAnimationControls, MotionValue } from 'motion-dom';

export function ControllerGroup({
	rows,
	second = false,
	disabled = false,
	circle,
	circleInitial,
	onReady,
}: {
	rows: Array<{
		id: string;
		target: number;
		value?: number | MotionValue<number>;
		yValue?: MotionValue<number>;
		whileFocus?: { x?: number; y?: number };
		whileHover?: { x?: number; y?: number };
		whileTap?: { x?: number; y?: number };
		initial?: { opacity?: number; scale?: number; x?: number | number[] };
	}>;
	second?: boolean;
	disabled?: boolean;
	circle?: MotionValue<number>;
	circleInitial?: { cx: number[] };
	onReady: (first: LegacyAnimationControls, second: LegacyAnimationControls) => void;
}) @{
	const first = useAnimationControls();
	const other = useAnimationControls();
	useLayoutEffect(() => onReady(first, other), [first, other, onReady]);
	<div>
		@for (const row of rows; key row.id) {
			<motion.div
				id={row.id}
				initial={row.initial}
				animate={disabled ? undefined : second ? other : first}
				variants={{ layout: { marginTop: row.target } }}
				style={
					row.value === undefined
						? undefined
						: { x: row.value, ...(row.yValue ? { y: row.yValue } : {}) }
				}
				whileFocus={row.whileFocus}
				whileHover={row.whileHover}
				whileTap={row.whileTap}
				transition={row.whileFocus || row.whileHover || row.whileTap ? { duration: 0 } : undefined}
				tabIndex={row.whileFocus ? 0 : undefined}
			/>
		}
		@if (circle) {
			<svg>
				<motion.circle
					id="circle"
					initial={circleInitial}
					animate={first}
					cx={circle}
					variants={{ layout: { cx: 18 } }}
				/>
			</svg>
		}
	</div>
}
