import { animated, useTransition as useSpringTransition, to } from '../../internal/spring.tsrx';
import type { SpringValue } from '../../internal/spring.tsrx';
import cx from 'classnames';
import { Orientation } from '@octanejs/visx/axis';
import type { ComputedTick, TicksRendererProps, AxisScale } from '@octanejs/visx/axis';
import { Text } from '@octanejs/visx/text';

import useLineTransitionConfig from '../spring-configs/useLineTransitionConfig.tsrx';
import type { AnimationTrajectory } from '../types';

export default function AnimatedTicks<Scale extends AxisScale>({
	hideTicks,
	horizontal,
	orientation,
	scale,
	tickClassName,
	tickComponent,
	tickLabelProps: allTickLabelProps,
	tickStroke = '#222',
	tickTransform,
	ticks,
	tickLineProps,
	animationTrajectory,
}: TicksRendererProps<Scale> & { animationTrajectory?: AnimationTrajectory }) {
	const animatedTicks = useSpringTransition(ticks, {
		...useLineTransitionConfig({
			scale,
			animateXOrY: horizontal ? 'x' : 'y',
			animationTrajectory,
		}),
		keys: (tick: ComputedTick<Scale>) => `tick-${tick.value}-${tick.index}`,
	});

	return <>
		{/* @ts-expect-error react-spring's type inference issue on the styles */}
		{animatedTicks(({ fromX, toX, fromY, toY, opacity }, item, { key }, index) => {
			const tickLabelProps = allTickLabelProps[index] ?? allTickLabelProps[0] ?? {};
			return item == null || key == null
				? null
				: <animated.g
						key={key}
						className={cx('visx-axis-tick', tickClassName)}
						transform={tickTransform}
					>
						{!hideTicks &&
							<animated.line
								x1={fromX}
								x2={toX}
								y1={fromY}
								y2={toY}
								stroke={tickStroke}
								strokeLinecap="square"
								strokeOpacity={opacity}
								{...tickLineProps}
							/>}
						{/** animate the group, not the Text */}
						<animated.g
							key={index}
							transform={to(
								[toX as SpringValue<number>, toY as SpringValue<number>],
								(interpolatedX, interpolatedY) => `translate(${interpolatedX},${
									interpolatedY +
										(orientation === Orientation.bottom &&
										typeof tickLabelProps.fontSize === 'number'
											? tickLabelProps.fontSize ?? 10
											: 0)
								})`,
							)}
							opacity={opacity}
						>
							{tickComponent
								? (tickComponent({
										...tickLabelProps,
										x: toX,
										y: toY,
										formattedValue: item?.formattedValue,
									}))
								: <Text {...tickLabelProps}>
										{item?.formattedValue}
									</Text>}
						</animated.g>
					</animated.g>;
		})}
	</>;
}
