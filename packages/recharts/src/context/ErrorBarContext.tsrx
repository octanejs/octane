// Port of context/ErrorBarContext.tsx — the per-graphical-item settings an
// <ErrorBar> child reads, plus the reporter that registers error-bar presence
// in the store.
import { createContext, useContext, useEffect, useRef } from 'octane';
import { addErrorBar, removeErrorBar, replaceErrorBar } from '../state/errorBarSlice';
import { useAppDispatch } from '../state/hooks';
import { useGraphicalItemId } from './RegisterGraphicalItemId.tsrx';

const initialContextState = {
	data: [],
	xAxisId: 'xAxis-0',
	yAxisId: 'yAxis-0',
	dataPointFormatter: () => ({ x: 0, y: 0, value: 0 }),
	errorBarOffset: 0,
};

const ErrorBarContext = createContext(initialContextState);

export function SetErrorBarContext(props) {
	const { children, ...rest } = props;
	return <ErrorBarContext.Provider value={rest}>{children}</ErrorBarContext.Provider>;
}

export const useErrorBarContext = () => useContext(ErrorBarContext);

export function ReportErrorBarSettings(props) {
	const dispatch = useAppDispatch();
	const graphicalItemId = useGraphicalItemId();
	const prevPropsRef = useRef(null);
	useEffect(() => {
		if (graphicalItemId == null) {
			// ErrorBar outside a graphical item context does not do anything.
			return;
		}
		if (prevPropsRef.current === null) {
			dispatch(addErrorBar({ itemId: graphicalItemId, errorBar: props }));
		} else if (prevPropsRef.current !== props) {
			dispatch(
				replaceErrorBar({ itemId: graphicalItemId, prev: prevPropsRef.current, next: props }),
			);
		}
		prevPropsRef.current = props;
	}, [dispatch, graphicalItemId, props]);
	useEffect(() => {
		return () => {
			if (prevPropsRef.current != null && graphicalItemId != null) {
				dispatch(removeErrorBar({ itemId: graphicalItemId, errorBar: prevPropsRef.current }));
				prevPropsRef.current = null;
			}
		};
	}, [dispatch, graphicalItemId]);
	return null;
}
