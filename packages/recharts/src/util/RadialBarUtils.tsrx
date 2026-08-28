import * as React from 'octane';
import { RadialBarDataItem, RadialBarProps } from '../polar/RadialBar.tsrx';
import { Sector } from '../shape/Sector.tsrx';
import { ShapeAnimationProps } from './types';
import { Shape } from './ActiveShapeUtils.tsrx';

export const defaultRadialBarShape = Sector;

export function parseCornerRadius(cornerRadius: string | number | undefined): number | undefined {
	if (typeof cornerRadius === 'string') {
		return parseInt(cornerRadius, 10);
	}

	return cornerRadius;
}

export interface RadialBarSectorProps extends RadialBarDataItem, ShapeAnimationProps {
	index: number;
	isActive: boolean;
}

type RadialBarSectorComponentProps =
	RadialBarSectorProps & {
		option: Exclude<RadialBarProps['shape'], undefined> | RadialBarProps['activeShape'];
	};

export function RadialBarSector({ option, ...shapeProps }: RadialBarSectorComponentProps) {
	return <Shape option={option} DefaultShape={defaultRadialBarShape} shapeProps={shapeProps} />;
}
