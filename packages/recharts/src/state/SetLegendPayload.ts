// Port of state/SetLegendPayload.tsx — legend payload registration (cartesian
// skips panorama; polar gates on the polar layouts).
import { useLayoutEffect, useRef } from 'octane';
import { useIsPanorama } from '../context/PanoramaContext';
import { selectChartLayout } from '../context/chartLayoutContext';
import { useAppDispatch, useAppSelector } from './hooks';
import { addLegendPayload, replaceLegendPayload, removeLegendPayload } from './legendSlice';

export function SetLegendPayload(props: { legendPayload: unknown }): null {
	const { legendPayload } = props;
	const dispatch = useAppDispatch();
	const isPanorama = useIsPanorama();
	const prevPayloadRef = useRef<unknown>(null);
	useLayoutEffect(() => {
		if (isPanorama) {
			return;
		}
		if (prevPayloadRef.current === null) {
			dispatch(addLegendPayload(legendPayload));
		} else if (prevPayloadRef.current !== legendPayload) {
			dispatch(replaceLegendPayload({ prev: prevPayloadRef.current, next: legendPayload }));
		}
		prevPayloadRef.current = legendPayload;
	}, [dispatch, isPanorama, legendPayload]);
	useLayoutEffect(() => {
		return () => {
			if (prevPayloadRef.current) {
				dispatch(removeLegendPayload(prevPayloadRef.current));
				prevPayloadRef.current = null;
			}
		};
	}, [dispatch]);
	return null;
}

export function SetPolarLegendPayload(props: { legendPayload: unknown }): null {
	const { legendPayload } = props;
	const dispatch = useAppDispatch();
	const layout = useAppSelector(selectChartLayout);
	const prevPayloadRef = useRef<unknown>(null);
	useLayoutEffect(() => {
		if (layout !== 'centric' && layout !== 'radial') {
			return;
		}
		if (prevPayloadRef.current === null) {
			dispatch(addLegendPayload(legendPayload));
		} else if (prevPayloadRef.current !== legendPayload) {
			dispatch(replaceLegendPayload({ prev: prevPayloadRef.current, next: legendPayload }));
		}
		prevPayloadRef.current = legendPayload;
	}, [dispatch, layout, legendPayload]);
	useLayoutEffect(() => {
		return () => {
			if (prevPayloadRef.current) {
				dispatch(removeLegendPayload(prevPayloadRef.current));
				prevPayloadRef.current = null;
			}
		};
	}, [dispatch]);
	return null;
}
