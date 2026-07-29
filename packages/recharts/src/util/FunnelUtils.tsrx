import * as React from 'octane';
import { Props as FunnelProps, FunnelTrapezoidItem } from '../cartesian/Funnel';
import { Trapezoid } from '../shape/Trapezoid';
import { ShapeAnimationProps } from './types';
import { Shape } from './ActiveShapeUtils';

export const defaultFunnelShape = Trapezoid;

export type FunnelTrapezoidProps =
	{
		option: Exclude<FunnelProps['shape'], undefined> | FunnelProps['activeShape'];
		isActive: boolean;
	} & ShapeAnimationProps & FunnelTrapezoidItem;

type FunnelTrapezoidShapeProps = Omit<FunnelTrapezoidProps, 'option'>;

export function FunnelTrapezoid({ option, ...shapeProps }: FunnelTrapezoidProps) {
	return <Shape option={option} DefaultShape={defaultFunnelShape} shapeProps={shapeProps} />;
}
