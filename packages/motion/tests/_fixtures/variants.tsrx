import { motion, MotionConfig } from '@octanejs/motion';
import * as m from '@octanejs/motion/react-m';
import type { LegacyAnimationControls } from 'motion-dom';

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
	target?: string | { opacity: number };
	onComplete?: (definition: unknown) => void;
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

const EQUAL = {
	first: { opacity: 1 },
	second: { opacity: 1 },
	third: { opacity: 0.3 },
	fourth: { opacity: 0.3 },
};

export function EqualVariantCompletion({
	label,
	onComplete,
	transition,
	childLabel,
	child = false,
}: {
	label: string | string[] | { opacity: number } | LegacyAnimationControls;
	onComplete?: (host: string, definition: unknown) => void;
	transition?: { duration: number };
	childLabel?: string;
	child?: boolean;
}) @{
	<motion.div
		initial={false}
		animate={label}
		variants={EQUAL}
		transition={transition}
		onAnimationComplete={onComplete ? (definition) => onComplete('parent', definition) : undefined}
	>
		@if (child) {
			<motion.div
				variants={EQUAL}
				animate={childLabel}
				onAnimationComplete={
					onComplete ? (definition) => onComplete('child', definition) : undefined
				}
			/>
		}
	</motion.div>
}

export function DisabledVariantCompletion({
	label,
	onComplete,
}: {
	label: string;
	onComplete: (definition: unknown) => void;
}) @{
	<m.div initial={false} animate={label} variants={EQUAL} onAnimationComplete={onComplete} />
}

export function ReducedEqualVariantCompletion({
	label,
	reduced,
	onComplete,
}: {
	label: string;
	reduced: 'never' | 'always';
	onComplete: (host: string, definition: unknown) => void;
}) @{
	<MotionConfig reducedMotion={reduced}>
		<EqualVariantCompletion label={label} onComplete={onComplete} />
	</MotionConfig>
}
