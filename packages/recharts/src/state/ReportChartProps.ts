// Port of state/ReportChartProps.tsx — publishes the chart root's props into
// the rootProps slice.
import { useEffect } from 'octane';
import { updateOptions, type UpdatableChartOptions } from './rootPropsSlice';
import { useAppDispatch } from './hooks';

export function ReportChartProps(props: UpdatableChartOptions): null {
	const dispatch = useAppDispatch();
	useEffect(() => {
		dispatch(updateOptions(props));
	}, [dispatch, props]);
	return null;
}
