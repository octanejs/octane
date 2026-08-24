import type { OctaneElement, OctaneNode, SVGProps } from './OctaneTypes.ts';
import type { ActiveShape, ShapeAnimationProps } from './types';

type ShapeRenderer<PropsType> = (props: PropsType) => OctaneNode;
type ShapeOptionProps<PropsType extends object> = Partial<PropsType>;
type ShapeOptionElement<PropsType extends object> = OctaneElement<ShapeOptionProps<PropsType>>;
export type ShapeProps<PropsType extends object, ElementType extends SVGElement = SVGElement> = {
	option: ActiveShape<PropsType, ElementType> | undefined;
	DefaultShape: ShapeRenderer<PropsType>;
	shapeProps: PropsType;
	activeClassName?: string;
	inActiveClassName?: string;
};
// Port of util/ActiveShapeUtils.tsx — renders a user-defined `shape`/
// `activeShape` option in all four accepted forms: an element (cloned with the
// computed props as defaults), a render function, a props object (merged), or
// boolean/undefined (default shape). octane cloneElement/isValidElement work
// on element descriptors — value-position elements, which is exactly how these
// options arrive (`shape={<Rectangle .../>}` compiles to a descriptor).
import { cloneElement, isValidElement } from 'octane';
import { Layer } from '../container/Layer.tsrx';

function mergeShapeProps<PropsType extends object>(
	option: ShapeOptionProps<PropsType>,
	props: PropsType,
): PropsType {
	return { ...props, ...option };
}

export function getPropsFromShapeOption<PropsType extends object>(
	option: ShapeOptionElement<PropsType> | ShapeOptionProps<PropsType>,
): ShapeOptionProps<PropsType> {
	if (isValidElement<ShapeOptionProps<PropsType>>(option)) {
		return option.props;
	}
	return option;
}

function renderWithShapeElement<PropsType extends object, OptionProps extends Partial<PropsType>>(
	option: OctaneElement<OptionProps>,
	props: PropsType,
) {
	return cloneElement(option, mergeShapeProps(option.props, props));
}

function getShapeIndex(shapeProps: object) {
	if (!('index' in shapeProps)) {
		return undefined;
	}
	const { index } = shapeProps;
	return typeof index === 'number' || typeof index === 'string' ? index : undefined;
}

function isActiveShape(shapeProps: object) {
	return 'isActive' in shapeProps && shapeProps.isActive === true;
}

export function Shape<
	PropsType extends ShapeAnimationProps,
	ElementType extends SVGElement = SVGElement,
>(shapeOuterProps: ShapeProps<PropsType, ElementType>) {
	const {
		option,
		DefaultShape,
		shapeProps,
		activeClassName = 'recharts-active-shape',
		inActiveClassName = 'recharts-shape',
	} = shapeOuterProps;
	const index = getShapeIndex(shapeProps);
	let shape: OctaneNode;
	if (isValidElement<Partial<PropsType> & SVGProps<ElementType>>(option)) {
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
