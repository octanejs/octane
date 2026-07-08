// Port of util/ActiveShapeUtils.tsx — renders a user-defined `shape`/
// `activeShape` option in all four accepted forms: an element (cloned with the
// computed props as defaults), a render function, a props object (merged), or
// boolean/undefined (default shape). octane cloneElement/isValidElement work
// on element descriptors — value-position elements, which is exactly how these
// options arrive (`shape={<Rectangle .../>}` compiles to a descriptor).
import { cloneElement, isValidElement } from 'octane';
import { Layer } from '../container/Layer.tsrx';

function mergeShapeProps(option, props) {
	return { ...props, ...option };
}

export function getPropsFromShapeOption(option) {
	if (isValidElement(option)) {
		return option.props;
	}
	return option;
}

function renderWithShapeElement(option, props) {
	return cloneElement(option, mergeShapeProps(getPropsFromShapeOption(option), props));
}

function getShapeIndex(shapeProps) {
	if (!('index' in shapeProps)) {
		return undefined;
	}
	const { index } = shapeProps;
	return typeof index === 'number' || typeof index === 'string' ? index : undefined;
}

function isActiveShape(shapeProps) {
	return 'isActive' in shapeProps && shapeProps.isActive === true;
}

export function Shape(shapeOuterProps) {
	const {
		option,
		DefaultShape,
		shapeProps,
		activeClassName = 'recharts-active-shape',
		inActiveClassName = 'recharts-shape',
	} = shapeOuterProps;
	const index = getShapeIndex(shapeProps);
	let shape;
	if (isValidElement(option)) {
		shape = renderWithShapeElement(option, shapeProps);
	} else if (option === DefaultShape) {
		shape = <DefaultShape {...shapeProps} />;
	} else if (typeof option === 'function') {
		shape = option(shapeProps, index);
	} else if (typeof option === 'object') {
		shape = <DefaultShape {...mergeShapeProps(option, shapeProps)} />;
	} else {
		shape = <DefaultShape {...shapeProps} />;
	}
	if (isActiveShape(shapeProps)) {
		return <Layer className={activeClassName}>{shape}</Layer>;
	}
	return <Layer className={inActiveClassName}>{shape}</Layer>;
}
