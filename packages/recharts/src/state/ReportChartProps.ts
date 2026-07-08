// Port of state/ReportChartProps.tsx — publishes the chart root's props into
// the rootProps slice.
import { useEffect } from 'octane';
import { updateOptions } from './rootPropsSlice';
import { useAppDispatch } from './hooks';

export function ReportChartProps(props: Record<string, unknown>): null {
	const dispatch = useAppDispatch();
	useEffect(() => {
		dispatch(updateOptions(props));
	}, [dispatch, props]);
	return null;
}
