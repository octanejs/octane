// Port of util/BarUtils.tsx — the bar shape wrapper (Rectangle by default,
// user overridable through the Shape helper) + the minPointSize resolver.
import invariant from 'tiny-invariant';
import { Rectangle } from '../shape/Rectangle.tsrx';
import { Shape } from './ActiveShapeUtils.tsrx';
import { isNullish, isNumber } from './DataUtils';

export const defaultBarShape = Rectangle;

export function BarRectangle(barRectangleProps) {
	const { option, ...shapeProps } = barRectangleProps;
	return <Shape
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
export const minPointSizeCallback = (minPointSize, defaultValue = 0) => (value, index) => {
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
