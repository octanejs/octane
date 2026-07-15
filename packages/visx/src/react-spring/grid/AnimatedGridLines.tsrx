import type { SVGProps } from 'react';
import { animated, useTransition as useSpringTransition } from '../../internal/spring.tsrx';
import type { GridScale, GridLines, CommonGridProps } from '@octanejs/visx/grid';
import type { TransitionConfig } from '../spring-configs/useLineTransitionConfig.tsrx';
import useLineTransitionConfig from '../spring-configs/useLineTransitionConfig.tsrx';

export type AnimatedGridLinesProps<Scale extends GridScale> = {
		lines: GridLines;
		lineKey: (line: GridLines[number]) => string;
		scale: Scale;
	} & Omit<SVGProps<SVGLineElement>, 'ref' | 'scale'> & Pick<TransitionConfig<Scale>, 'animationTrajectory' | 'animateXOrY'> & Pick<CommonGridProps, 'stroke' | 'strokeWidth' | 'lineStyle' | 'strokeDasharray'>;

export default function AnimatedGridLines<Scale extends GridScale>({
	scale,
	lines,
	animationTrajectory,
	animateXOrY,
	lineKey,
	lineStyle,
	...lineProps
}: AnimatedGridLinesProps<Scale>) {
	const animatedLines = useSpringTransition(lines, {
		...useLineTransitionConfig({
			scale,
			animateXOrY,
			animationTrajectory,
		}),
		key: lineKey,
	});

	return <>
		{/* @ts-expect-error react-spring's type inference issue on the styles */}
		{animatedLines(
			({ fromX, toX, fromY, toY, opacity }, _, { key }) =>
				<animated.line
					key={key}
					x1={fromX}
					x2={toX}
					y1={fromY}
					y2={toY}
					strokeOpacity={opacity}
					style={lineStyle}
					{...lineProps}
				/>,
		)}
	</>;
}
