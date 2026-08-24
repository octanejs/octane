// Adapted from recharts@3.9.2, commit b3451050c027a23957ffa50a2665c9119df21e47.
import {
	Action,
	autoBatchEnhancer,
	combineReducers,
	configureStore,
	Dispatch,
	Store,
} from '@reduxjs/toolkit';
import { optionsReducer } from './optionsSlice';
import { tooltipReducer } from './tooltipSlice';
import { chartDataReducer } from './chartDataSlice';
import { chartLayoutReducer } from './layoutSlice';
import { mouseClickMiddleware, mouseMoveMiddleware } from './mouseEventsMiddleware';
import { reduxDevtoolsJsonStringifyReplacer } from './reduxDevtoolsJsonStringifyReplacer';
import { cartesianAxisReducer } from './cartesianAxisSlice';
import { graphicalItemsReducer } from './graphicalItemsSlice';
import { referenceElementsReducer } from './referenceElementsSlice';
import { brushReducer } from './brushSlice';
import { legendReducer } from './legendSlice';
import { rootPropsReducer } from './rootPropsSlice';
import { polarAxisReducer } from './polarAxisSlice';
import { polarOptionsReducer } from './polarOptionsSlice';
import { keyboardEventsMiddleware } from './keyboardEventsMiddleware';
import { externalEventsMiddleware } from './externalEventsMiddleware';
import { touchEventMiddleware } from './touchEventsMiddleware';
import { errorBarReducer } from './errorBarSlice';
import { Global } from '../util/Global';
import { zIndexReducer } from './zIndexSlice';
import { eventSettingsReducer } from './eventSettingsSlice';
import { renderedTicksReducer } from './renderedTicksSlice';

export type RechartsRootState = {
	brush: ReturnType<typeof brushReducer>;
	cartesianAxis: ReturnType<typeof cartesianAxisReducer>;
	chartData: ReturnType<typeof chartDataReducer>;
	errorBars: ReturnType<typeof errorBarReducer>;
	eventSettings: ReturnType<typeof eventSettingsReducer>;
	graphicalItems: ReturnType<typeof graphicalItemsReducer>;
	layout: ReturnType<typeof chartLayoutReducer>;
	legend: ReturnType<typeof legendReducer>;
	options: ReturnType<typeof optionsReducer>;
	polarAxis: ReturnType<typeof polarAxisReducer>;
	polarOptions: ReturnType<typeof polarOptionsReducer>;
	referenceElements: ReturnType<typeof referenceElementsReducer>;
	renderedTicks: ReturnType<typeof renderedTicksReducer>;
	rootProps: ReturnType<typeof rootPropsReducer>;
	tooltip: ReturnType<typeof tooltipReducer>;
	zIndex: ReturnType<typeof zIndexReducer>;
};

const rootReducer = combineReducers({
	brush: brushReducer,
	cartesianAxis: cartesianAxisReducer,
	chartData: chartDataReducer,
	errorBars: errorBarReducer,
	eventSettings: eventSettingsReducer,
	graphicalItems: graphicalItemsReducer,
	layout: chartLayoutReducer,
	legend: legendReducer,
	options: optionsReducer,
	polarAxis: polarAxisReducer,
	polarOptions: polarOptionsReducer,
	referenceElements: referenceElementsReducer,
	renderedTicks: renderedTicksReducer,
	rootProps: rootPropsReducer,
	tooltip: tooltipReducer,
	zIndex: zIndexReducer,
});

export const createRechartsStore = (
	preloadedState?: Partial<RechartsRootState>,
	chartName: string = 'Chart',
): Store<RechartsRootState> => {
	return configureStore({
		reducer: rootReducer,
		preloadedState: preloadedState,
		middleware: (getDefaultMiddleware) =>
			getDefaultMiddleware({
				serializableCheck: false,
				immutableCheck: false,
			}).concat([
				mouseClickMiddleware.middleware,
				mouseMoveMiddleware.middleware,
				keyboardEventsMiddleware.middleware,
				externalEventsMiddleware.middleware,
				touchEventMiddleware.middleware,
			]),
		enhancers: (getDefaultEnhancers) => {
			let enhancers: typeof getDefaultEnhancers | ReturnType<typeof getDefaultEnhancers> =
				getDefaultEnhancers;
			if (typeof getDefaultEnhancers === 'function') {
				enhancers = getDefaultEnhancers();
			}
			// RTK 2 supplies a callback; the retained legacy branch accepts its array.
			return (enhancers as ReturnType<typeof getDefaultEnhancers>).concat(
				autoBatchEnhancer({
					type: 'raf',
				}),
			);
		},
		devTools: Global.devToolsEnabled && {
			serialize: {
				replacer: reduxDevtoolsJsonStringifyReplacer,
			},
			name: `recharts-${chartName}`,
		},
	});
};

export type AppDispatch = Dispatch<Action>;
