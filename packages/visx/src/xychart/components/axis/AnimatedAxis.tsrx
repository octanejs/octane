import type { AxisScale } from '@octanejs/visx/axis';
import { AnimatedAxis as VxAnimatedAxis } from '@octanejs/visx/react-spring';
import type { AnimationTrajectory } from '@octanejs/visx/react-spring';
import type { BaseAxisProps } from './BaseAxis.tsrx';
import BaseAxis from './BaseAxis.tsrx';

export type AnimatedAxisProps<Scale extends AxisScale> =
	Omit<BaseAxisProps<Scale>, 'AxisComponent'> & {
		/** Animation trjectory of axis ticks. */
		animationTrajectory?: AnimationTrajectory;
	};

export default function AnimatedAxis<Scale extends AxisScale>(props: AnimatedAxisProps<Scale>) {
	return <BaseAxis AxisComponent={VxAnimatedAxis} {...props} />;
}
