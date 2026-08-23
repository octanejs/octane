import type { OctaneNode } from '../util/OctaneTypes.ts';
import type { AxisId } from '../state/cartesianAxisSlice';
import type { ErrorBarDataPointFormatter } from '../cartesian/ErrorBar.tsrx';
import type { ErrorBarsSettings } from '../state/errorBarSlice';
import type { BarRectangleItem } from '../cartesian/Bar';
import type { LinePointItem } from '../cartesian/Line';
import type { ScatterPointItem } from '../cartesian/Scatter.tsrx';

type ErrorBarContextType<T extends BarRectangleItem | LinePointItem | ScatterPointItem> = {
	data: ReadonlyArray<any> | undefined;
	xAxisId: AxisId;
	yAxisId: AxisId;
	dataPointFormatter: ErrorBarDataPointFormatter<T>;
	errorBarOffset: number;
};
// Port of context/ErrorBarContext.tsx — the per-graphical-item settings an
// <ErrorBar> child reads, plus the reporter that registers error-bar presence
// in the store.
import { createContext, useContext, useEffect, useRef } from 'octane';
import { addErrorBar, removeErrorBar, replaceErrorBar } from '../state/errorBarSlice';
import { useAppDispatch } from '../state/hooks';
import { useGraphicalItemId } from './RegisterGraphicalItemId.tsrx';

const initialContextState: ErrorBarContextType<any> = {
	data: [],
	xAxisId: 'xAxis-0',
	yAxisId: 'yAxis-0',
	dataPointFormatter: () => ({ x: 0, y: 0, value: 0 }),
	errorBarOffset: 0,
};

const ErrorBarContext = createContext(initialContextState);

export function SetErrorBarContext<
	T extends BarRectangleItem | LinePointItem | ScatterPointItem,
>(props: ErrorBarContextType<T> & {
	children: OctaneNode;
}) {
	const { children, ...rest } = props;
	return <ErrorBarContext.Provider value={rest}>{children}</ErrorBarContext.Provider>;
}

export const useErrorBarContext = () => useContext(ErrorBarContext);

export function ReportErrorBarSettings(props: ErrorBarsSettings) {
	const dispatch = useAppDispatch();
	const graphicalItemId = useGraphicalItemId();
	const prevPropsRef = useRef<ErrorBarsSettings | null>(null);
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
