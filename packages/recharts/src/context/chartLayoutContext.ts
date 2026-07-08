// Port of context/chartLayoutContext.ts — Phase 0 subset: the layout selector
// hooks the shapes need (Curve reads the chart layout to orient area curves).
// The size/margin reporters (ReportChartSize/ReportChartMargin) and the
// viewBox/offset hooks arrive with Phase 1's chart roots.
import { useAppSelector } from '../state/hooks';
import { splitSlot, subSlot } from '../internal';

export const selectChartLayout = (state: any) => state.layout.layoutType;

/**
 * Returns the chart layout as configured by the chart (`horizontal` /
 * `vertical` for cartesian charts, `centric` / `radial` for polar), or
 * `undefined` outside a chart context.
 */
export function useChartLayout(...rest: any[]) {
	const [, slot] = splitSlot(rest);
	return useAppSelector(selectChartLayout, subSlot(slot, 'clc:layout'));
}

/** The layout only when cartesian (`horizontal` / `vertical`), else undefined. */
export function useCartesianChartLayout(...rest: any[]) {
	const [, slot] = splitSlot(rest);
	const layout = useAppSelector(selectChartLayout, subSlot(slot, 'clc:layout'));
	if (layout === 'horizontal' || layout === 'vertical') {
		return layout;
	}
	return undefined;
}
