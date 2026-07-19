import { useContext, useMemo } from 'octane';
import type { CSSProperties } from 'react';
import type { OctaneNode } from 'octane';
import cx from 'classnames';
import { Group } from '@octanejs/visx/group';
import AnnotationContext from '../context/AnnotationContext.tsrx';
import AnchorLine from './LabelAnchorLine.tsrx';
import type { LabelProps } from './Label.tsrx';

const wrapperStyle = { display: 'inline-block' };

export type HtmlLabelProps =
	Pick<LabelProps, | 'anchorLineStroke'
	| 'className'
	| 'horizontalAnchor'
	| 'resizeObserverPolyfill'
	| 'showAnchorLine'
	| 'verticalAnchor'
	| 'x'
	| 'y'> & {
		/** Pass in a custom element as the label to style as you like. Renders inside a <foreignObject>, be aware that most non-browser SVG renderers will not render HTML <foreignObject>s. See: https://github.com/airbnb/visx/issues/1173#issuecomment-1014380545.  */
		children?: OctaneNode;
		/** Optional styles to apply to the HTML container. */
		containerStyle?: CSSProperties;
	};
export default function HtmlLabel({
	anchorLineStroke = '#222',
	children,
	className,
	containerStyle,
	horizontalAnchor: propsHorizontalAnchor,
	showAnchorLine = true,
	verticalAnchor: propsVerticalAnchor,
	x: propsX,
	y: propsY,
}: HtmlLabelProps) {
	const textualChildren =
		typeof children === 'string' || typeof children === 'number' ? String(children) : '';
	const styleWidth = Number.parseFloat(String(containerStyle?.width ?? ''));
	const styleHeight = Number.parseFloat(String(containerStyle?.height ?? ''));
	const width =
		Number.isFinite(styleWidth)
				? styleWidth
				: textualChildren
					? Math.max(1, textualChildren.length * 8)
					: 100;
	const height =
		Number.isFinite(styleHeight) ? styleHeight : textualChildren ? 20 : 24;

	// if props are provided, they take precedence over context
	const { x = 0, y = 0, dx = 0, dy = 0 } = useContext(AnnotationContext);

	// offset container position based on horizontal + vertical anchor
	const horizontalAnchor =
		propsHorizontalAnchor || (Math.abs(dx) < Math.abs(dy) ? 'middle' : dx > 0 ? 'start' : 'end');
	const verticalAnchor =
		propsVerticalAnchor || (Math.abs(dx) > Math.abs(dy) ? 'middle' : dy > 0 ? 'start' : 'end');

	const containerCoords = useMemo(() => {
		let adjustedX: number =
			propsX == null ? x + dx : propsX;
		let adjustedY: number =
			propsY == null ? y + dy : propsY;

		if (horizontalAnchor === 'middle') adjustedX -= width / 2;
		if (horizontalAnchor === 'end') adjustedX -= width;
		if (verticalAnchor === 'middle') adjustedY -= height / 2;
		if (verticalAnchor === 'end') adjustedY -= height;

		return { x: adjustedX, y: adjustedY };
	}, [propsX, x, dx, propsY, y, dy, horizontalAnchor, verticalAnchor, width, height]);

	return <Group
		top={containerCoords.y}
		left={containerCoords.x}
		pointerEvents="none"
		className={cx('visx-annotationlabel', className)}
	>
		<foreignObject width={width} height={height} overflow="visible">
			<div
				style={containerStyle ? { ...wrapperStyle, ...containerStyle } : wrapperStyle}
			>{children}</div>
		</foreignObject>
		{showAnchorLine &&
			<AnchorLine
				anchorLineOrientation={Math.abs(dx) > Math.abs(dy) ? 'vertical' : 'horizontal'}
				anchorLineStroke={anchorLineStroke}
				verticalAnchor={verticalAnchor}
				horizontalAnchor={horizontalAnchor}
				width={width}
				height={height}
			/>}
	</Group>;
}
