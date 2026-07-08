// Port of synchronisation/useChartSynchronisation.ts — cross-chart tooltip and
// brush synchronisation over the shared eventemitter3 event center. A `.tsrx`
// module so the compiler slots every store read (these hooks read many
// selectors each).
import { useEffect } from 'octane';
import { useAppDispatch, useAppSelector } from '../state/hooks';
import {
	selectEventEmitter,
	selectSyncId,
	selectSyncMethod,
} from '../state/selectors/rootPropsSelectors';
import { BRUSH_SYNC_EVENT, eventCenter, TOOLTIP_SYNC_EVENT } from '../util/Events';
import { createEventEmitter } from '../state/optionsSlice';
import { setSyncInteraction } from '../state/tooltipSlice';
import { selectTooltipDataKey } from '../state/selectors/selectors';
import {
	selectActiveTooltipGraphicalItemId,
	selectTooltipAxisTicks,
} from '../state/selectors/tooltipSelectors';
import { selectSynchronisedTooltipState } from './syncSelectors';
import { useChartLayout, useViewBox } from '../context/chartLayoutContext.ts';
import { setDataStartEndIndexes } from '../state/chartDataSlice';
import { noop } from '../util/DataUtils';

/**
 * Listens for tooltip sync events from other charts and dispatches the
 * appropriate sync interaction based on this chart's syncMethod
 * ('index' scales coordinates between viewBoxes, 'value' matches labels
 * against ticks, a function delegates tick resolution to the user).
 */
function useTooltipSyncEventsListener() {
	const mySyncId = useAppSelector(selectSyncId);
	const myEventEmitter = useAppSelector(selectEventEmitter);
	const dispatch = useAppDispatch();
	const syncMethod = useAppSelector(selectSyncMethod);
	const tooltipTicks = useAppSelector(selectTooltipAxisTicks);
	const layout = useChartLayout();
	const viewBox = useViewBox();
	const className = useAppSelector((state) => state.rootProps.className);
	useEffect(() => {
		if (mySyncId == null) {
			// This chart is not synchronised with any other chart.
			return noop;
		}
		const listener = (incomingSyncId, action, emitter) => {
			if (myEventEmitter === emitter) {
				// We don't want to dispatch actions that we sent ourselves.
				return;
			}
			if (mySyncId !== incomingSyncId) {
				// This event is not for this chart
				return;
			}
			// Source chart deactivation (mouseLeave) clears sourceViewBox for ALL
			// sync methods, letting normal emission resume.
			if (action.payload.active === false) {
				dispatch(
					setSyncInteraction({
						active: false,
						coordinate: undefined,
						dataKey: undefined,
						index: null,
						label: undefined,
						sourceViewBox: undefined,
						graphicalItemId: undefined,
					}),
				);
				return;
			}
			if (syncMethod === 'index') {
				if (viewBox && action?.payload?.coordinate && action.payload.sourceViewBox) {
					const { x, y, ...otherCoordinateProps } = action.payload.coordinate;
					const {
						x: sourceX,
						y: sourceY,
						width: sourceWidth,
						height: sourceHeight,
					} = action.payload.sourceViewBox;
					const scaledCoordinate = {
						...otherCoordinateProps,
						x: viewBox.x + (sourceWidth ? (x - sourceX) / sourceWidth : 0) * viewBox.width,
						y: viewBox.y + (sourceHeight ? (y - sourceY) / sourceHeight : 0) * viewBox.height,
					};
					dispatch({
						...action,
						payload: { ...action.payload, coordinate: scaledCoordinate },
					});
				} else {
					dispatch(action);
				}
				return;
			}
			if (tooltipTicks == null) {
				// for the other two sync methods, we need the ticks to be available
				return;
			}
			let activeTick;
			if (typeof syncMethod === 'function') {
				// The 2.x CategoricalChartState data shape, kept for compatibility.
				const syncMethodParam = {
					activeTooltipIndex: action.payload.index == null
						? undefined
						: Number(action.payload.index),
					isTooltipActive: action.payload.active,
					activeIndex: action.payload.index == null ? undefined : Number(action.payload.index),
					activeLabel: action.payload.label,
					activeDataKey: action.payload.dataKey,
					activeCoordinate: action.payload.coordinate,
				};
				const activeTooltipIndex = syncMethod(tooltipTicks, syncMethodParam);
				activeTick = tooltipTicks[activeTooltipIndex];
			} else if (syncMethod === 'value') {
				// labels are always strings; tick.value might be string or number
				activeTick = tooltipTicks.find((tick) => String(tick.value) === action.payload.label);
			}
			const { coordinate } = action.payload;
			if (coordinate == null || viewBox == null) {
				dispatch(
					setSyncInteraction({
						active: false,
						coordinate: undefined,
						dataKey: undefined,
						index: null,
						label: undefined,
						sourceViewBox: undefined,
						graphicalItemId: undefined,
					}),
				);
				return;
			}
			if (activeTick == null) {
				// No matching tick (sparse data): hide the tooltip but KEEP
				// sourceViewBox so this chart stays in "receiving" mode and does not
				// emit a counter-sync that would cascade-clear other charts.
				dispatch(
					setSyncInteraction({
						active: false,
						coordinate: undefined,
						dataKey: undefined,
						index: null,
						label: undefined,
						sourceViewBox: action.payload.sourceViewBox,
						graphicalItemId: undefined,
					}),
				);
				return;
			}
			const { x, y } = coordinate;
			const validateChartX = Math.min(x, viewBox.x + viewBox.width);
			const validateChartY = Math.min(y, viewBox.y + viewBox.height);
			const activeCoordinate = {
				x: layout === 'horizontal' ? activeTick.coordinate : validateChartX,
				y: layout === 'horizontal' ? validateChartY : activeTick.coordinate,
			};
			const syncAction = setSyncInteraction({
				active: action.payload.active,
				coordinate: activeCoordinate,
				dataKey: action.payload.dataKey,
				index: String(activeTick.index),
				label: action.payload.label,
				sourceViewBox: action.payload.sourceViewBox,
				graphicalItemId: action.payload.graphicalItemId,
			});
			dispatch(syncAction);
		};
		eventCenter.on(TOOLTIP_SYNC_EVENT, listener);
		return () => {
			eventCenter.off(TOOLTIP_SYNC_EVENT, listener);
		};
	}, [className, dispatch, myEventEmitter, mySyncId, syncMethod, tooltipTicks, layout, viewBox]);
}

/**
 * Listens for brush sync events from other charts and mirrors their data
 * start/end indexes.
 */
function useBrushSyncEventsListener() {
	const mySyncId = useAppSelector(selectSyncId);
	const myEventEmitter = useAppSelector(selectEventEmitter);
	const dispatch = useAppDispatch();
	useEffect(() => {
		if (mySyncId == null) {
			return noop;
		}
		const listener = (incomingSyncId, action, emitter) => {
			if (myEventEmitter === emitter) {
				return;
			}
			if (mySyncId === incomingSyncId) {
				dispatch(setDataStartEndIndexes(action));
			}
		};
		eventCenter.on(BRUSH_SYNC_EVENT, listener);
		return () => {
			eventCenter.off(BRUSH_SYNC_EVENT, listener);
		};
	}, [dispatch, myEventEmitter, mySyncId]);
}

/** Receives synchronisation events from other charts. */
export function useSynchronisedEventsFromOtherCharts() {
	const dispatch = useAppDispatch();
	useEffect(() => {
		dispatch(createEventEmitter());
	}, [dispatch]);
	useTooltipSyncEventsListener();
	useBrushSyncEventsListener();
}

/**
 * Sends tooltip sync events to other charts. Emission is suppressed while
 * `sourceViewBox` is present in the sync state (this chart is receiving),
 * which prevents sparse-data charts from cascade-clearing other tooltips.
 */
export function useTooltipChartSynchronisation(
	tooltipEventType,
	trigger,
	activeCoordinate,
	activeLabel,
	activeIndex,
	isTooltipActive,
) {
	const activeDataKey = useAppSelector(
		(state) => selectTooltipDataKey(state, tooltipEventType, trigger),
	);
	const activeGraphicalItemId = useAppSelector(selectActiveTooltipGraphicalItemId);
	const eventEmitterSymbol = useAppSelector(selectEventEmitter);
	const syncId = useAppSelector(selectSyncId);
	const syncMethod = useAppSelector(selectSyncMethod);
	const tooltipState = useAppSelector(selectSynchronisedTooltipState);
	const isReceivingSynchronisation = tooltipState?.sourceViewBox != null;
	const viewBox = useViewBox();
	useEffect(() => {
		if (isReceivingSynchronisation) {
			return;
		}
		if (syncId == null) {
			return;
		}
		if (eventEmitterSymbol == null) {
			// Hooks used outside a chart context — return silently.
			return;
		}
		const syncAction = setSyncInteraction({
			active: isTooltipActive,
			coordinate: activeCoordinate,
			dataKey: activeDataKey,
			index: activeIndex,
			label: typeof activeLabel === 'number' ? String(activeLabel) : activeLabel,
			sourceViewBox: viewBox,
			graphicalItemId: activeGraphicalItemId,
		});
		eventCenter.emit(TOOLTIP_SYNC_EVENT, syncId, syncAction, eventEmitterSymbol);
	}, [
		isReceivingSynchronisation,
		activeCoordinate,
		activeDataKey,
		activeGraphicalItemId,
		activeIndex,
		activeLabel,
		eventEmitterSymbol,
		syncId,
		syncMethod,
		isTooltipActive,
		viewBox,
	]);
}

/** Emits brush sync events when the brush start/end indexes change. */
export function useBrushChartSynchronisation() {
	const syncId = useAppSelector(selectSyncId);
	const eventEmitterSymbol = useAppSelector(selectEventEmitter);
	const brushStartIndex = useAppSelector((state) => state.chartData.dataStartIndex);
	const brushEndIndex = useAppSelector((state) => state.chartData.dataEndIndex);
	useEffect(() => {
		if (
			syncId == null || brushStartIndex == null || brushEndIndex == null ||
				eventEmitterSymbol == null
		) {
			return;
		}
		const syncAction = { startIndex: brushStartIndex, endIndex: brushEndIndex };
		eventCenter.emit(BRUSH_SYNC_EVENT, syncId, syncAction, eventEmitterSymbol);
	}, [brushEndIndex, brushStartIndex, eventEmitterSymbol, syncId]);
}
