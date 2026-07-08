// Port of context/chartDataContext.tsx — reporter components that publish the
// chart's `data` prop into the store, plus the read hooks.
import { useEffect } from 'octane';
import { setChartData, setComputedData } from '../state/chartDataSlice';
import { useAppDispatch, useAppSelector } from '../state/hooks';
import { useIsPanorama } from './PanoramaContext';
import { splitSlot, subSlot } from '../internal';

export const ChartDataContextProvider = (props: { chartData: unknown }): null => {
	const { chartData } = props;
	const dispatch = useAppDispatch();
	const isPanorama = useIsPanorama();
	useEffect(() => {
		if (isPanorama) {
			// Panorama mode reuses data from the main chart, so we must not overwrite it here.
			return () => {
				// there is nothing to clean up
			};
		}
		dispatch(setChartData(chartData));
		return () => {
			dispatch(setChartData(undefined));
		};
	}, [chartData, dispatch, isPanorama]);
	return null;
};

export const SetComputedData = (props: { computedData: unknown }): null => {
	const { computedData } = props;
	const dispatch = useAppDispatch();
	useEffect(() => {
		dispatch(setComputedData(computedData));
		return () => {
			dispatch(setChartData(undefined));
		};
	}, [computedData, dispatch]);
	return null;
};

const selectChartData = (state: any) => state.chartData.chartData;

/** @deprecated use one of the other selectors instead. */
export const useChartData = (...rest: any[]) => {
	const [, slot] = splitSlot(rest);
	return useAppSelector(selectChartData, subSlot(slot, 'cdc:data'));
};

const selectDataIndex = (state: any) => {
	const { dataStartIndex, dataEndIndex } = state.chartData;
	return { startIndex: dataStartIndex, endIndex: dataEndIndex };
};

/** startIndex and endIndex are data boundaries, set through Brush. */
export const useDataIndex = (...rest: any[]) => {
	const [, slot] = splitSlot(rest);
	return useAppSelector(selectDataIndex, subSlot(slot, 'cdc:index'));
};
