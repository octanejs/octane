/* eslint-disable react/no-unstable-nested-components */
import { useMemo } from 'octane';
import { AnimatedGridRows, AnimatedGridColumns } from '@octanejs/visx/react-spring';
import type { AnimationTrajectory } from '@octanejs/visx/react-spring';
import type { GridRowsProps, GridColumnsProps } from '@octanejs/visx/grid';
import type { AxisScale } from '@octanejs/visx/axis';
import type { BaseGridProps } from './BaseGrid.tsrx';
import BaseGrid from './BaseGrid.tsrx';

export type AnimatedGridProps =
	Omit<BaseGridProps, 'GridRowsComponent' | 'GridColumnsComponent'> & {
		/** Animation trajectory of grid lines. */
		animationTrajectory?: AnimationTrajectory;
	};

export default function AnimatedGrid({ animationTrajectory, ...props }: AnimatedGridProps) {
	const RowsComponent = useMemo(
		() => function RowsFC(rowProps: GridRowsProps<AxisScale>) {
			return <AnimatedGridRows {...rowProps} animationTrajectory={animationTrajectory} />;
		},
		[animationTrajectory],
	);
	const ColumnsComponent = useMemo(
		() => function ColumnsFC(rowProps: GridColumnsProps<AxisScale>) {
			return <AnimatedGridColumns {...rowProps} animationTrajectory={animationTrajectory} />;
		},
		[animationTrajectory],
	);
	return <BaseGrid
		GridRowsComponent={RowsComponent}
		GridColumnsComponent={ColumnsComponent}
		{...props}
	/>;
}
