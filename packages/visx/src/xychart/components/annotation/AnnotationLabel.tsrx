import { useContext } from 'octane';
import { Label as BaseLabel } from '@octanejs/visx/annotation';
import type { LabelProps as BaseLabelProps } from '@octanejs/visx/annotation';
import DataContext from '../../context/DataContext.tsrx';

export type AnnotationLabelProps = BaseLabelProps;

const defaultBackgroundProps = { fillOpacity: 0.7 };

/** AnnotationLabel which provides text styles from theme. */
export default function AnnotationLabel(props: AnnotationLabelProps) {
	const { theme, resizeObserverPolyfill } = useContext(DataContext);
	const titleProps = theme?.svgLabelBig;
	const subtitleProps = theme?.svgLabelSmall;
	return <BaseLabel
		anchorLineStroke={theme?.axisStyles.x.bottom.axisLine.stroke}
		backgroundFill={theme?.backgroundColor}
		backgroundProps={defaultBackgroundProps}
		showAnchorLine
		subtitleFontSize={subtitleProps?.fontSize}
		subtitleFontWeight={subtitleProps?.fontWeight}
		subtitleProps={subtitleProps}
		titleFontSize={titleProps?.fontSize}
		titleFontWeight={titleProps?.fontWeight}
		titleProps={titleProps}
		resizeObserverPolyfill={resizeObserverPolyfill}
		{...props}
	/>;
}
