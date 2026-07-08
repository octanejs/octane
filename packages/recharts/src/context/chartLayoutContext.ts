// Port of context/chartLayoutContext.ts — layout/size/margin/viewBox selector
// hooks plus the reporter components that publish chart dimensions into the
// layout slice. Hooks that read the store MULTIPLE times thread explicit
// sub-slots (binding convention — see ../internal).
import { useEffect } from 'octane';
import { useAppDispatch, useAppSelector } from '../state/hooks';
import { setChartSize, setMargin } from '../state/layoutSlice';
import {
	selectChartOffsetInternal,
	selectChartViewBox,
} from '../state/selectors/selectChartOffsetInternal';
import { selectChartHeight, selectChartWidth } from '../state/selectors/containerSelectors';
import { useIsPanorama } from './PanoramaContext';
import { selectBrushDimensions, selectBrushSettings } from '../state/selectors/brushSelectors';
import { useResponsiveContainerContext } from '../component/ResponsiveContainer';
import { isPositiveNumber } from '../util/isWellBehavedNumber';
import { splitSlot, subSlot } from '../internal';

export function cartesianViewBoxToTrapezoid(box: any) {
	if (!box) {
		return undefined;
	}
	return {
		x: box.x,
		y: box.y,
		upperWidth: 'upperWidth' in box ? box.upperWidth : box.width,
		lowerWidth: 'lowerWidth' in box ? box.lowerWidth : box.width,
		width: box.width,
		height: box.height,
	};
}

export const useViewBox = (...rest: any[]) => {
	const [, slot] = splitSlot(rest);
	const panorama = useIsPanorama();
	const rootViewBox = useAppSelector(selectChartViewBox, subSlot(slot, 'clc:viewBox'));
	const brushDimensions = useAppSelector(selectBrushDimensions, subSlot(slot, 'clc:brushDim'));
	const brushPadding = useAppSelector(selectBrushSettings, subSlot(slot, 'clc:brushSet'))?.padding;
	if (!panorama || !brushDimensions || !brushPadding) {
		return rootViewBox;
	}
	return {
		width: brushDimensions.width - brushPadding.left - brushPadding.right,
		height: brushDimensions.height - brushPadding.top - brushPadding.bottom,
		x: brushPadding.left,
		y: brushPadding.top,
	};
};

const manyComponentsThrowErrorsIfOffsetIsUndefined = {
	top: 0,
	bottom: 0,
	left: 0,
	right: 0,
	width: 0,
	height: 0,
	brushBottom: 0,
};

/**
 * For internal use only. If you want this information, `import { useOffset }
 * from 'recharts'` instead. Returns the offset of the chart in pixels.
 */
export const useOffsetInternal = (...rest: any[]) => {
	const [, slot] = splitSlot(rest);
	return (
		useAppSelector(selectChartOffsetInternal, subSlot(slot, 'clc:offset')) ??
		manyComponentsThrowErrorsIfOffsetIsUndefined
	);
};

/** The width of the chart in pixels, or `undefined` outside a chart context. */
export const useChartWidth = (...rest: any[]) => {
	const [, slot] = splitSlot(rest);
	return useAppSelector(selectChartWidth, subSlot(slot, 'clc:width'));
};

/** The height of the chart in pixels, or `undefined` outside a chart context. */
export const useChartHeight = (...rest: any[]) => {
	const [, slot] = splitSlot(rest);
	return useAppSelector(selectChartHeight, subSlot(slot, 'clc:height'));
};

const selectMargin = (state: any) => state.layout.margin;

/** The chart's margin (empty space around the plot), or `undefined` outside a chart. */
export const useMargin = (...rest: any[]) => {
	const [, slot] = splitSlot(rest);
	return useAppSelector(selectMargin, subSlot(slot, 'clc:margin'));
};

export const selectChartLayout = (state: any) => state.layout.layoutType;

/**
 * The chart layout as configured by the chart (`horizontal`/`vertical` for
 * cartesian, `centric`/`radial` for polar), or `undefined` outside a chart.
 * @deprecated prefer useCartesianChartLayout / usePolarChartLayout.
 */
export const useChartLayout = (...rest: any[]) => {
	const [, slot] = splitSlot(rest);
	return useAppSelector(selectChartLayout, subSlot(slot, 'clc:layout'));
};

/** The layout only when cartesian (`horizontal` / `vertical`), else undefined. */
export const useCartesianChartLayout = (...rest: any[]) => {
	const [, slot] = splitSlot(rest);
	const layout = useAppSelector(selectChartLayout, subSlot(slot, 'clc:layout'));
	if (layout === 'horizontal' || layout === 'vertical') {
		return layout;
	}
	return undefined;
};

export const selectPolarChartLayout = (state: any) => {
	const layout = state.layout.layoutType;
	if (layout === 'centric' || layout === 'radial') {
		return layout;
	}
	return undefined;
};

/** The layout only when polar (`centric` / `radial`), else undefined. */
export const usePolarChartLayout = (...rest: any[]) => {
	const [, slot] = splitSlot(rest);
	return useAppSelector(selectPolarChartLayout, subSlot(slot, 'clc:polarLayout'));
};

/** True when rendered inside a chart context (all charts provide a layout). */
export const useIsInChartContext = (...rest: any[]) => {
	const [, slot] = splitSlot(rest);
	const layout = useAppSelector(selectChartLayout, subSlot(slot, 'clc:layout'));
	return layout !== undefined;
};

export const ReportChartSize = (props: { width: number; height: number }): null => {
	const dispatch = useAppDispatch();
	// Skip dispatching in a panorama chart: the ROOT chart decides these, and
	// Brush reads them from the store (stability avoids a re-render cycle).
	const isPanorama = useIsPanorama();
	const { width: widthFromProps, height: heightFromProps } = props;
	const responsiveContainerCalculations = useResponsiveContainerContext();
	let width = widthFromProps;
	let height = heightFromProps;
	if (responsiveContainerCalculations) {
		// ResponsiveContainer-provided dimensions win over explicit props (3.x
		// behavior, kept for backwards compatibility).
		width =
			responsiveContainerCalculations.width > 0
				? responsiveContainerCalculations.width
				: widthFromProps;
		height =
			responsiveContainerCalculations.height > 0
				? responsiveContainerCalculations.height
				: heightFromProps;
	}
	useEffect(() => {
		if (!isPanorama && isPositiveNumber(width) && isPositiveNumber(height)) {
			dispatch(setChartSize({ width, height }));
		}
	}, [dispatch, isPanorama, width, height]);
	return null;
};

export const ReportChartMargin = (props: { margin: unknown }): null => {
	const { margin } = props;
	const dispatch = useAppDispatch();
	useEffect(() => {
		dispatch(setMargin(margin));
	}, [dispatch, margin]);
	return null;
};
