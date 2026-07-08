// Port of state/ReportMainChartProps.tsx — layout + margin land in the store
// via effect (never during render), skipped entirely inside a Brush panorama.
import { memo, useEffect } from 'octane';
import { useIsPanorama } from '../context/PanoramaContext';
import { setLayout, setMargin } from './layoutSlice';
import { useAppDispatch } from './hooks';
import { propsAreEqual } from '../util/propsAreEqual';

function ReportMainChartPropsImpl(props: { layout: unknown; margin: unknown }): null {
	const { layout, margin } = props;
	const dispatch = useAppDispatch();
	const isPanorama = useIsPanorama();
	useEffect(() => {
		if (!isPanorama) {
			dispatch(setLayout(layout));
			dispatch(setMargin(margin));
		}
	}, [dispatch, isPanorama, layout, margin]);
	return null;
}

export const ReportMainChartProps = memo(ReportMainChartPropsImpl, propsAreEqual);
