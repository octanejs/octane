// Port of component/Label.tsx — chart labels with cartesian + polar
// positioning, radial (textPath) rendering, and the label-as-prop parser
// (boolean | value | element | function | object). Element-as-prop resolves
// through octane cloneElement/createElement on descriptors.
import {
	cloneElement,
	createContext,
	createElement,
	isValidElement,
	useContext,
	useMemo,
} from 'octane';
import { clsx } from 'clsx';
import { isValidTextAnchor, Text } from './Text.tsrx';
import { isNullish, isNumber, isNumOrStr, mathSign, uniqueId } from '../util/DataUtils';
import { polarToCartesian } from '../util/PolarUtils';
import { cartesianViewBoxToTrapezoid, useViewBox } from '../context/chartLayoutContext.ts';
import { useAppSelector } from '../state/hooks';
import { selectPolarViewBox } from '../state/selectors/polarAxisSelectors';
import { resolveDefaultProps } from '../util/resolveDefaultProps';
import { svgPropertiesAndEvents } from '../util/svgPropertiesAndEvents.ts';
import { ZIndexLayer } from '../zIndex/ZIndexLayer.tsrx';
import { DefaultZIndexes } from '../zIndex/DefaultZIndexes';
import { getCartesianPosition } from '../cartesian/getCartesianPosition';

const CartesianLabelContext = createContext(null);

export function CartesianLabelContextProvider(props) @{
	const { x, y, upperWidth, lowerWidth, width, height, children } = props;
	const viewBox = useMemo(() => ({ x, y, upperWidth, lowerWidth, width, height }), [
		x,
		y,
		upperWidth,
		lowerWidth,
		width,
		height,
	]);
	<CartesianLabelContext.Provider value={viewBox}>{children}</CartesianLabelContext.Provider>
}

function useCartesianLabelContext() {
	const labelChildContext = useContext(CartesianLabelContext);
	const chartContext = useViewBox();
	return labelChildContext ||
		(chartContext ? cartesianViewBoxToTrapezoid(chartContext) : undefined);
}

const PolarLabelContext = createContext(null);

export function PolarLabelContextProvider(props) @{
	const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, clockWise, children } = props;
	const viewBox = useMemo(
		() => ({ cx, cy, innerRadius, outerRadius, startAngle, endAngle, clockWise }),
		[cx, cy, innerRadius, outerRadius, startAngle, endAngle, clockWise],
	);
	<PolarLabelContext.Provider value={viewBox}>{children}</PolarLabelContext.Provider>
}

export function usePolarLabelContext() {
	const labelChildContext = useContext(PolarLabelContext);
	const chartContext = useAppSelector(selectPolarViewBox);
	return labelChildContext || chartContext;
}

const getLabel = (props) => {
	const { value, formatter } = props;
	const label = isNullish(props.children) ? value : props.children;
	if (typeof formatter === 'function') {
		return formatter(label);
	}
	return label;
};

export function isLabelContentAFunction(content) {
	return content != null && typeof content === 'function';
}

const getDeltaAngle = (startAngle, endAngle) => {
	const sign = mathSign(endAngle - startAngle);
	const deltaAngle = Math.min(Math.abs(endAngle - startAngle), 360);
	return sign * deltaAngle;
};

function renderRadialLabel(labelProps, position, label, attrs, viewBox) {
	const { offset, className } = labelProps;
	const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, clockWise } = viewBox;
	const radius = (innerRadius + outerRadius) / 2;
	const deltaAngle = getDeltaAngle(startAngle, endAngle);
	const sign =
		deltaAngle >= 0 ? 1 : -1;
	let labelAngle, direction;
	switch (position) {
		case 'insideStart':
			labelAngle = startAngle + sign * offset;
			direction = clockWise;
			break;
		case 'insideEnd':
			labelAngle = endAngle - sign * offset;
			direction = !clockWise;
			break;
		case 'end':
			labelAngle = endAngle + sign * offset;
			direction = clockWise;
			break;
		default:
			throw new Error('Unsupported position ' + position);
	}
	direction = deltaAngle <= 0 ? direction : !direction;
	const startPoint = polarToCartesian(cx, cy, radius, labelAngle);
	const endPoint = polarToCartesian(cx, cy, radius, labelAngle + (direction ? 1 : -1) * 359);
	const path =
		'M' + startPoint.x + ',' + startPoint.y + '\n    A' + radius + ',' + radius + ',0,1,' +
			(direction ? 0 : 1) +
			',\n    ' +
			endPoint.x +
			',' +
		endPoint.y;
	const id =
		isNullish(labelProps.id) ? uniqueId('recharts-radial-line-') : labelProps.id;
	return <text
		{...attrs}
		dominantBaseline="central"
		class={clsx('recharts-radial-bar-label', className)}
	>
		<defs>
			<path id={id} d={path} />
		</defs>
		<textPath xlinkHref={'#' + id}>{label}</textPath>
	</text>;
}

const getAttrsOfPolarLabel = (viewBox, offset, position) => {
	const { cx, cy, innerRadius, outerRadius, startAngle, endAngle } = viewBox;
	const midAngle = (startAngle + endAngle) / 2;
	if (position === 'outside') {
		const { x, y } = polarToCartesian(cx, cy, outerRadius + offset, midAngle);
		return {
			x,
			y,
			textAnchor: x >= cx ? 'start' : 'end',
			verticalAnchor: 'middle',
		};
	}
	if (position === 'center') {
		return { x: cx, y: cy, textAnchor: 'middle', verticalAnchor: 'middle' };
	}
	if (position === 'centerTop') {
		return { x: cx, y: cy, textAnchor: 'middle', verticalAnchor: 'start' };
	}
	if (position === 'centerBottom') {
		return { x: cx, y: cy, textAnchor: 'middle', verticalAnchor: 'end' };
	}
	const r = (innerRadius + outerRadius) / 2;
	const { x, y } = polarToCartesian(cx, cy, r, midAngle);
	return { x, y, textAnchor: 'middle', verticalAnchor: 'middle' };
};

const isPolar = (viewBox) => viewBox != null && 'cx' in viewBox && isNumber(viewBox.cx);

export const defaultLabelProps = {
	angle: 0,
	offset: 5,
	zIndex: DefaultZIndexes.label,
	position: 'middle',
	textBreakAll: false,
};

function polarViewBoxToTrapezoid(viewBox) {
	if (!isPolar(viewBox)) {
		return viewBox;
	}
	const { cx, cy, outerRadius } = viewBox;
	const diameter = outerRadius * 2;
	return {
		x: cx - outerRadius,
		y: cy - outerRadius,
		width: diameter,
		upperWidth: diameter,
		lowerWidth: diameter,
		height: diameter,
	};
}

export function Label(outerProps) {
	const props = resolveDefaultProps(outerProps, defaultLabelProps);
	const {
		viewBox: viewBoxFromProps,
		parentViewBox,
		position,
		value,
		children,
		content,
		className = '',
		textBreakAll,
		labelRef,
	} = props;
	const polarViewBox = usePolarLabelContext();
	const cartesianViewBox = useCartesianLabelContext();

	// position 'center' prefers the cartesian box (recharts#6030 quick fix).
	const resolvedViewBox =
		position === 'center' ? cartesianViewBox : polarViewBox ?? cartesianViewBox;
	let viewBox, label, positionAttrs;
	if (viewBoxFromProps == null) {
		viewBox = resolvedViewBox;
	} else if (isPolar(viewBoxFromProps)) {
		viewBox = viewBoxFromProps;
	} else {
		viewBox = cartesianViewBoxToTrapezoid(viewBoxFromProps);
	}
	const cartesianBox = polarViewBoxToTrapezoid(viewBox);
	if (
		!viewBox ||
			isNullish(value) && isNullish(children) && !isValidElement(content) &&
				typeof content !== 'function'
	) {
		return null;
	}
	const propsWithViewBox = { ...props, viewBox };
	if (isValidElement(content)) {
		const { labelRef: _, ...propsWithoutLabelRef } = propsWithViewBox;
		return cloneElement(content, propsWithoutLabelRef);
	}
	if (typeof content === 'function') {
		const { content: _2, ...propsForContent } = propsWithViewBox;
		label = createElement(content, propsForContent);
		if (isValidElement(label)) {
			return label;
		}
	} else {
		label = getLabel(props);
	}
	const attrs = svgPropertiesAndEvents(props);
	if (isPolar(viewBox)) {
		if (position === 'insideStart' || position === 'insideEnd' || position === 'end') {
			return renderRadialLabel(props, position, label, attrs, viewBox);
		}
		positionAttrs = getAttrsOfPolarLabel(viewBox, props.offset, props.position);
	} else {
		if (!cartesianBox) {
			return null;
		}
		const cartesianResult = getCartesianPosition({
			viewBox: cartesianBox,
			position,
			offset: props.offset,
			parentViewBox: isPolar(parentViewBox) ? undefined : parentViewBox,
			clamp: true,
		});
		positionAttrs = {
			x: cartesianResult.x,
			y: cartesianResult.y,
			textAnchor: cartesianResult.horizontalAnchor,
			verticalAnchor: cartesianResult.verticalAnchor,
			...(cartesianResult.width !== undefined ? { width: cartesianResult.width } : {}),
			...(cartesianResult.height !== undefined ? { height: cartesianResult.height } : {}),
		};
	}
	return <ZIndexLayer zIndex={props.zIndex}>
		<Text
			ref={labelRef}
			className={clsx('recharts-label', className)}
			{...attrs}
			{...positionAttrs}
			textAnchor={isValidTextAnchor(attrs.textAnchor) ? attrs.textAnchor : positionAttrs.textAnchor}
			breakAll={textBreakAll}
		>{label}</Text>
	</ZIndexLayer>;
}

Label.displayName = 'Label';

const parseLabel = (label, viewBox, labelRef) => {
	if (!label) {
		return null;
	}
	const commonProps = { viewBox, labelRef };
	if (label === true) {
		return <Label key="label-implicit" {...commonProps} />;
	}
	if (isNumOrStr(label)) {
		return <Label key="label-implicit" value={label} {...commonProps} />;
	}
	if (isValidElement(label)) {
		if (label.type === Label) {
			return cloneElement(label, { key: 'label-implicit', ...commonProps });
		}
		return <Label key="label-implicit" content={label} {...commonProps} />;
	}
	if (isLabelContentAFunction(label)) {
		return <Label key="label-implicit" content={label} {...commonProps} />;
	}
	if (label && typeof label === 'object') {
		return <Label {...label} key="label-implicit" {...commonProps} />;
	}
	return null;
};

export function CartesianLabelFromLabelProp(props) {
	const { label, labelRef } = props;
	const viewBox = useCartesianLabelContext();
	return parseLabel(label, viewBox, labelRef) || null;
}

export function PolarLabelFromLabelProp(props) {
	const { label } = props;
	const viewBox = usePolarLabelContext();
	return parseLabel(label, viewBox) || null;
}
