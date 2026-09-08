import type { NativeMouseEvent } from './OctaneTypes.ts';
import type { ActiveShape, DataKey, ShapeAnimationProps } from './types';
import type { Props as RectangleProps } from '../shape/Rectangle.tsrx';
import type { BarBackgroundShapeProps, BarShapeProps } from '../cartesian/Bar.tsrx';

type BarRectangleSharedProps =
	{
		onMouseEnter?: (e: NativeMouseEvent<SVGPathElement>) => void;
		onMouseLeave?: (e: NativeMouseEvent<SVGPathElement>) => void;
		onClick?: (e: NativeMouseEvent<SVGPathElement>) => void;
		dataKey: DataKey<any> | undefined;
	} & ShapeAnimationProps & Omit<RectangleProps, 'onAnimationStart' | 'onAnimationEnd'>;
export type BarRectangleProps =
	BarShapeProps & BarRectangleSharedProps & {
		option: ActiveShape<BarShapeProps, SVGPathElement>;
	};
export type BarBackgroundRectangleProps =
	BarBackgroundShapeProps & BarRectangleSharedProps & {
		option: ActiveShape<BarBackgroundShapeProps, SVGPathElement>;
	};
type BarRectangleShapeProps = Omit<BarRectangleProps, 'option'>;
type BarBackgroundRectangleShapeProps = Omit<BarBackgroundRectangleProps, 'option'>;
export type MinPointSize = number | ((value: number | undefined | null, index: number) => number);
// Port of util/BarUtils.tsx — the bar shape wrapper (Rectangle by default,
// user overridable through the Shape helper) + the minPointSize resolver.
import invariant from 'tiny-invariant';
import { Rectangle } from '../shape/Rectangle.tsrx';
import { Shape } from './ActiveShapeUtils.tsrx';
import { isNullish, isNumber } from './DataUtils';

export const defaultBarShape = Rectangle;

const BarRectangleShape = Shape<BarRectangleShapeProps, SVGPathElement>;
const BarBackgroundRectangleShape = Shape<BarBackgroundRectangleShapeProps, SVGPathElement>;

export function BarRectangle(barRectangleProps: BarRectangleProps) {
	const { option, ...shapeProps } = barRectangleProps;
	return <BarRectangleShape
		option={option}
		DefaultShape={defaultBarShape}
		shapeProps={shapeProps}
		activeClassName="recharts-active-bar"
		inActiveClassName="recharts-inactive-bar"
	/>;
}

export function BarBackgroundRectangle(backgroundRectangleProps: BarBackgroundRectangleProps) {
	const { option, ...shapeProps } = backgroundRectangleProps;
	return <BarBackgroundRectangleShape
		option={option}
		DefaultShape={defaultBarShape}
		shapeProps={shapeProps}
		activeClassName="recharts-active-bar"
		inActiveClassName="recharts-inactive-bar"
	/>;
}

/**
 * Safely gets minPointSize from the minPointSize prop if it is a function
 */
export const minPointSizeCallback = (minPointSize: MinPointSize, defaultValue = 0) => (
	value: unknown,
	index: number,
): number => {
	if (isNumber(minPointSize)) return minPointSize;
	const isValueNumberOrNil = isNumber(value) || isNullish(value);
	if (isValueNumberOrNil) {
		return minPointSize(value, index);
	}
	invariant(
		isValueNumberOrNil,
		`minPointSize callback function received a value with type of ${typeof value}. Currently only numbers or null/undefined are supported.`,
	);
	return defaultValue;
};
