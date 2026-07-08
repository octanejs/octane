// Port of container/RootSurface.tsx — the chart's outer <svg> (via Surface),
// sized from the store, with the zIndex portal <g>s wrapped around children.
// A panorama (Brush preview) renders a nested, brush-sized Surface instead.
import { useChartHeight, useChartWidth } from '../context/chartLayoutContext.ts';
import { useAccessibilityLayer } from '../context/accessibilityContext';
import { useIsPanorama } from '../context/PanoramaContext.ts';
import { Surface } from './Surface.tsrx';
import { useAppSelector } from '../state/hooks';
import { selectBrushDimensions } from '../state/selectors/brushSelectors';
import { isPositiveNumber } from '../util/isWellBehavedNumber';
import { AllZIndexPortals } from '../zIndex/ZIndexPortal.tsrx';

const FULL_WIDTH_AND_HEIGHT = {
	width: '100%',
	height: '100%',
	// display:block — the default inline SVG reserves descender space in some
	// browsers, which inflates height measurement under responsive containers.
	display: 'block',
};

function MainChartSurface(props) {
	const width = useChartWidth();
	const height = useChartHeight();
	const hasAccessibilityLayer = useAccessibilityLayer();
	if (!isPositiveNumber(width) || !isPositiveNumber(height)) {
		return null;
	}
	const { children, otherAttributes, title, desc, ref } = props;
	let tabIndex, role;
	if (otherAttributes != null) {
		if (typeof otherAttributes.tabIndex === 'number') {
			tabIndex = otherAttributes.tabIndex;
		} else {
			tabIndex = hasAccessibilityLayer ? 0 : undefined;
		}
		if (typeof otherAttributes.role === 'string') {
			role = otherAttributes.role;
		} else {
			role = hasAccessibilityLayer ? 'application' : undefined;
		}
	}
	return <Surface
		{...otherAttributes}
		title={title}
		desc={desc}
		role={role}
		tabIndex={tabIndex}
		width={width}
		height={height}
		style={FULL_WIDTH_AND_HEIGHT}
		ref={ref}
	>{children}</Surface>;
}

function BrushPanoramaSurface(props) {
	const { children } = props;
	const brushDimensions = useAppSelector(selectBrushDimensions);
	if (!brushDimensions) {
		return null;
	}
	const { width, height, y, x } = brushDimensions;
	return <Surface width={width} height={height} x={x} y={y}>{children}</Surface>;
}

export function RootSurface(props) {
	const { children, ref, ...rest } = props;
	const isPanorama = useIsPanorama();
	if (isPanorama) {
		return <BrushPanoramaSurface>
			<AllZIndexPortals isPanorama={true}>{children}</AllZIndexPortals>
		</BrushPanoramaSurface>;
	}
	return <MainChartSurface ref={ref} {...rest}>
		<AllZIndexPortals isPanorama={false}>{children}</AllZIndexPortals>
	</MainChartSurface>;
}
