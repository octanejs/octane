import { useEffect } from 'octane';
import { useAppDispatch } from './hooks';
import { PolarChartOptions, updatePolarOptions } from './polarOptionsSlice';

export function ReportPolarOptions(props: PolarChartOptions): null {
	const dispatch = useAppDispatch();
	useEffect(() => {
		dispatch(updatePolarOptions(props));
	}, [dispatch, props]);
	return null;
}
