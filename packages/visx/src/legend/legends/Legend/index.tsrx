import type { ReactNode, CSSProperties } from 'react';
import { createElement } from 'octane';
import cx from 'classnames';
import type { AnyD3Scale, ScaleInput } from '@octanejs/visx/scale';
import LegendItem from './LegendItem.tsrx';
import type { LegendLabelProps } from './LegendLabel.tsrx';
import LegendLabel from './LegendLabel.tsrx';
import LegendShape from './LegendShape.tsrx';
import valueOrIdentity, { valueOrIdentityString } from '../../util/valueOrIdentity';
import labelTransformFactory from '../../util/labelTransformFactory';
import type {
	FlexDirection,
	FormattedLabel,
	LabelFormatter,
	LabelFormatterFactory,
	LegendShape as LegendShapeType,
} from '../../types';

export type LegendProps<Scale extends AnyD3Scale> = {
	/** Optional render function override. */
	children?: (labels: FormattedLabel<ScaleInput<Scale>, ReturnType<Scale>>[]) => ReactNode;
	/** Classname to be applied to legend container. */
	className?: string;
	/** Styles to be applied to the legend container. */
	style?: CSSProperties;
	/** Legend domain. */
	domain?: ScaleInput<Scale>[];
	/** Width of the legend shape. */
	shapeWidth?: string | number;
	/** Height of the legend shape. */
	shapeHeight?: string | number;
	/** Margin of the legend shape. */
	shapeMargin?: string | number;
	/** Flex-box alignment of legend item labels. */
	labelAlign?: string;
	/** `@octanejs/visx/scale` or `d3-scale` object used to generate the legend items. */
	scale: Scale;
	/** Flex-box flex of legend item labels. */
	labelFlex?: string | number;
	/** Margin of legend item labels. */
	labelMargin?: string | number;
	/** Margin of legend items. */
	itemMargin?: string | number;
	/** Flex direction of the legend itself. */
	direction?: FlexDirection;
	/** Flex direction of legend items. */
	itemDirection?: FlexDirection;
	/** Legend item fill accessor function. */
	fill?: (label: FormattedLabel<ScaleInput<Scale>, ReturnType<Scale>>) => string | undefined;
	/** Legend item size accessor function. */
	size?: (label: FormattedLabel<ScaleInput<Scale>, ReturnType<Scale>>) => | string
	| number
	| undefined;
	/** Legend shape string preset or Element or Component. */
	shape?: LegendShapeType<ScaleInput<Scale>, ReturnType<Scale>>;
	/** Styles applied to legend shapes. */
	shapeStyle?: (label: FormattedLabel<ScaleInput<Scale>, ReturnType<Scale>>) => CSSProperties;
	/** Given a legend item and its index, returns an item label. */
	labelFormat?: LabelFormatter<ScaleInput<Scale>>;
	/** Given the legend scale and labelFormatter, returns a label with datum, index, value, and label. */
	labelTransform?: LabelFormatterFactory<Scale>;
	/** Additional props to be set on LegendLabel. */
	legendLabelProps?: Partial<LegendLabelProps>;
};

const defaultStyle = {
	display: 'flex',
};

export default function Legend<Scale extends AnyD3Scale>({
	className,
	style = defaultStyle,
	scale,
	shape,
	domain: inputDomain,
	fill = valueOrIdentityString,
	size = valueOrIdentityString,
	labelFormat = valueOrIdentity,
	labelTransform = labelTransformFactory,
	shapeWidth = 15,
	shapeHeight = 15,
	shapeMargin = '2px 4px 2px 0',
	shapeStyle,
	labelAlign = 'left',
	labelFlex = '1',
	labelMargin = '0 4px',
	itemMargin = '0',
	direction = 'column',
	itemDirection = 'row',
	legendLabelProps,
	children,
	...legendItemProps
}: LegendProps<Scale>) {
	// `Scale extends ScaleType` constraint is tricky
	//  could consider removing `scale` altogether in the future and making `domain: Datum[]` required
	const domain = inputDomain || ('domain' in scale ? scale.domain() : []);
	const labelFormatter = labelTransform({ scale, labelFormat });
	const labels = domain.map(labelFormatter);
	if (children) return <>
		{children(labels)}
	</>;
	const legendItems = labels.map(
		(label, i) => createElement(
			LegendItem,
			{
				key: `legend-${label.text}-${i}`,
				margin: itemMargin,
				flexDirection: itemDirection,
				...legendItemProps,
			},
			createElement(LegendShape, {
				shape,
				height: shapeHeight,
				width: shapeWidth,
				margin: shapeMargin,
				item: domain[i],
				itemIndex: i,
				label,
				fill,
				size,
				shapeStyle,
			}),
			createElement(LegendLabel, {
				label: label.text,
				flex: labelFlex,
				margin: labelMargin,
				align: labelAlign,
				...legendLabelProps,
			}),
		),
	);

	return <div
		className={cx('visx-legend', className)}
		style={{
			...style,
			flexDirection: direction,
		}}
	>{legendItems}</div>;
}
